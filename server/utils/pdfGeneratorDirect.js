/**
 * Fast PDF generator using pdf-lib directly — no Puppeteer needed.
 * Used for all templates that do NOT contain LiebeHeide-Color font fields.
 * Handles BiroScript + LiebeHeideFineliner as embedded vector fonts.
 * Falls back to Helvetica for standard web fonts (Inter, Arial, Roboto, etc.)
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dirname, "..", "fonts");

const PT_PER_MM = 72 / 25.4;

const SIZES = {
  DIN_LANG: { width: 220, height: 110 },
  C4:       { width: 324, height: 229 },
  C5:       { width: 229, height: 162 },
  C6:       { width: 162, height: 114 },
};

// Map font names to files on disk
const FONT_FILES = {
  LiebeHeideFineliner: "LiebeHeideVector-FinelinerRegular.otf",
  BiroScript:          "biro_script_plus.ttf",
};

// File-level cache so we read each font file only once per process
const fontBytesCache = new Map();
function getFontBytes(filename) {
  if (!fontBytesCache.has(filename)) {
    const p = path.join(FONTS_DIR, filename);
    fontBytesCache.set(filename, fs.existsSync(p) ? fs.readFileSync(p) : null);
  }
  return fontBytesCache.get(filename);
}

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

// NFD-decompose → strip combining diacritics → strip remaining non-Latin-1
// Needed for StandardFonts.Helvetica (WinAnsi encoding, max U+00FF)
function sanitizeWinAnsi(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\xff]/g, "");
}

function hexToRgb(hex) {
  const h = (hex || "#000000").replace("#", "").padEnd(6, "0");
  return rgb(
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  );
}

// Simple word-wrap: splits text into lines that fit within maxWidthPt
function wrapText(font, text, fontSizePt, maxWidthPt) {
  const lines = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(test, fontSizePt) > maxWidthPt) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function generatePdfDirect(recipients, template, mapping, conditions, onProgress) {
  const { format = "DIN_LANG", fields = [] } = template;
  const { width: W, height: H } = SIZES[format] || SIZES.DIN_LANG;
  const W_pt = W * PT_PER_MM;
  const H_pt = H * PT_PER_MM;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Pre-embed every font used in this template (once per document)
  const embeddedFonts   = new Map();
  const standardFontKeys = new Set(); // tracks keys that use WinAnsi Helvetica fallback
  for (const field of fields) {
    const name = field.font || "LiebeHeide";
    if (embeddedFonts.has(name)) continue;
    const filename = FONT_FILES[name];
    if (filename) {
      const bytes = getFontBytes(filename);
      if (bytes) {
        embeddedFonts.set(name, await pdfDoc.embedFont(bytes));
        continue;
      }
    }
    // Fallback: Helvetica (WinAnsi — cannot encode chars outside Latin-1)
    embeddedFonts.set(name, await pdfDoc.embedFont(StandardFonts.Helvetica));
    standardFontKeys.add(name);
  }

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const page = pdfDoc.addPage([W_pt, H_pt]);

    for (const field of fields) {
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
      if (!text) continue;

      const font        = embeddedFonts.get(field.font || "LiebeHeide");
      const fontSizePt  = field.fontSize || 22;
      const lineHtPt    = fontSizePt * (field.lineHeight || 1.3);
      const color       = hexToRgb(field.color);
      const xPt         = (field.x     / 100) * W_pt;
      const maxWidthPt  = (field.width / 100) * W_pt;
      const yTopPt      = (field.y     / 100) * H_pt;

      // Sanitize for WinAnsi fonts to prevent encoding errors on special chars (e.g. ć, ü)
      const safeText = standardFontKeys.has(field.font || "LiebeHeide")
        ? sanitizeWinAnsi(text)
        : text;
      const lines = wrapText(font, safeText, fontSizePt, maxWidthPt);
      for (let li = 0; li < lines.length; li++) {
        // pdf-lib: origin bottom-left, y increases upward
        const yPt = H_pt - yTopPt - fontSizePt - li * lineHtPt;
        if (yPt < 0) break;
        page.drawText(lines[li], { x: xPt, y: yPt, size: fontSizePt, font, color });
      }
    }

    onProgress?.(i + 1, recipients.length);
  }

  return Buffer.from(await pdfDoc.save());
}
