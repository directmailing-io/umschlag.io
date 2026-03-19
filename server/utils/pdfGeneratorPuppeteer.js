/**
 * Puppeteer-based PDF generator for templates using LiebeHeide-Color (COLR/CPAL font).
 * Renders all envelopes in batches of BATCH_SIZE using a single page.pdf() call per batch,
 * then merges batches via pdf-lib. This is dramatically faster than one screenshot per envelope.
 */
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

const SIZES = {
  DIN_LANG: { width: 220, height: 110 },
  C4:       { width: 324, height: 229 },
  C5:       { width: 229, height: 162 },
  C6:       { width: 162, height: 114 },
};

// Envelopes per Puppeteer pdf() call — keeps Chrome memory stable
const BATCH_SIZE = 150;

function applyConditions(value, rule) {
  if (!rule || !rule.rules || rule.rules.length === 0) return value;
  const lv = value.toLowerCase();
  for (const r of rule.rules) {
    if (!r.when) continue;
    const lw = r.when.toLowerCase();
    let match = false;
    switch (r.operator) {
      case "equals":     match = lv === lw; break;
      case "contains":   match = lv.includes(lw); break;
      case "startsWith": match = lv.startsWith(lw); break;
      case "endsWith":   match = lv.endsWith(lw); break;
      default:           match = lv === lw;
    }
    if (match) return r.then ?? "";
  }
  return rule.useDefault ? (rule.default || "") : value;
}

function resolveContent(content, recipient, mapping, conditions = {}) {
  if (!content) return "";
  return content.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const k   = key.trim();
    const col = mapping[k];
    const raw = col ? String(recipient[col] ?? "") : "";
    return applyConditions(raw, conditions[k]);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBatchHtml(batch, fields, mapping, conditions, W, H) {
  const port = process.env.PORT || 5656;
  const fontFaceCSS = [
    `@font-face { font-family: 'LiebeHeide'; src: url('http://localhost:${port}/fonts/LiebeHeide-Color.otf') format('opentype'); font-display: block; }`,
    `@font-face { font-family: 'LiebeHeideFineliner'; src: url('http://localhost:${port}/fonts/LiebeHeideVector-FinelinerRegular.otf') format('opentype'); font-display: block; }`,
    `@font-face { font-family: 'BiroScript'; src: url('http://localhost:${port}/fonts/biro_script_plus.ttf') format('truetype'); font-display: block; }`,
  ].join("\n");

  const pages = batch.map((recipient, idx) => {
    const isLast = idx === batch.length - 1;
    const fieldDivs = fields.map(field => {
      let text = "";
      if (field.content !== undefined) {
        text = resolveContent(field.content, recipient, mapping, conditions);
      } else if (field.isPlaceholder) {
        const col = mapping[field.label];
        const raw = col ? String(recipient[col] ?? "") : "";
        text = applyConditions(raw, conditions[field.label]);
      } else {
        text = field.staticText || field.label || "";
      }
      text = text.trim();
      if (!text) return "";

      const fsMm     = (field.fontSize * 25.4) / 72;
      const leftMm   = (field.x     / 100) * W;
      const topMm    = (field.y     / 100) * H;
      const widthMm  = (field.width / 100) * W;

      return `<div style="position:absolute;left:${leftMm}mm;top:${topMm}mm;width:${widthMm}mm;font-family:'${field.font}',Arial,sans-serif;font-size:${fsMm}mm;line-height:${field.lineHeight};color:${field.color || "#000"};overflow-wrap:break-word;word-break:break-word;white-space:pre-wrap;box-sizing:border-box;">${escapeHtml(text)}</div>`;
    }).join("");

    return `<div style="position:relative;width:${W}mm;height:${H}mm;overflow:hidden;background:white;${isLast ? "" : "page-break-after:always;"}">${fieldDivs}</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<style>
${fontFaceCSS}
@page { size: ${W}mm ${H}mm; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { margin: 0; padding: 0; width: ${W}mm; background: white; }
</style></head>
<body>${pages}</body></html>`;
}

export async function generatePdfPuppeteer(recipients, template, mapping, conditions, onProgress) {
  const { format = "DIN_LANG", fields = [] } = template;
  const { width: W, height: H } = SIZES[format] || SIZES.DIN_LANG;

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : undefined);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const masterDoc = await PDFDocument.create();

  try {
    const chromePage = await browser.newPage();

    for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
      const batch = recipients.slice(start, start + BATCH_SIZE);
      const html  = buildBatchHtml(batch, fields, mapping, conditions, W, H);

      await chromePage.setContent(html, { waitUntil: "load", timeout: 120000 });
      // Give color font (LiebeHeide COLR) time to render
      await new Promise((r) => setTimeout(r, 600));

      const pdfBytes = await chromePage.pdf({
        width:           `${W}mm`,
        height:          `${H}mm`,
        printBackground: true,
        margin:          { top: "0", right: "0", bottom: "0", left: "0" },
      });

      // Merge batch into master PDF
      const batchDoc = await PDFDocument.load(pdfBytes);
      const copied   = await masterDoc.copyPages(batchDoc, batchDoc.getPageIndices());
      copied.forEach((p) => masterDoc.addPage(p));

      onProgress?.(Math.min(start + batch.length, recipients.length), recipients.length);
    }

    return Buffer.from(await masterDoc.save());
  } finally {
    await browser.close();
  }
}
