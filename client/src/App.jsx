import { useState, useEffect } from "react";
import EnvelopeDesigner from "./components/EnvelopeDesigner";
import GenerateModal from "./components/GenerateModal";
import { fetchTemplates, deleteTemplate } from "./api/templates";

export default function App() {
  const [tab, setTab] = useState("designer"); // "designer" | "templates"
  const [templates, setTemplates] = useState([]);
  const [showGenerate, setShowGenerate] = useState(false);
  const [designerKey, setDesignerKey] = useState(0);
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
      {/* HEADER */}
      <header style={{
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        gap: 32,
        height: 56,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 22 }}>✉️</span>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px" }}>umschlag.io</span>
        </div>

        <nav style={{ display: "flex", gap: 4 }}>
          {[["designer", "Designer"], ["templates", `Vorlagen (${templates.length})`]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: "none",
              background: tab === id ? "#111" : "transparent",
              color: tab === id ? "#fff" : "#666",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              transition: "all .15s",
            }}>
              {label}
            </button>
          ))}
        </nav>

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={() => setShowGenerate(true)}
            disabled={templates.length === 0}
            style={{
              padding: "8px 20px",
              background: templates.length > 0 ? "#2563eb" : "#d1d5db",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 13,
              cursor: templates.length > 0 ? "pointer" : "default",
            }}
          >
            ⬇ PDF Generieren
          </button>
        </div>
      </header>

      {/* MAIN */}
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

function TemplatesView({ templates, onLoad, onDelete }) {
  if (templates.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Noch keine Vorlagen gespeichert</div>
        <div style={{ marginTop: 8, fontSize: 14 }}>Erstelle eine Vorlage im Designer-Tab</div>
      </div>
    );
  }

  const formatLabel = { DIN_LANG: "DIN LANG (220×110mm)", C4: "C4 (324×229mm)", C5: "C5 (229×162mm)", C6: "C6 (162×114mm)" };

  return (
    <div>
      <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700 }}>Gespeicherte Vorlagen</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {templates.map(t => (
          <div key={t._id} style={{
            background: "#fff",
            borderRadius: 14,
            border: "1.5px solid #e5e7eb",
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
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
                  padding: "2px 10px",
                  borderRadius: 20,
                  background: f.isPlaceholder ? "#eff6ff" : "#f3f4f6",
                  color: f.isPlaceholder ? "#2563eb" : "#374151",
                  fontSize: 11,
                  fontWeight: 600,
                }}>
                  {f.isPlaceholder ? "{{" + f.label + "}}" : f.label}
                </span>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
              <button onClick={() => onLoad(t)} style={{
                flex: 1,
                padding: "8px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}>
                Im Designer öffnen
              </button>
              <button onClick={() => onDelete(t._id)} style={{
                padding: "8px 12px",
                background: "#fee2e2",
                color: "#dc2626",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
