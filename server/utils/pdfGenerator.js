import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { PDFDocument } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "fonts");

const SIZES = {
  DIN_LANG: { width: 220, height: 110 },
  C4:       { width: 324, height: 229 },
  C5:       { width: 229, height: 162 },
  C6:       { width: 162, height: 114 },
};

const FONT_FILES = {
  LiebeHeide:          { file: "LiebeHeide-Color.otf",                  format: "opentype" },
  LiebeHeideFineliner: { file: "LiebeHeideVector-FinelinerRegular.otf", format: "opentype" },
  BiroScript:          { file: "biro_script_plus.ttf",                  format: "truetype" },
};

function buildFontFaceCSS() {
  return Object.entries(FONT_FILES)
    .map(([name, { file, format }]) => {
      const filePath = path.join(FONTS_DIR, file);
      if (!fs.existsSync(filePath)) return "";
      const b64 = fs.readFileSync(filePath).toString("base64");
      const mime = format === "opentype" ? "font/otf" : "font/ttf";
      return `@font-face { font-family: '${name}'; src: url('data:${mime};base64,${b64}') format('${format}'); font-display: block; }`;
    })
    .join("\n");
}

function resolveContent(content, recipient, mapping) {
  if (!content) return "";
  return content.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const trimmed = key.trim();
    const col = mapping[trimmed];
    return col ? String(recipient[col] ?? "") : "";
  });
}

// px per mm at 96 dpi
const PX_PER_MM = 3.7795275591;
// pt per mm (PDF points: 1pt = 1/72 inch, 1mm = 72/25.4 pt)
const PT_PER_MM = 72 / 25.4;
// Render resolution multiplier: 4× = ~384 dpi → very sharp color fonts
const RENDER_SCALE = 4;

function buildEnvelopeHtml(recipient, fields, mapping, W, H, fontFaceCSS) {
  // We render at CSS pixels (1px = 1/96 inch). The viewport is set to
  // exactly W×H mm in CSS pixels, and deviceScaleFactor=RENDER_SCALE gives
  // us RENDER_SCALE× more physical pixels for the screenshot.
  const vpW = Math.ceil(W * PX_PER_MM);
  const vpH = Math.ceil(H * PX_PER_MM);

  const fieldDivs = fields
    .map((field) => {
      let text = "";
      if (field.content !== undefined) {
        text = resolveContent(field.content, recipient, mapping);
      } else if (field.isPlaceholder) {
        const col = mapping[field.label];
        text = col ? String(recipient[col] ?? "") : "";
      } else {
        text = field.staticText || field.label || "";
      }
      text = text.trim();
      if (!text) return "";

      const color   = field.color || "#000000";
      const font    = `'${field.font}', Arial, sans-serif`;
      // pt → px at 96 dpi: 1pt = 96/72 px = 1.3333px
      const fsPx    = (field.fontSize * 96) / 72;
      const leftPx  = (field.x     / 100) * vpW;
      const topPx   = (field.y     / 100) * vpH;
      const widthPx = (field.width / 100) * vpW;

      return `<div style="position:absolute;left:${leftPx}px;top:${topPx}px;width:${widthPx}px;font-family:${font};font-size:${fsPx}px;line-height:${field.lineHeight};color:${color};overflow-wrap:break-word;word-break:break-word;white-space:pre-wrap;box-sizing:border-box;">${escapeHtml(text)}</div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
${fontFaceCSS}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { margin: 0; padding: 0; width: ${vpW}px; height: ${vpH}px; overflow: hidden; background: white; }
</style>
</head>
<body>
<div style="position:relative;width:${vpW}px;height:${vpH}px;overflow:hidden;background:white;">
  ${fieldDivs}
</div>
</body>
</html>`;
}

export async function generateEnvelopePDF(recipients, template, mapping, onProgress) {
  const { format = "DIN_LANG", fields = [] } = template;
  const size = SIZES[format] || SIZES.DIN_LANG;
  const { width: W, height: H } = size;

  const fontFaceCSS = buildFontFaceCSS();
  const vpW = Math.ceil(W * PX_PER_MM);
  const vpH = Math.ceil(H * PX_PER_MM);

  // On macOS (local dev): use installed Chrome.
  // On Linux (Railway/server): use Puppeteer's bundled Chromium (executablePath = undefined).
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

  try {
    const chromePage = await browser.newPage();
    // Set viewport to envelope size at high DPI → RENDER_SCALE× more pixels
    await chromePage.setViewport({
      width:  vpW,
      height: vpH,
      deviceScaleFactor: RENDER_SCALE,
    });

    const pdfDoc = await PDFDocument.create();
    const pageW = W * PT_PER_MM;
    const pageH = H * PT_PER_MM;

    for (let i = 0; i < recipients.length; i++) {
      const html = buildEnvelopeHtml(recipients[i], fields, mapping, W, H, fontFaceCSS);
      await chromePage.setContent(html, { waitUntil: "load", timeout: 30000 });
      // Wait for color fonts to fully render
      await new Promise((r) => setTimeout(r, 400));

      const screenshot = await chromePage.screenshot({ type: "png" });

      const pngImage = await pdfDoc.embedPng(screenshot);
      const pdfPage  = pdfDoc.addPage([pageW, pageH]);
      // pdf-lib origin is bottom-left; draw image to fill the whole page
      pdfPage.drawImage(pngImage, { x: 0, y: 0, width: pageW, height: pageH });

      onProgress?.(i + 1, recipients.length);
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
