import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

function RecipientUploader({ onData }) {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);

  // CSV Datei
  async function handleCSVFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => onData(result.data)
    });
  }

  // Excel Datei
  async function handleExcelFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    onData(json);
  }

  // Google Sheets → JSON vom Server laden
  async function handleGoogleSheet() {
    if (!link.trim()) {
      alert("Bitte einen Google Sheets Link eingeben");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `http://localhost:5656/api/sheets/load?url=${encodeURIComponent(link)}`
      );

      if (!res.ok) {
        alert("Google Sheet konnte nicht geladen werden");
        setLoading(false);
        return;
      }

      const records = await res.json(); // <-- WICHTIG: JSON, NICHT CSV

      onData(records);
    } catch (err) {
      console.error(err);
      alert("Fehler beim Laden des Google Sheets");
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        background: "#fff",
        padding: 16,
        borderRadius: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        maxWidth: 480,
        width: "100%"
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Empfänger importieren</h2>

      {/* GOOGLE SHEETS */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 14 }}>Google Sheets Link</label>
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://docs.google.com/..."
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #ddd"
          }}
        />

        <button
          onClick={handleGoogleSheet}
          disabled={loading}
          style={{
            padding: 10,
            borderRadius: 8,
            border: "none",
            background: loading ? "#999" : "#1f7ae0",
            color: "#fff",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer"
          }}
        >
          {loading ? "Lädt..." : "Laden"}
        </button>
      </div>

      {/* CSV */}
      <div>
        <label style={{ fontSize: 14 }}>CSV Datei</label>
        <input type="file" accept=".csv" onChange={handleCSVFile} />
      </div>

      {/* EXCEL */}
      <div>
        <label style={{ fontSize: 14 }}>Excel Datei</label>
        <input type="file" accept=".xls,.xlsx" onChange={handleExcelFile} />
      </div>
    </div>
  );
}

export default RecipientUploader;
