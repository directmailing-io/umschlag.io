import { useState, useRef, useCallback, useEffect } from "react";
import { createTemplate, updateTemplate } from "../api/templates";

const FORMATS = {
  DIN_LANG: { label: "DIN LANG",  w: 220, h: 110 },
  C4:       { label: "DIN C4",    w: 324, h: 229 },
  C5:       { label: "DIN C5",    w: 229, h: 162 },
  C6:       { label: "DIN C6",    w: 162, h: 114 },
};

const FONTS = [
  { value: "LiebeHeide",          label: "LiebeHeide Color" },
  { value: "LiebeHeideFineliner", label: "LiebeHeide Fineliner" },
  { value: "BiroScript",          label: "Biro Script" },
  { value: "Inter",               label: "Inter" },
  { value: "Arial",               label: "Arial" },
  { value: "Roboto",              label: "Roboto" },
  { value: "Montserrat",          label: "Montserrat" },
];

const CANVAS_W = 660; // px

// Parse content into segments: [{type:"text",v}|{type:"placeholder",v}]
function parseContent(content) {
  if (!content) return [];
  const parts = [];
  const re = /\{\{([^}]+)\}\}/g;
  let last = 0, m;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: "text", v: content.slice(last, m.index) });
    parts.push({ type: "placeholder", v: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", v: content.slice(last) });
  return parts;
}

function newField() {
  return {
    id: crypto.randomUUID(),
    label: "Textfeld",
    content: "{{Platzhalter}}",
    x: 10,
    y: 20,
    width: 35,
    fontSize: 22,
    lineHeight: 1.3,
    font: "LiebeHeide",
    color: "#000000",
  };
}

export default function EnvelopeDesigner({ initialTemplate, onSaved }) {
  const [name, setName]     = useState(initialTemplate?.name   || "");
  const [format, setFormat] = useState(initialTemplate?.format || "DIN_LANG");
  const [fields, setFields] = useState(() =>
    (initialTemplate?.fields || []).map(f => ({
      ...f,
      // migrate legacy schema → content
      content: f.content ?? (
        f.isPlaceholder === false
          ? (f.staticText || f.label || "")
          : `{{${f.label}}}`
      ),
    }))
  );
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [savedMsg, setSavedMsg]     = useState("");
  const templateId = useRef(initialTemplate?._id || null);

  const canvasRef  = useRef(null);
  const dragState  = useRef(null);

  const fmt    = FORMATS[format];
  const aspect = fmt.h / fmt.w;
  const canvasH = Math.round(CANVAS_W * aspect);

  // px per pt on canvas (1pt = 0.353mm)
  const ptScale = (CANVAS_W * 0.353) / fmt.w;

  const selected = fields.find(f => f.id === selectedId);

  // ── Drag & Resize ────────────────────────────────────────────────
  const startDrag = useCallback((e, field, type) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(field.id);
    const rect = canvasRef.current.getBoundingClientRect();
    dragState.current = { type, fieldId: field.id, startX: e.clientX, startY: e.clientY,
      origX: field.x, origY: field.y, origW: field.width,
      cW: rect.width, cH: rect.height };
  }, []);

  useEffect(() => {
    const move = (e) => {
      if (!dragState.current) return;
      const { type, fieldId, startX, startY, origX, origY, origW, cW, cH } = dragState.current;
      const dx = ((e.clientX - startX) / cW) * 100;
      const dy = ((e.clientY - startY) / cH) * 100;
      setFields(prev => prev.map(f => {
        if (f.id !== fieldId) return f;
        if (type === "move")   return { ...f, x: clamp(origX + dx, 0, 95), y: clamp(origY + dy, 0, 95) };
        if (type === "resize") return { ...f, width: clamp(origW + dx, 5, 100 - origX) };
        return f;
      }));
    };
    const up = () => { dragState.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  // DEL key
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const tag = document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        setFields(p => p.filter(f => f.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  function updateField(id, patch) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  // ── Save ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) { alert("Bitte Vorlagenname eingeben"); return; }
    if (fields.length === 0) { alert("Mindestens ein Textfeld hinzufügen"); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), format, fields };
      let saved;
      if (templateId.current) {
        saved = await updateTemplate(templateId.current, payload);
      } else {
        saved = await createTemplate(payload);
        templateId.current = saved._id;
      }
      onSaved?.(saved);
      setSavedMsg("✓ Gespeichert");
      setTimeout(() => setSavedMsg(""), 2500);
    } catch (err) {
      alert("Fehler: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

      {/* ── LEFT: Settings + Field List ─────────────────────────── */}
      <aside style={panelStyle}>

        {/* Template meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Vorlagenname</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="z.B. Kundenbrief 2026" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)} style={inputStyle}>
              {Object.entries(FORMATS).map(([k, f]) => (
                <option key={k} value={k}>{f.label} ({f.w}×{f.h}mm)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Field list */}
        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 14, marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#111" }}>Felder</span>
            <button onClick={() => { const f = newField(); setFields(p => [...p, f]); setSelectedId(f.id); }}
              style={addBtnStyle}>+ Feld</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {fields.map(f => {
              const isActive = selectedId === f.id;
              const hasPlaceholders = /\{\{[^}]+\}\}/.test(f.content || "");
              return (
                <div key={f.id} onClick={() => setSelectedId(f.id)} style={{
                  padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                  background: isActive ? "#eff6ff" : "#f9fafb",
                  border: `1.5px solid ${isActive ? "#2563eb" : "#e5e7eb"}`,
                  display: "flex", alignItems: "center", gap: 7,
                }}>
                  <span style={{ fontSize: 10, flexShrink: 0 }}>{hasPlaceholders ? "🔵" : "⬜"}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111" }}>
                    {f.label}
                  </span>
                  <button onClick={e => { e.stopPropagation(); setFields(p => p.filter(x => x.id !== f.id)); if (selectedId === f.id) setSelectedId(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#9ca3af", padding: 0, lineHeight: 1 }}>
                    ✕
                  </button>
                </div>
              );
            })}
            {fields.length === 0 && (
              <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>
                Kein Feld vorhanden
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8, paddingTop: 12, borderTop: "1px solid #f3f4f6" }}>
          {savedMsg && <div style={{ fontSize: 12, color: "#16a34a", textAlign: "center", fontWeight: 600 }}>{savedMsg}</div>}
          <button onClick={handleSave} disabled={saving} style={{
            padding: "10px", background: saving ? "#9ca3af" : "#16a34a",
            color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: saving ? "default" : "pointer",
          }}>
            {saving ? "Speichern..." : templateId.current ? "Aktualisieren" : "Vorlage speichern"}
          </button>
        </div>
      </aside>

      {/* ── CENTER: Canvas ──────────────────────────────────────── */}
      <div style={{ flex: 1 }}>
        {/* Hint */}
        <div style={{ fontSize: 11.5, color: "#6b7280", marginBottom: 8, display: "flex", gap: 14 }}>
          <span>🖱 Feld ziehen = Position</span>
          <span>⇔ Seitengriff = Breite</span>
          <span>⌫ Entf = löschen</span>
        </div>

        <div ref={canvasRef}
          onMouseDown={e => { if (e.target === canvasRef.current) setSelectedId(null); }}
          style={{
            position: "relative",
            width: CANVAS_W,
            height: canvasH,
            background: "#fff",
            border: "1.5px solid #d1d5db",
            borderRadius: 3,
            boxShadow: "0 2px 16px rgba(0,0,0,0.09), 0 1px 3px rgba(0,0,0,0.07)",
            overflow: "hidden",
            userSelect: "none",
          }}
        >
          {/* Envelope fold SVG */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
            <line x1="0" y1="0" x2={CANVAS_W / 2} y2={canvasH * 0.42} stroke="#c8c8c8" strokeWidth="0.8" strokeDasharray="4,4"/>
            <line x1={CANVAS_W} y1="0" x2={CANVAS_W / 2} y2={canvasH * 0.42} stroke="#c8c8c8" strokeWidth="0.8" strokeDasharray="4,4"/>
            <line x1="0" y1={canvasH} x2={CANVAS_W / 2} y2={canvasH * 0.58} stroke="#c8c8c8" strokeWidth="0.8" strokeDasharray="4,4"/>
            <line x1={CANVAS_W} y1={canvasH} x2={CANVAS_W / 2} y2={canvasH * 0.58} stroke="#c8c8c8" strokeWidth="0.8" strokeDasharray="4,4"/>
          </svg>

          {fields.map(field => {
            const isSelected = field.id === selectedId;
            const segments   = parseContent(field.content);
            const displaySize = field.fontSize * ptScale;

            return (
              <div key={field.id}
                onMouseDown={e => startDrag(e, field, "move")}
                style={{
                  position: "absolute",
                  left: `${field.x}%`, top: `${field.y}%`,
                  width: `${field.width}%`,
                  fontFamily: `'${field.font}', Arial, sans-serif`,
                  fontSize: `${displaySize}px`,
                  lineHeight: field.lineHeight,
                  color: field.color,
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  whiteSpace: "pre-wrap",
                  cursor: "move",
                  // No padding — field origin must match PDF exactly.
                  // Selection ring is drawn inside the box so it doesn't shift content.
                  outline: isSelected ? "2px solid #2563eb" : "1.5px dashed rgba(0,0,0,0.13)",
                  outlineOffset: -2,
                  boxSizing: "border-box",
                }}
              >
                {/* Render segments with colored placeholders */}
                {segments.length === 0
                  ? <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Leer</span>
                  : segments.map((seg, i) =>
                      seg.type === "placeholder"
                        ? <span key={i} style={{ color: "#2563eb", opacity: 0.8 }}>{`{{${seg.v}}}`}</span>
                        : <span key={i} style={{ color: field.color }}>{seg.v}</span>
                    )
                }

                {/* Resize handle */}
                {isSelected && (
                  <div onMouseDown={e => startDrag(e, field, "resize")} style={{
                    position: "absolute", right: -7, top: "50%", transform: "translateY(-50%)",
                    width: 14, height: 24, background: "#2563eb", borderRadius: 3,
                    cursor: "ew-resize", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, color: "#fff", userSelect: "none", zIndex: 10,
                  }}>⇔</div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 7, fontSize: 11, color: "#9ca3af" }}>
          {fmt.w} × {fmt.h} mm · {fields.length} Feld{fields.length !== 1 ? "er" : ""}
        </div>
      </div>

      {/* ── RIGHT: Field Properties ─────────────────────────────── */}
      <aside style={{ ...panelStyle, background: selected ? "#fff" : "#f9fafb" }}>
        {!selected ? (
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: "40px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>👆</div>
            Feld auswählen<br/>um Eigenschaften<br/>zu bearbeiten
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, borderBottom: "1px solid #f3f4f6", paddingBottom: 10 }}>
              Feldeigenschaften
            </div>

            {/* Field label (name in list) */}
            <div>
              <label style={labelStyle}>Feldname (interne Bezeichnung)</label>
              <input value={selected.label}
                onChange={e => updateField(selected.id, { label: e.target.value })}
                style={inputStyle} placeholder="z.B. Empfänger Name" />
            </div>

            {/* Content / template */}
            <div>
              <label style={labelStyle}>Inhalt / Vorlage</label>
              <textarea
                value={selected.content}
                onChange={e => updateField(selected.id, { content: e.target.value })}
                rows={3}
                placeholder={"z.B. {{Vorname}} {{Nachname}}\noder fester Text: Berlin, 2026"}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, fontFamily: "monospace", fontSize: 12 }}
              />
              <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 4, lineHeight: 1.5 }}>
                Nutze <code style={{ background: "#f3f4f6", padding: "0 4px", borderRadius: 3 }}>{"{{Spaltenname}}"}</code> für Seriendruck-Platzhalter. Mehrere pro Feld möglich.
              </div>
            </div>

            {/* Font */}
            <div>
              <label style={labelStyle}>Schriftart</label>
              <select value={selected.font}
                onChange={e => updateField(selected.id, { font: e.target.value })}
                style={{ ...inputStyle, fontFamily: `'${selected.font}', sans-serif` }}>
                {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>

            {/* Size + LineHeight */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={labelStyle}>Größe (pt)</label>
                <input type="number" value={selected.fontSize} min={6} max={200}
                  onChange={e => updateField(selected.id, { fontSize: +e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Zeilenhöhe</label>
                <input type="number" value={selected.lineHeight} min={0.8} max={4} step={0.1}
                  onChange={e => updateField(selected.id, { lineHeight: +e.target.value })} style={inputStyle} />
              </div>
            </div>

            {/* Width */}
            <div>
              <label style={labelStyle}>Feldbreite — {selected.width}%</label>
              <input type="range" min={5} max={95} value={selected.width}
                onChange={e => updateField(selected.id, { width: +e.target.value })}
                style={{ width: "100%" }} />
            </div>

            {/* Color */}
            <div>
              <label style={labelStyle}>Schriftfarbe</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={selected.color}
                  onChange={e => updateField(selected.id, { color: e.target.value })}
                  style={{ width: 40, height: 36, border: "1.5px solid #e5e7eb", borderRadius: 6, cursor: "pointer", padding: 2 }} />
                <input value={selected.color}
                  onChange={e => updateField(selected.id, { color: e.target.value })}
                  style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 12 }} />
              </div>
            </div>

            {/* Position */}
            <div>
              <label style={labelStyle}>Position</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>X (%)</span>
                  <input type="number" value={Math.round(selected.x)} min={0} max={95}
                    onChange={e => updateField(selected.id, { x: +e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>Y (%)</span>
                  <input type="number" value={Math.round(selected.y)} min={0} max={95}
                    onChange={e => updateField(selected.id, { y: +e.target.value })} style={inputStyle} />
                </div>
              </div>
            </div>

            <button onClick={() => { setFields(p => p.filter(f => f.id !== selected.id)); setSelectedId(null); }}
              style={{ padding: "8px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
              🗑 Feld löschen
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const panelStyle = {
  width: 240, flexShrink: 0, background: "#fff", borderRadius: 14,
  border: "1.5px solid #e5e7eb", padding: 20,
  display: "flex", flexDirection: "column", gap: 0,
};
const labelStyle = {
  display: "block", fontSize: 10.5, fontWeight: 700, color: "#6b7280",
  marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em",
};
const inputStyle = {
  width: "100%", padding: "7px 10px", border: "1.5px solid #e5e7eb",
  borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff",
};
const addBtnStyle = {
  padding: "4px 12px", background: "#111", color: "#fff", border: "none",
  borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer",
};
