import { useState, useEffect } from "react";
import EnvelopeDesigner from "./components/EnvelopeDesigner";
import GenerateModal from "./components/GenerateModal";
import ShareModal from "./components/ShareModal";
import { fetchTemplates, deleteTemplate } from "./api/templates";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5656") + "/api";

export default function App() {
  const params   = new URLSearchParams(window.location.search);
  const shareId  = params.get("share");
  const sessionId = params.get("session_id");
  const cancelled = params.get("cancelled");

  if (shareId) {
    return <SharedView shareId={shareId} sessionId={sessionId} cancelled={!!cancelled} />;
  }

  return <MainApp />;
}

// ── Shared link view ──────────────────────────────────────────────────────────
function SharedView({ shareId, sessionId, cancelled }) {
  const [shareInfo, setShareInfo]   = useState(null);
  const [template, setTemplate]     = useState(null);
  const [error, setError]           = useState("");
  const [payState, setPayState]     = useState("idle"); // idle | verifying | verified | failed | checking-out
  const [payError, setPayError]     = useState("");

  // Load share info
  useEffect(() => {
    fetch(`${API}/shares/${shareId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setShareInfo(data);
        if (data.type === "free") setTemplate(data.template);
      })
      .catch(() => setError("Verbindungsfehler"));
  }, [shareId]);

  // If returning from Stripe with session_id → verify
  useEffect(() => {
    if (!sessionId || !shareInfo || shareInfo.type !== "paid") return;
    setPayState("verifying");
    fetch(`${API}/shares/${shareId}/verify/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.paid) {
          setTemplate(data.template);
          setPayState("verified");
          // Clean up URL without session_id
          window.history.replaceState({}, "", `?share=${shareId}`);
        } else {
          setPayState("failed");
          setPayError(data.error || "Zahlung nicht bestätigt");
        }
      })
      .catch(() => { setPayState("failed"); setPayError("Verifizierung fehlgeschlagen"); });
  }, [sessionId, shareInfo]);

  async function startCheckout() {
    setPayState("checking-out");
    setPayError("");
    try {
      const res  = await fetch(`${API}/shares/${shareId}/checkout`, { method: "POST" });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch {
        throw new Error(`Server nicht erreichbar (${res.status}). Bitte Seite neu laden.`);
      }
      if (!res.ok) throw new Error(data.error || "Fehler");
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setPayState("idle");
      setPayError(e.message);
    }
  }

  const isPaid      = shareInfo?.type === "paid";
  const priceGross  = shareInfo?.priceGross || 0;
  const priceLabel  = (priceGross / 100).toFixed(2).replace(".", ",") + " €";

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f6", fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "0 28px", display: "flex", alignItems: "center",
        gap: 12, height: 56, position: "sticky", top: 0, zIndex: 100,
      }}>
        <span style={{ fontSize: 22 }}>✉️</span>
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px" }}>umschlag.io</span>
        {shareInfo && (
          <>
            <span style={{ color: "#d1d5db", fontSize: 18 }}>/</span>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#374151" }}>
              {shareInfo.template?.name || shareInfo.label}
            </span>
          </>
        )}
      </header>

      <main style={{ padding: "32px 28px", maxWidth: 680, margin: "0 auto" }}>
        {error ? (
          <ErrorCard>{error}</ErrorCard>
        ) : !shareInfo ? (
          <LoadingCard />
        ) : isPaid && !template ? (
          /* ── Payment wall ── */
          <div style={{
            background: "#fff", borderRadius: 16, padding: "36px 32px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)", textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800 }}>
              {shareInfo.label || shareInfo.template?.name}
            </h2>
            <p style={{ margin: "0 0 24px", color: "#6b7280", fontSize: 14 }}>
              Für den Zugriff auf diesen Umschlag-Generator ist eine einmalige Zahlung erforderlich.
            </p>

            {/* Price box */}
            <div style={{
              display: "inline-block", background: "#f8fafc",
              border: "2px solid #e5e7eb", borderRadius: 12,
              padding: "16px 32px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-1px" }}>
                {priceLabel}
              </div>
              {shareInfo.vatRate > 0 && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  inkl. {(shareInfo.vatRate * 100).toFixed(0)} % MwSt.
                </div>
              )}
            </div>

            {/* Payment methods */}
            <div style={{
              display: "flex", justifyContent: "center", flexWrap: "wrap",
              gap: 8, marginBottom: 24,
            }}>
              {["Kreditkarte", "SEPA", "PayPal", "Klarna", "Giropay"].map(m => (
                <span key={m} style={{
                  padding: "4px 12px", background: "#f1f5f9", borderRadius: 20,
                  fontSize: 11, fontWeight: 600, color: "#475569",
                }}>{m}</span>
              ))}
            </div>

            {cancelled && (
              <div style={{
                background: "#fef3c7", border: "1.5px solid #fcd34d",
                borderRadius: 8, padding: "10px 14px", fontSize: 13,
                color: "#92400e", marginBottom: 16, textAlign: "left",
              }}>
                ℹ️ Die Zahlung wurde abgebrochen. Du kannst es erneut versuchen.
              </div>
            )}

            {payError && (
              <div style={{
                background: "#fef2f2", border: "1.5px solid #fecaca",
                borderRadius: 8, padding: "10px 14px", fontSize: 13,
                color: "#dc2626", marginBottom: 16, textAlign: "left",
              }}>
                ⚠ {payError}
              </div>
            )}

            {payState === "verifying" && (
              <div style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>
                ⏳ Zahlung wird verifiziert…
              </div>
            )}

            {payState === "failed" && (
              <div style={{
                background: "#fef2f2", border: "1.5px solid #fecaca",
                borderRadius: 8, padding: "10px 14px", fontSize: 13,
                color: "#dc2626", marginBottom: 16,
              }}>
                ⚠ Zahlung konnte nicht bestätigt werden. Bitte versuche es erneut.
              </div>
            )}

            <button
              onClick={startCheckout}
              disabled={payState === "checking-out" || payState === "verifying"}
              style={{
                width: "100%", maxWidth: 320, padding: "14px 0", borderRadius: 10,
                border: "none", background: (payState === "checking-out" || payState === "verifying") ? "#9ca3af" : "#2563eb",
                color: "#fff", fontWeight: 800, fontSize: 16,
                cursor: (payState === "checking-out" || payState === "verifying") ? "default" : "pointer",
                transition: "background .15s",
              }}
            >
              {payState === "checking-out" ? "Weiterleitung…" : `Jetzt bezahlen — ${priceLabel}`}
            </button>

            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 12 }}>
              Sichere Zahlung über Stripe · Einmalige Gebühr
            </div>
          </div>
        ) : template ? (
          /* ── PDF generator ── */
          <GenerateModal
            templates={[template]}
            lockedTemplate={template}
            embedded={true}
            onClose={() => {}}
          />
        ) : null}
      </main>
    </div>
  );
}

