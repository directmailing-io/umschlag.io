const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const https = require("https");
const http = require("http");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const MM_TO_PT = 2.83465;

const FORMATS = {
    C4: {
        width: 324 * MM_TO_PT,
        height: 229 * MM_TO_PT,
        recipientX: 180 * MM_TO_PT,
        recipientY: 130 * MM_TO_PT,
        fontSize: 14
    },
    DIN_LANG: {
        width: 220 * MM_TO_PT,
        height: 110 * MM_TO_PT,
        recipientX: 110 * MM_TO_PT,
        recipientY: 55 * MM_TO_PT,
        fontSize: 11
    }
};

/* ---------- Absender JSON DB ---------- */

const DATA_DIR = path.join(__dirname, "data");
const SENDERS_FILE = path.join(DATA_DIR, "senders.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(SENDERS_FILE)) fs.writeFileSync(SENDERS_FILE, "[]");

function readSenders() {
    return JSON.parse(fs.readFileSync(SENDERS_FILE, "utf8"));
}

function saveSenders(data) {
    fs.writeFileSync(SENDERS_FILE, JSON.stringify(data, null, 2));
}

/* ---------- Google Sheets Helper ---------- */

function fetchUrl(url, maxRedirects = 10) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith("https") ? https : http;
        const req = protocol.get(url, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                const location = res.headers.location;
                res.resume();
                if (!location) {
                    reject(new Error("Weiterleitung ohne Zieladresse"));
                    return;
                }
                if (location.includes("accounts.google.com") || location.includes("signin.google")) {
                    reject(new Error(
                        "Kein Zugriff: Die Tabelle ist nicht öffentlich geteilt. " +
                        "Bitte in Google Sheets auf \"Teilen\" klicken und " +
                        "\"Jeder mit dem Link kann anzeigen\" aktivieren."
                    ));
                    return;
                }
                if (maxRedirects === 0) {
                    reject(new Error("Zu viele Weiterleitungen – Tabelle nicht erreichbar"));
                    return;
                }
                fetchUrl(location, maxRedirects - 1).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP-Fehler ${res.statusCode}: Tabelle nicht erreichbar`));
                return;
            }
            resolve(res);
        });
        req.on("error", reject);
    });
}

async function loadFromGoogleSheets(url) {
    const idMatch = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) {
        throw new Error(
            "Ungültige Google Sheets URL. " +
            "Bitte kopieren Sie die URL direkt aus Ihrem Browser."
        );
    }

    const spreadsheetId = idMatch[1];
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";

    const csvUrl =
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}` +
        `/export?format=csv&gid=${gid}`;

    const response = await fetchUrl(csvUrl);

    const workbook = new ExcelJS.Workbook();
    await workbook.csv.read(response);
    return workbook;
}

/* ---------- Conditions Helper ---------- */

function applyConditions(value, fieldRule) {
    if (!fieldRule || !fieldRule.rules || fieldRule.rules.length === 0) return value;

    const lowerValue = value.toLowerCase();

    for (const rule of fieldRule.rules) {
        if (!rule.when) continue;
        const lowerWhen = rule.when.toLowerCase();
        let match = false;

        switch (rule.operator) {
            case "equals":     match = lowerValue === lowerWhen; break;
            case "contains":   match = lowerValue.includes(lowerWhen); break;
            case "startsWith": match = lowerValue.startsWith(lowerWhen); break;
            case "endsWith":   match = lowerValue.endsWith(lowerWhen); break;
            default:           match = lowerValue === lowerWhen;
        }

        if (match) return rule.then !== undefined ? rule.then : "";
    }

    // No condition matched
    return fieldRule.useDefault ? (fieldRule.default || "") : value;
}

/* ---------- PDF Generator ---------- */

app.post("/generate", upload.single("file"), async (req, res) => {
    try {
        const {
            sender1, sender2, sender3,
            format, filename,
            googleSheetsUrl,
            conditions: conditionsJson
        } = req.body;

        const FORMAT = FORMATS[format] || FORMATS.C4;

        // Parse conditions into a lookup map { fieldName: ruleObject }
        let conditionsMap = {};
        if (conditionsJson) {
            try {
                const arr = JSON.parse(conditionsJson);
                arr.forEach(c => { if (c.field) conditionsMap[c.field] = c; });
            } catch (_) { /* ignore malformed conditions */ }
        }

        // Load data source
        let workbook;
        if (googleSheetsUrl) {
            workbook = await loadFromGoogleSheets(googleSheetsUrl);
        } else if (req.file) {
            workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(req.file.path);
        } else {
            return res.status(400).json({ error: "Keine Datenquelle angegeben" });
        }

        const safeFilename = (filename || "umschlaege")
            .replace(/[^a-z0-9-_]/gi, "_")
            .toLowerCase();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=${safeFilename}.pdf`);

        const doc = new PDFDocument({ size: [FORMAT.width, FORMAT.height], margin: 0 });
        doc.pipe(res);
        doc.font("Helvetica").fontSize(FORMAT.fontSize);

        const SENDER = [sender1, sender2, sender3].filter(Boolean);

        workbook.worksheets.forEach(sheet => {
            const headerRow = sheet.getRow(1);
            const headerMap = {};

            headerRow.eachCell((cell, col) => {
                if (cell.value) headerMap[cell.value.toString().toLowerCase()] = col;
            });

            let first = true;

            sheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;

                if (!first) doc.addPage();
                first = false;

                const get = name => {
                    const col = headerMap[name];
                    if (!col) return "";
                    const val = row.getCell(col).value;
                    const raw = val ? val.toString() : "";
                    return applyConditions(raw, conditionsMap[name]);
                };

                // Build person line cleanly (avoid lone "z. Hd.")
                const personName = [get("vorname"), get("nachname")]
                    .filter(Boolean).join(" ");

                const recipientLines = [
                    personName ? "z. Hd. " + personName : "",
                    get("firma"),
                    get("strae"),
                    [get("plz"), get("stadt")].filter(Boolean).join(" "),
                    get("land")
                ].filter(Boolean);

                doc.text(SENDER.join("\n"), 7 * MM_TO_PT, 7 * MM_TO_PT, {
                    width: 90 * MM_TO_PT
                });

                doc.text(
                    recipientLines.join("\n"),
                    FORMAT.recipientX,
                    FORMAT.recipientY,
                    { width: 90 * MM_TO_PT }
                );
            });
        });

        doc.end();

        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
    } catch (err) {
        if (req.file) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

/* ---------- Absender API ---------- */

app.get("/senders", (req, res) => {
    res.json(readSenders());
});

app.post("/senders", (req, res) => {
    const { line1, line2, line3 } = req.body;
    const senders = readSenders();
    senders.push({ id: Date.now(), line1, line2, line3 });
    saveSenders(senders);
    res.json({ success: true });
});

app.delete("/senders/:id", (req, res) => {
    const id = Number(req.params.id);
    const filtered = readSenders().filter(s => s.id !== id);
    saveSenders(filtered);
    res.json({ success: true });
});

/* ---------- Server ---------- */

app.listen(4000, () => {
    console.log("Backend läuft auf http://localhost:4000");
});
