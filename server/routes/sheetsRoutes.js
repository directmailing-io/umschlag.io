import express from "express";
import { parse } from "csv-parse/sync";

const router = express.Router();

router.get("/load", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: "No URL provided" });
    }

    // 1. Sheets ID extrahieren
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return res.status(400).json({ error: "Invalid Google Sheets URL" });
    }
    const sheetId = match[1];

    // 2. Saubere CSV Export URL erzeugen
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    // 3. CSV laden (Node 20: fetch ist nativ)
    const response = await fetch(csvUrl);

    if (!response.ok) {
      return res.status(500).json({ error: "Google returned an error" });
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      return res.status(500).json({
        error: "Google Sheets returned HTML instead of CSV. Make sure the sheet is public."
      });
    }

    const text = await response.text();

    // 4. CSV → JSON
    let records = [];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true
      });
    } catch (e) {
      return res.status(500).json({
        error: "CSV parsing failed",
        details: e.message
      });
    }

    return res.json(records);

  } catch (err) {
    console.error("Sheets Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/sheets/xlsx?url=... — returns raw XLSX bytes so the client can parse all sheets
router.get("/xlsx", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Keine URL angegeben" });

    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) return res.status(400).json({ error: "Ungültige Google Sheets URL" });

    const sheetId = match[1];
    const xlsxUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;

    const response = await fetch(xlsxUrl);
    const ct = response.headers.get("content-type") || "";

    if (!response.ok || ct.includes("text/html")) {
      return res.status(400).json({
        error: "Tabelle nicht zugänglich. Bitte stelle sicher, dass die Tabelle öffentlich geteilt ist (Ansicht für alle mit Link).",
      });
    }

    const buf = await response.arrayBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error("Sheets XLSX Error:", err);
    res.status(500).json({ error: "Serverfehler beim Laden der Tabelle" });
  }
});

export default router;