function LoadingCard() {
  return (
    <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 60 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      <div>Wird geladen…</div>
    </div>
  );
}

function ErrorCard({ children }) {
  return (
    <div style={{
      background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12,
      padding: "20px 24px", color: "#dc2626", fontWeight: 600,
    }}>
      ⚠ {children}
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
function MainApp() {
  const [tab, setTab]                   = useState("designer");
  const [templates, setTemplates]       = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [designerKey, setDesignerKey]   = useState(0);
  const [loadedTemplate, setLoadedTemplate] = useState(null);

  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    try { setTemplates(await fetchTemplates()); } catch {}
  }

  function handleSaved(tpl) {
    setTemplates(prev => {
      const exists = prev.find(t => t._id === tpl._id);
      if (exists) return prev.map(t => t._id === tpl._id ? tpl : t);
      return [tpl, ...prev];
    });
  }

  function handleLoad(tpl) {
    setLoadedTemplate(tpl);
    setDesignerKey(k => k + 1);
    setTab("designer");
  }

  async function handleDelete(id) {
    if (!confirm("Vorlage löschen?")) return;
    await deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t._id !== id));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f6", fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{
        background: "#fff", borderBottom: "1px solid #e5e7eb",
        padding: "0 28px", display: "flex", alignItems: "center",
        gap: 32, height: 56, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>✉️</span>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px" }}>umschlag.io</span>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {[["designer", "Designer"], ["templates", `Vorlagen (${templates.length})`]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "6px 16px", borderRadius: 8, border: "none",
              background: tab === id ? "#111" : "transparent",
              color: tab === id ? "#fff" : "#666",
              fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .15s",
            }}>{label}</button>
          ))}
        </nav>

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => setShowGenerate(true)}
            disabled={templates.length === 0}
            style={{
              padding: "8px 20px",
              background: templates.length > 0 ? "#2563eb" : "#d1d5db",
              color: "#fff", border: "none", borderRadius: 10,
              fontWeight: 700, fontSize: 13,
              cursor: templates.length > 0 ? "pointer" : "default",
            }}
          >
            ⬇ PDF Generieren
          </button>
        </div>
      </header>

      <main style={{ padding: "24px 28px", maxWidth: 1400, margin: "0 auto" }}>
        {tab === "designer" && (
          <EnvelopeDesigner
            key={designerKey}
            initialTemplate={loadedTemplate}
            onSaved={handleSaved}
          />
        )}
        {tab === "templates" && (
          <TemplatesView
            templates={templates}
            onLoad={handleLoad}
            onDelete={handleDelete}
          />
        )}
      </main>

      {showGenerate && (
        <GenerateModal
          templates={templates}
          onClose={() => setShowGenerate(false)}
        />
      )}
    </div>
  );
}

