import { useState } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5656") + "/api";

const VAT_OPTIONS = [
  { value: 0,    label: "0 % (steuerfrei)" },
  { value: 0.07, label: "7 % MwSt." },
  { value: 0.19, label: "19 % MwSt." },
];

export default function ShareModal({ template, onClose }) {
  const [type, setType]           = useState("free");
  const [priceInput, setPriceInput] = useState(""); // display value like "9.99"
  const [vatRate, setVatRate]     = useState(0.19);
  const [label, setLabel]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null); // { url }
  const [error, setError]         = useState("");
  const [copied, setCopied]       = useState(false);

  // Parse user input → cents
  const grossCents = Math.round(parseFloat(priceInput || "0") * 100);
  const netCents   = vatRate > 0 ? Math.round(grossCents / (1 + vatRate)) : grossCents;
  const taxCents   = grossCents - netCents;
  const validPrice = grossCents >= 50; // Stripe minimum ~50ct

  async function handleCreate() {
    if (type === "paid" && !validPrice) {
      setError("Mindestbetrag ist 0,50 €");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template._id,
          type,
          priceGross: type === "paid" ? grossCents : undefined,
          vatRate: type === "paid" ? vatRate : 0,
          label: label.trim() || template.name,
        }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error(`Server nicht erreichbar (${res.status}). Bitte Seite neu laden.`);
      }
      if (!res.ok) throw new Error(data.error || "Fehler");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(result.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      prompt("URL kopieren:", result.url);
    });
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 2000, padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "min(480px, 100%)",
        padding: "32px 28px", position: "relative",
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 14,
          background: "none", border: "none", fontSize: 22,
          cursor: "pointer", color: "#9ca3af", lineHeight: 1,
        }}>✕</button>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Link teilen</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Vorlage: <strong>{template.name}</strong>
          </div>
        </div>

        {result ? (
          /* ── Success state ── */
          <div>
            <div style={{
              background: "#f0fdf4", border: "1.5px solid #86efac",
              borderRadius: 10, padding: "14px 16px", marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#16a34a", marginBottom: 6 }}>
                ✓ Link erstellt
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: 11, color: "#374151",
                wordBreak: "break-all", lineHeight: 1.6,
              }}>
                {result.url}
              </div>
            </div>

            {type === "paid" && (
              <div style={{
                background: "#eff6ff", borderRadius: 8, padding: "10px 14px",
                fontSize: 12, color: "#2563eb", marginBottom: 16,
              }}>
                💳 Empfänger müssen <strong>{(grossCents / 100).toFixed(2).replace(".", ",")} €</strong> zahlen, bevor sie PDFs generieren können.
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={copyUrl} style={{
                flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
                background: copied ? "#16a34a" : "#2563eb",
                color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                transition: "background .2s",
              }}>
                {copied ? "✓ Kopiert!" : "🔗 URL kopieren"}
              </button>
              <button onClick={() => { setResult(null); setCopied(false); }} style={{
                padding: "10px 16px", borderRadius: 8, border: "1.5px solid #e5e7eb",
                background: "#fff", color: "#374151", fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>
                Neuer Link
              </button>
            </div>
          </div>
        ) : (
          /* ── Configuration state ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Type toggle */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                Zugangsart
              </label>
              <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 10, padding: 4, gap: 4 }}>
                {[["free", "🆓 Kostenlos"], ["paid", "💳 Kostenpflichtig"]].map(([v, l]) => (
                  <button key={v} onClick={() => { setType(v); setError(""); }} style={{
                    flex: 1, padding: "9px 0", borderRadius: 7, border: "none",
                    cursor: "pointer", fontSize: 13, fontWeight: 700,
                    background: type === v ? "#fff" : "transparent",
                    color: type === v ? (v === "paid" ? "#2563eb" : "#16a34a") : "#6b7280",
                    boxShadow: type === v ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                    transition: "all .15s",
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Paid options */}
            {type === "paid" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Price input */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                    Preis (Brutto inkl. MwSt.)
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{
                      position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                      fontSize: 14, fontWeight: 700, color: "#374151",
                    }}>€</span>
                    <input
                      type="number"
                      min="0.50"
                      step="0.01"
                      placeholder="9.99"
                      value={priceInput}
                      onChange={e => { setPriceInput(e.target.value); setError(""); }}
                      style={{
                        width: "100%", padding: "10px 12px 10px 28px", borderRadius: 8,
                        border: "1.5px solid #e5e7eb", fontSize: 15, fontWeight: 700,
                        outline: "none", boxSizing: "border-box",
                        borderColor: priceInput && !validPrice ? "#ef4444" : "#e5e7eb",
                      }}
                    />
                  </div>
                  {priceInput && !validPrice && (
                    <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>Mindestbetrag: 0,50 €</div>
                  )}
                </div>

                {/* VAT select */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                    Mehrwertsteuer
                  </label>
                  <select
                    value={vatRate}
                    onChange={e => setVatRate(parseFloat(e.target.value))}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {VAT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Price breakdown */}
                {validPrice && (
                  <div style={{
                    background: "#f8fafc", borderRadius: 8, padding: "12px 14px",
                    fontSize: 12, color: "#374151", lineHeight: 1.8,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Nettobetrag</span>
                      <span>{(netCents / 100).toFixed(2).replace(".", ",")} €</span>
                    </div>
                    {vatRate > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "#6b7280" }}>
                        <span>MwSt. ({(vatRate * 100).toFixed(0)} %)</span>
                        <span>{(taxCents / 100).toFixed(2).replace(".", ",")} €</span>
                      </div>
                    )}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontWeight: 800, borderTop: "1px solid #e5e7eb",
                      marginTop: 6, paddingTop: 6, fontSize: 13,
                    }}>
                      <span>Gesamt (Brutto)</span>
                      <span>{(grossCents / 100).toFixed(2).replace(".", ",")} €</span>
                    </div>
                  </div>
                )}

                {/* Optional label */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>
                    Beschreibung (optional)
                  </label>
                  <input
                    type="text"
                    placeholder={template.name}
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    maxLength={100}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1.5px solid #e5e7eb", fontSize: 13, outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Payment methods info */}
                <div style={{
                  background: "#f0fdf4", borderRadius: 8, padding: "10px 14px",
                  fontSize: 11, color: "#16a34a", lineHeight: 1.6,
                }}>
                  ✓ Akzeptierte Zahlungsmethoden: Kreditkarte · SEPA Lastschrift · PayPal · Klarna · Giropay · Bancontact · iDEAL
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: "#fef2f2", border: "1.5px solid #fecaca",
                borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626",
              }}>
                ⚠ {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={loading || (type === "paid" && !validPrice)}
              style={{
                padding: "12px 0", borderRadius: 8, border: "none",
                background: loading || (type === "paid" && !validPrice) ? "#9ca3af" : "#111",
                color: "#fff", fontWeight: 700, fontSize: 14,
                cursor: loading || (type === "paid" && !validPrice) ? "default" : "pointer",
                transition: "background .15s",
              }}
            >
              {loading ? "Erstelle Link…" : "Link erstellen"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
