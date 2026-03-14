// client/src/components/PdfTest.jsx
import { useEffect, useMemo, useState } from "react";

function PdfTest({ templates, recipients }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(false);

  const hasTemplates = templates && templates.length > 0;

  useEffect(() => {
    if (hasTemplates && !selectedTemplateId) {
      setSelectedTemplateId(templates[0]._id);
    }
  }, [hasTemplates, templates, selectedTemplateId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t._id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const fields = selectedTemplate?.layout?.fields || [];

  const columns = useMemo(() => {
    if (!recipients || recipients.length === 0) return [];
    const keys = Object.keys(recipients[0] || {});
    return keys.filter((k) => !k.startsWith("_")); // _internalId raus
  }, [recipients]);

  function toggleRecipient(rec) {
    setSelectedRecipients((prev) => {
      const exists = prev.find((r) => r._internalId === rec._internalId);
      if (exists) {
        return prev.filter((r) => r._internalId !== rec._internalId);
      }
      return [...prev, rec];
    });
  }

  function updateMapping(fieldId, col) {
    setMapping((prev) => ({
      ...prev,
      [fieldId]: col || ""
    }));
  }

  async function handleGenerate() {
    if (!selectedTemplate) {
      alert("Bitte zuerst eine Vorlage auswählen");
      return;
    }

    if (!recipients || recipients.length === 0) {
      alert("Bitte zuerst Empfänger importieren");
      return;
    }

    if (selectedRecipients.length === 0) {
      alert("Bitte mindestens einen Empfänger auswählen");
      return;
    }

    if (fields.length === 0) {
      alert("Die Vorlage enthält keine Textfelder");
      return;
    }

    const missing = fields.filter((f) => !mapping[f.id]);
    if (missing.length > 0) {
      alert("Bitte alle Felder einer Spalte zuordnen");
      return;
    }

    const payload = {
      recipients: selectedRecipients,
      template: {
        font: selectedTemplate.font,
        layout: selectedTemplate.layout,
        mapping
      }
    };

    setLoading(true);

    try {
      const res = await fetch("http://localhost:5656/api/pdf/generate-multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error("PDF Fehler");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "umschlaege.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("PDF konnte nicht erzeugt werden");
    }

    setLoading(false);
  }

  return (
    <div
      style={{
        background: "#ffffff",
        padding: 16,
        borderRadius: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
        maxWidth: 700,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>PDF erzeugen</h2>

      {!hasTemplates && (
        <p style={{ fontSize: 14, color: "#a00" }}>
          Bitte zuerst eine Vorlage anlegen.
        </p>
      )}

      {hasTemplates && (
        <>
          <label style={{ fontSize: 14 }}>
            Vorlage auswählen
            <select
              value={selectedTemplateId}
              onChange={(e) => {
                setSelectedTemplateId(e.target.value);
                setMapping({});
              }}
              style={{
                marginTop: 4,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd"
              }}
            >
              {templates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          {/* Empfänger-Auswahl */}
          <div
            style={{
              background: "#f9f9f9",
              padding: 8,
              borderRadius: 8,
              border: "1px solid #eee",
              maxHeight: 180,
              overflowY: "auto"
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Empfänger auswählen
              </span>
              <span style={{ fontSize: 12, color: "#777" }}>
                {selectedRecipients.length} ausgewählt
              </span>
            </div>

            {(!recipients || recipients.length === 0) && (
              <p style={{ fontSize: 13, color: "#999" }}>
                Noch keine Empfänger importiert.
              </p>
            )}

            {recipients &&
              recipients.map((r) => (
                <label
                  key={r._internalId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 0",
                    fontSize: 13
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedRecipients.some(
                      (x) => x._internalId === r._internalId
                    )}
                    onChange={() => toggleRecipient(r)}
                  />
                  {r.Firma ? r.Firma + " – " : ""}
                  {r.Vorname} {r.Nachname} ({r.PLZ} {r.Ort})
                </label>
              ))}
          </div>

          {/* Mapping-Editor (funktional, noch ohne Linien) */}
          <div
            style={{
              background: "#f7f8ff",
              padding: 8,
              borderRadius: 8,
              border: "1px solid #e0e3f5",
              display: "flex",
              flexDirection: "column",
              gap: 8
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              Platzhalter mit Spalten verbinden
            </div>

            {fields.length === 0 && (
              <span style={{ fontSize: 13, color: "#666" }}>
                Die ausgewählte Vorlage hat noch keine Felder.
              </span>
            )}

            {fields.map((f) => (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 1.8fr",
                  gap: 8,
                  alignItems: "center"
                }}
              >
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 6,
                    border: "1px solid #d0d4e4",
                    padding: "6px 8px",
                    fontSize: 13
                  }}
                >
                  {f.label}
                </div>

                <select
                  value={mapping[f.id] || ""}
                  onChange={(e) => updateMapping(f.id, e.target.value)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 13,
                    backgroundColor: "#fff"
                  }}
                >
                  <option value="">Spalte wählen...</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading}
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: loading ? "#ccc" : "#1f7ae0",
              color: "#ffffff",
              fontWeight: 600,
              cursor: loading ? "default" : "pointer"
            }}
          >
            {loading
              ? "Erzeuge PDF..."
              : "PDF für ausgewählte Empfänger erzeugen"}
          </button>
        </>
      )}
    </div>
  );
}

export default PdfTest;