// ── Templates view with share ─────────────────────────────────────────────────
function TemplatesView({ templates, onLoad, onDelete }) {
  const [shareTarget, setShareTarget] = useState(null); // template to share

  if (templates.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Noch keine Vorlagen gespeichert</div>
        <div style={{ marginTop: 8, fontSize: 14 }}>Erstelle eine Vorlage im Designer-Tab</div>
      </div>
    );
  }

  const formatLabel = {
    DIN_LANG: "DIN LANG (220×110mm)",
    C4: "C4 (324×229mm)",
    C5: "C5 (229×162mm)",
    C6: "C6 (162×114mm)",
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700 }}>Gespeicherte Vorlagen</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {templates.map(t => (
          <div key={t._id} style={{
            background: "#fff", borderRadius: 14, border: "1.5px solid #e5e7eb",
            padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                {formatLabel[t.format] || t.format} · {t.fields?.length || 0} Felder
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {t.fields?.map(f => (
                <span key={f.id} style={{
                  padding: "2px 10px", borderRadius: 20,
                  background: f.isPlaceholder ? "#eff6ff" : "#f3f4f6",
                  color: f.isPlaceholder ? "#2563eb" : "#374151",
                  fontSize: 11, fontWeight: 600,
                }}>
                  {f.isPlaceholder ? "{{" + f.label + "}}" : f.label}
                </span>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
              <button onClick={() => onLoad(t)} style={{
                flex: 1, padding: "8px", background: "#111", color: "#fff",
                border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>
                Im Designer öffnen
              </button>
              <button onClick={() => setShareTarget(t)} style={{
                padding: "8px 12px", background: "#eff6ff", color: "#2563eb",
                border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13,
                cursor: "pointer",
              }}>
                🔗 Teilen
              </button>
              <button onClick={() => onDelete(t._id)} style={{
                padding: "8px 12px", background: "#fee2e2", color: "#dc2626",
                border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {shareTarget && (
        <ShareModal
          template={shareTarget}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
