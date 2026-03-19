import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const API = (import.meta.env.VITE_API_URL || "http://localhost:5656") + "/api";

function extractPlaceholders(template) {
  const set = new Set();
  for (const field of template.fields || []) {
    const src = field.content ?? (field.isPlaceholder ? `{{${field.label}}}` : "");
    const matches = src.matchAll(/\{\{([^}]+)\}\}/g);
    for (const m of matches) set.add(m[1].trim());
  }
  return [...set];
}

export default function GenerateModal({ templates, onClose }) {
  const [step, setStep]                     = useState(1);
  const [selectedTemplate, setTemplate]     = useState(null);
  // Data source: "excel" | "sheets"
  const [dataSource, setDataSource]         = useState("excel");
  // Shared workbook (populated by either Excel upload OR Google Sheets XLSX fetch)
  const [workbook, setWorkbook]             = useState(null);
  const [selectedSheets, setSelectedSheets] = useState([]);
  const [sheetRowCounts, setSheetRowCounts] = useState({});
  // Google Sheets UI state
  const [sheetsUrl, setSheetsUrl]           = useState("");
  const [sheetsLoading, setSheetsLoading]   = useState(false);
  const [sheetsError, setSheetsError]       = useState("");
  // columns/rows come from first selected sheet — used for mapping + preview
  const [columns, setColumns]               = useState([]);
  const [previewRows, setPreviewRows]       = useState([]);
  const [mapping, setMapping]               = useState({});
  // conditions: { [placeholderKey]: { rules: [{operator,when,then}], useDefault, default } }
  const [conditions, setConditions]         = useState({});
  const [expandedCondition, setExpandedCondition] = useState(null);
  const [filename, setFilename]             = useState("umschlaege");
  const [jobs, setJobs]                     = useState([]);
  const [generating, setGenerating]         = useState(false);
  const [error, setError]                   = useState("");
  const [draggingFile, setDraggingFile]     = useState(false);
  const fileRef  = useRef();
  const sseRefs  = useRef([]);

  // Close all SSE connections on unmount
  useEffect(() => () => sseRefs.current.forEach(s => s.close()), []);

  const placeholders = selectedTemplate ? extractPlaceholders(selectedTemplate) : [];
  const mappedCount  = Object.values(mapping).filter(Boolean).length;
  const totalRows    = selectedSheets.reduce((s, n) => s + (sheetRowCounts[n] || 0), 0);
  const dataReady    = workbook !== null && selectedSheets.length > 0;

  // Clears shared workbook data — called when switching tabs
  function switchSource(src) {
    if (src === dataSource) return;
    setDataSource(src);
    setWorkbook(null);
    setSelectedSheets([]);
    setSheetRowCounts({});
    setColumns([]);
    setPreviewRows([]);
    setSheetsError("");
  }

  function selectTemplate(t) {
    setTemplate(t);
    const m = {};
    extractPlaceholders(t).forEach(p => { m[p] = ""; });
    setMapping(m);
    setConditions({});
    setExpandedCondition(null);
    setStep(2);
  }

  // ── Condition helpers ──────────────────────────────────────────────
  function getCondition(key) {
    return conditions[key] || { rules: [{ operator: "equals", when: "", then: "" }], useDefault: false, default: "" };
  }

  function setCondition(key, updates) {
    setConditions(prev => ({ ...prev, [key]: { ...getCondition(key), ...updates } }));
  }

  function addRule(key) {
    const c = getCondition(key);
    setCondition(key, { rules: [...c.rules, { operator: "equals", when: "", then: "" }] });
  }

  function removeRule(key, idx) {
    const c = getCondition(key);
    setCondition(key, { rules: c.rules.filter((_, i) => i !== idx) });
  }

  function updateRule(key, idx, patch) {
    const c = getCondition(key);
    setCondition(key, { rules: c.rules.map((r, i) => i === idx ? { ...r, ...patch } : r) });
  }

  function hasActiveConditions(key) {
    return (conditions[key]?.rules || []).some(r => r.when.trim());
  }

  // Build conditions object to send — only keys with at least one filled rule
  function buildConditionsPayload() {
    const out = {};
    for (const [k, v] of Object.entries(conditions)) {
      if ((v.rules || []).some(r => r.when.trim())) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  function processFile(file) {
    if (!file) return;
    setError("");
    const reader = new FileReader();
    reader.onload = ev => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      setWorkbook(wb);
      // Pre-compute row counts for all sheets
      const counts = {};
      for (const name of wb.SheetNames) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        counts[name] = data.length;
      }
      setSheetRowCounts(counts);
      setSelectedSheets(wb.SheetNames); // default: all selected
      loadColumnsFrom(wb, wb.SheetNames[0]);
    };
    reader.readAsArrayBuffer(file);
  }

  function loadColumnsFrom(wb, sheetName) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
    const cols  = data.length > 0 ? Object.keys(data[0]) : [];
    setColumns(cols);
    setPreviewRows(data.slice(0, 4));
    // Auto-map placeholders to matching column names
    setMapping(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        if (next[key]) return;
        const match = cols.find(c => c.toLowerCase() === key.toLowerCase());
        if (match) next[key] = match;
      });
      return next;
    });
  }

  async function loadGoogleSheets() {
    const url = sheetsUrl.trim();
    if (!url) return;
    setSheetsLoading(true);
    setSheetsError("");
    setWorkbook(null);
    setSelectedSheets([]);
    try {
      const res = await fetch(`${API}/sheets/xlsx?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      setWorkbook(wb);
      const counts = {};
      for (const name of wb.SheetNames) {
        const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "" });
        counts[name] = data.length;
      }
      setSheetRowCounts(counts);
      setSelectedSheets(wb.SheetNames);
      loadColumnsFrom(wb, wb.SheetNames[0]);
    } catch (err) {
      setSheetsError(err.message);
    } finally {
      setSheetsLoading(false);
    }
  }

  function toggleSheet(name) {
    setSelectedSheets(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  }

  function handleDrop(e) {
    e.preventDefault();
    setDraggingFile(false);
    const file = [...(e.dataTransfer.files || [])].find(f => f.name.match(/\.(xlsx|xls)$/i));
    if (file) processFile(file);
  }

  async function handleGenerate() {
    if (!selectedTemplate || !dataReady) return;
    setGenerating(true);
    setError("");

    // Build unified job list — both Excel and Google Sheets data lives in workbook
    const initialJobs = selectedSheets.map(sn => ({
      sheetName: sn,
      jobId:     null,
      progress:  0,
      total:     sheetRowCounts[sn] || 0,
      status:    "pending",
      filename:  selectedSheets.length === 1
        ? (filename || "umschlaege")
        : `${filename || "umschlaege"}_${sn}`,
    }));
    setJobs(initialJobs);

    // Start all jobs and subscribe to SSE
    for (const job of initialJobs) {
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[job.sheetName], { defval: "" });
      let jobId;
      try {
        const conditionsPayload = buildConditionsPayload();
        const res = await fetch(`${API}/pdf/start`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            recipients: sheetRows,
            template:   selectedTemplate,
            mapping,
            ...(conditionsPayload && { conditions: conditionsPayload }),
            filename:   job.filename,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        ({ jobId } = await res.json());
      } catch (err) {
        setJobs(prev => prev.map(j =>
          j.sheetName === job.sheetName ? { ...j, status: "error", error: err.message } : j
        ));
        continue;
      }

      // Mark as running with jobId
      setJobs(prev => prev.map(j =>
        j.sheetName === job.sheetName ? { ...j, jobId, status: "running" } : j
      ));

      // Open SSE connection
      const sse = new EventSource(`${API}/pdf/progress/${jobId}`);
      sseRefs.current.push(sse);

      const capturedJob = { ...job, jobId };

      sse.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setJobs(prev => prev.map(j => {
          if (j.jobId !== jobId) return j;
          return { ...j, progress: data.progress ?? j.progress, total: data.total ?? j.total, status: data.status, error: data.error };
        }));

        if (data.status === "done") {
          sse.close();
          // Auto-download
          fetch(`${API}/pdf/download/${jobId}`)
            .then(r => r.blob())
            .then(blob => {
              const url = URL.createObjectURL(blob);
              const a   = document.createElement("a");
              a.href     = url;
              a.download = `${capturedJob.filename}.pdf`;
              a.click();
              URL.revokeObjectURL(url);
            });
        }
        if (data.status === "error") sse.close();
      };

      sse.onerror = () => {
        sse.close();
        setJobs(prev => prev.map(j =>
          j.jobId === jobId ? { ...j, status: "error", error: "Verbindungsfehler" } : j
        ));
      };
    }
  }

  const allDone = jobs.length > 0 && jobs.every(j => j.status === "done" || j.status === "error");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      padding: "8px" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .gm-close { position: absolute; top: 16px; right: 16px; background: none; border: none;
          font-size: 22px; cursor: pointer; color: #9ca3af; line-height: 1; padding: 4px; }
        .gm-close:hover { color: #374151; }
        .gm-input, .gm-select { min-height: 44px; }
        .gm-btn-primary { min-height: 44px; }
        .gm-btn-ghost   { min-height: 44px; }
        @media (max-width: 480px) {
          .gm-modal { border-radius: 12px !important; padding: 20px 16px !important; }
          .gm-step-label { display: none; }
          .gm-cond-row { flex-direction: column !important; align-items: flex-start !important; }
          .gm-url-row { flex-direction: column !important; }
          .gm-url-row input { width: 100% !important; }
          .gm-url-row button { width: 100% !important; }
        }
      `}</style>
      <div className="gm-modal" style={{ background: "#fff", borderRadius: 16,
        width: "min(620px, 100%)", maxHeight: "min(90dvh, calc(100dvh - 16px))",
        overflow: "auto", padding: "clamp(20px, 5%, 36px)", position: "relative",
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>

        <button onClick={onClose} className="gm-close">✕</button>

        <StepBar step={step} />

        {/* ── STEP 1: Template ─────────────────────────────── */}
        {step === 1 && (
          <div>
            <h3 style={h3}>Vorlage auswählen</h3>
            <p style={sub}>Wähle die Vorlage für den Seriendruck.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {templates.map(t => {
                const phs = extractPlaceholders(t);
                return (
                  <button key={t._id} onClick={() => selectTemplate(t)} style={{
                    padding: "14px 16px", borderRadius: 10, border: "1.5px solid #e5e7eb",
                    background: "#f9fafb", cursor: "pointer", textAlign: "left",
                    display: "flex", flexDirection: "column", gap: 5,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {t.format} · {t.fields?.length || 0} Felder
                      {phs.length > 0 && <> · <span style={{ color: "#2563eb" }}>{phs.length} Platzhalter</span></>}
                    </div>
                    {phs.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
                        {phs.map(p => <span key={p} style={tagStyle}>{`{{${p}}}`}</span>)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 2: Datenquelle ────────────────────────────── */}
        {step === 2 && (
          <div>
            <h3 style={h3}>Daten laden</h3>
            <p style={sub}>Vorlage: <strong>{selectedTemplate.name}</strong></p>

            {/* Source tabs */}
            <div style={{
              display: "flex", background: "#f1f5f9", borderRadius: 10,
              padding: 4, marginBottom: 16, gap: 4,
            }}>
              {[
                { id: "excel", label: "Excel-Datei" },
                { id: "sheets", label: "Google Sheets" },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => switchSource(tab.id)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 7, minHeight: 40,
                    border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: dataSource === tab.id ? "#fff" : "transparent",
                    color: dataSource === tab.id ? "#2563eb" : "#6b7280",
                    boxShadow: dataSource === tab.id ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                    transition: "all .15s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Excel panel ── */}
            {dataSource === "excel" && (
              <div>
                <div
                  onClick={() => fileRef.current.click()}
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDraggingFile(true); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDraggingFile(false); }}
                  style={{
                    border: `2px dashed ${draggingFile ? "#2563eb" : workbook ? "#86efac" : "#d1d5db"}`,
                    borderRadius: 12, padding: workbook ? "14px 18px" : "48px 24px",
                    textAlign: "center", cursor: "pointer",
                    background: draggingFile ? "#eff6ff" : workbook ? "#f0fdf4" : "#f9fafb",
                    transition: "all .15s",
                  }}
                >
                  {!workbook ? (
                    <>
                      <div style={{ marginBottom: 10, pointerEvents: "none" }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={draggingFile ? "#2563eb" : "#9ca3af"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 12 15 15"/>
                        </svg>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: draggingFile ? "#2563eb" : "#374151", pointerEvents: "none" }}>
                        {draggingFile ? "Datei hier ablegen" : "Excel-Datei auswählen oder hier ablegen"}
                      </div>
                      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, pointerEvents: "none" }}>.xlsx · .xls</div>
                    </>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, pointerEvents: "none" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>
                        {workbook.SheetNames.length} Blatt/Blätter · {columns.length} Spalten
                      </span>
                      <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>Klicken zum Ändern</span>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls"
                  onChange={e => processFile(e.target.files[0])} style={{ display: "none" }} />

                {workbook && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
                    {/* Sheet checkboxes */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <label style={labelStyle}>Tabellenblätter</label>
                        <button
                          onClick={() => {
                            if (selectedSheets.length === workbook.SheetNames.length) {
                              setSelectedSheets([]);
                            } else {
                              setSelectedSheets(workbook.SheetNames);
                            }
                          }}
                          style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                        >
                          {selectedSheets.length === workbook.SheetNames.length ? "Alle abwählen" : "Alle auswählen"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {workbook.SheetNames.map(name => {
                          const checked = selectedSheets.includes(name);
                          const count   = sheetRowCounts[name] || 0;
                          return (
                            <label key={name} style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                              borderRadius: 8, border: `1.5px solid ${checked ? "#2563eb" : "#e5e7eb"}`,
                              background: checked ? "#eff6ff" : "#f9fafb", cursor: "pointer", minHeight: 44,
                            }}>
                              <input type="checkbox" checked={checked}
                                onChange={() => toggleSheet(name)}
                                style={{ width: 16, height: 16, accentColor: "#2563eb", flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{name}</span>
                              <span style={{ fontSize: 12, color: "#6b7280" }}>{count} Zeilen</span>
                            </label>
                          );
                        })}
                      </div>
                      {selectedSheets.length === 0 && (
                        <div style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>Mindestens ein Blatt auswählen</div>
                      )}
                    </div>

                    {selectedSheets.length > 0 && (
                      <DataPreview rows={previewRows} columns={columns} />
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => fileRef.current.click()} style={ghostBtn}>Andere Datei</button>
                      <button
                        onClick={() => {
                          if (selectedSheets.length > 0) loadColumnsFrom(workbook, selectedSheets[0]);
                          setStep(3);
                        }}
                        disabled={selectedSheets.length === 0}
                        style={{ ...primaryBtn, flex: 1, background: selectedSheets.length === 0 ? "#9ca3af" : "#2563eb" }}
                      >
                        Weiter zum Mapping →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Google Sheets panel ── */}
            {dataSource === "sheets" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* URL row */}
                <div>
                  <label style={labelStyle}>Google Sheets URL</label>
                  <div className="gm-url-row" style={{ display: "flex", gap: 8 }}>
                    <input
                      className="gm-input"
                      type="url"
                      value={sheetsUrl}
                      onChange={e => { setSheetsUrl(e.target.value); setSheetsError(""); setWorkbook(null); setSelectedSheets([]); }}
                      onKeyDown={e => e.key === "Enter" && loadGoogleSheets()}
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                      style={{
                        ...inputStyle,
                        borderColor: sheetsError ? "#ef4444" : workbook ? "#86efac" : "#e5e7eb",
                        background: workbook ? "#f0fdf4" : "#fff",
                        minWidth: 0,
                      }}
                    />
                    <button
                      className="gm-btn-primary"
                      onClick={loadGoogleSheets}
                      disabled={!sheetsUrl.trim() || sheetsLoading}
                      style={{
                        ...primaryBtn, width: "auto",
                        padding: "0 18px", flexShrink: 0,
                        background: !sheetsUrl.trim() || sheetsLoading ? "#9ca3af" : "#2563eb",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                    >
                      {sheetsLoading ? (
                        <>
                          <span style={{
                            width: 14, height: 14, border: "2px solid rgba(255,255,255,.4)",
                            borderTopColor: "#fff", borderRadius: "50%",
                            animation: "spin .7s linear infinite", display: "inline-block",
                          }} />
                          Laden…
                        </>
                      ) : "Laden"}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 5 }}>
                    Die Tabelle muss öffentlich zugänglich sein (Ansicht für alle mit Link). Alle Tabellenblätter werden geladen.
                  </div>
                  {sheetsError && (
                    <div style={{
                      display: "flex", alignItems: "flex-start", gap: 7, marginTop: 8,
                      background: "#fef2f2", border: "1.5px solid #fecaca",
                      borderRadius: 8, padding: "10px 12px",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span style={{ fontSize: 12, color: "#dc2626", lineHeight: 1.4 }}>{sheetsError}</span>
                    </div>
                  )}
                </div>

                {/* After loading: same sheet-selector UI as Excel */}
                {workbook && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "#f0fdf4", border: "1.5px solid #86efac",
                      borderRadius: 8, padding: "10px 14px",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>
                        {workbook.SheetNames.length} Tabellenblatt/-blätter · {totalRows} Zeilen geladen
                      </span>
                    </div>

                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <label style={labelStyle}>Tabellenblätter auswählen</label>
                        <button
                          onClick={() => setSelectedSheets(
                            selectedSheets.length === workbook.SheetNames.length ? [] : workbook.SheetNames
                          )}
                          style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                        >
                          {selectedSheets.length === workbook.SheetNames.length ? "Alle abwählen" : "Alle auswählen"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {workbook.SheetNames.map(name => {
                          const checked = selectedSheets.includes(name);
                          const count   = sheetRowCounts[name] || 0;
                          return (
                            <label key={name} style={{
                              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                              borderRadius: 8, border: `1.5px solid ${checked ? "#2563eb" : "#e5e7eb"}`,
                              background: checked ? "#eff6ff" : "#f9fafb", cursor: "pointer", minHeight: 44,
                            }}>
                              <input type="checkbox" checked={checked}
                                onChange={() => toggleSheet(name)}
                                style={{ width: 16, height: 16, accentColor: "#2563eb", flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{name}</span>
                              <span style={{ fontSize: 12, color: "#6b7280" }}>{count} Zeilen</span>
                            </label>
                          );
                        })}
                      </div>
                      {selectedSheets.length === 0 && (
                        <div style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>Mindestens ein Blatt auswählen</div>
                      )}
                    </div>

                    {selectedSheets.length > 0 && (
                      <DataPreview rows={previewRows} columns={columns} />
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setWorkbook(null); setSelectedSheets([]); setSheetsError(""); }} style={ghostBtn}>Andere URL</button>
                      <button
                        onClick={() => {
                          if (selectedSheets.length > 0) loadColumnsFrom(workbook, selectedSheets[0]);
                          setStep(3);
                        }}
                        disabled={selectedSheets.length === 0}
                        className="gm-btn-primary"
                        style={{ ...primaryBtn, flex: 1, background: selectedSheets.length === 0 ? "#9ca3af" : "#2563eb" }}
                      >
                        Weiter zum Mapping →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Mapping ───────────────────────────────── */}
        {step === 3 && (
          <div>
            <h3 style={h3}>Spalten zuordnen</h3>
            <p style={sub}>
              {dataSource === "sheets"
                ? `Google Sheets · ${totalRows} Zeilen`
                : selectedSheets.length > 1
                  ? `Gilt für alle ${selectedSheets.length} Tabellenblätter`
                  : `Blatt: ${selectedSheets[0]}`
              }
            </p>

            {placeholders.length === 0 ? (
              <div style={{ background: "#fefce8", borderRadius: 8, padding: "12px 14px", fontSize: 13, marginBottom: 16 }}>
                ⚠ Diese Vorlage hat keine Platzhalter — alle Felder enthalten festen Text.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {placeholders.map(p => {
                  const cond     = getCondition(p);
                  const isOpen   = expandedCondition === p;
                  const hasRules = hasActiveConditions(p);
                  return (
                    <div key={p} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                      {/* Mapping row */}
                      <div style={{ padding: "10px 12px", background: "#f9fafb" }}>
                        <label style={labelStyle}>
                          <code style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{`{{${p}}}`}</code>
                          <span style={{ color: "#16a34a", marginLeft: 6, fontSize: 10 }}>→ Spalte</span>
                        </label>
                        <select value={mapping[p] || ""} onChange={e => setMapping(m => ({ ...m, [p]: e.target.value }))} style={{ ...inputStyle, background: "#fff" }}>
                          <option value="">(nicht zuordnen)</option>
                          {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      {/* Wenn-Dann toggle */}
                      <button
                        onClick={() => setExpandedCondition(isOpen ? null : p)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "7px 12px", background: isOpen ? "#eff6ff" : "#fff",
                          border: "none", borderTop: "1px solid #e5e7eb", cursor: "pointer",
                          fontSize: 12, fontWeight: 600, color: hasRules ? "#2563eb" : "#6b7280",
                          transition: "background .15s",
                        }}
                      >
                        <span>⚙ Wenn–Dann Bedingungen{hasRules ? ` (${cond.rules.filter(r => r.when.trim()).length} aktiv)` : ""}</span>
                        <span style={{ fontSize: 10, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
                      </button>

                      {/* Conditions panel */}
                      {isOpen && (
                        <div style={{ padding: "14px", background: "#f8fafc", borderTop: "1px solid #e5e7eb" }}>
                          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                            Ersetze den Zellwert basierend auf Bedingungen. Groß-/Kleinschreibung wird ignoriert.
                          </p>

                          {cond.rules.map((rule, ri) => (
                            <div key={ri} style={{
                              background: "#fff", border: "1.5px solid #e2e8f0",
                              borderRadius: 8, padding: "10px 12px", marginBottom: 8,
                              display: "flex", flexDirection: "column", gap: 8,
                            }}>
                              {/* WENN row */}
                              <div className="gm-cond-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 74, flexShrink: 0 }}>Wenn Wert</span>
                                <select
                                  value={rule.operator}
                                  onChange={e => updateRule(p, ri, { operator: e.target.value })}
                                  style={{ ...condSelect, flexShrink: 0 }}
                                >
                                  <option value="equals">ist gleich</option>
                                  <option value="contains">enthält</option>
                                  <option value="startsWith">beginnt mit</option>
                                  <option value="endsWith">endet mit</option>
                                </select>
                                <input
                                  value={rule.when}
                                  onChange={e => updateRule(p, ri, { when: e.target.value })}
                                  placeholder='z.B. "DE"'
                                  style={{ ...condInput, flex: 1, minWidth: 80 }}
                                />
                              </div>
                              {/* AUSGABE row */}
                              <div className="gm-cond-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 74, flexShrink: 0 }}>→ Ausgabe</span>
                                <input
                                  value={rule.then}
                                  onChange={e => updateRule(p, ri, { then: e.target.value })}
                                  placeholder='z.B. "Deutschland"'
                                  style={{ ...condInput, flex: 1, minWidth: 80 }}
                                />
                                {cond.rules.length > 1 && (
                                  <button onClick={() => removeRule(p, ri)} style={condRemoveBtn} title="Entfernen">✕</button>
                                )}
                              </div>
                            </div>
                          ))}

                          <button onClick={() => addRule(p)} style={{ fontSize: 12, color: "#2563eb", background: "none", border: "1px dashed #93c5fd", borderRadius: 6, padding: "7px 12px", cursor: "pointer", marginBottom: 12, width: "100%" }}>
                            + Weitere Bedingung hinzufügen
                          </button>

                          {/* Sonst / Fallback */}
                          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6b7280", cursor: "pointer", marginBottom: cond.useDefault ? 8 : 0 }}>
                              <input
                                type="checkbox"
                                checked={cond.useDefault}
                                onChange={e => setCondition(p, { useDefault: e.target.checked })}
                                style={{ width: 15, height: 15, accentColor: "#2563eb", flexShrink: 0 }}
                              />
                              <span><strong>Sonst:</strong> Standardwert verwenden (statt Originalwert)</span>
                            </label>
                            {cond.useDefault && (
                              <input
                                value={cond.default}
                                onChange={e => setCondition(p, { default: e.target.value })}
                                placeholder="Standardwert (leer lassen = Feld ausblenden)"
                                style={{ ...condInput, width: "100%", boxSizing: "border-box" }}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {mappedCount}/{placeholders.length} Platzhalter zugeordnet
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setStep(2)} style={ghostBtn}>← Zurück</button>
              <button onClick={() => setStep(4)} style={{ ...primaryBtn, flex: 1 }}>Weiter →</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Generate ──────────────────────────────── */}
        {step === 4 && (
          <div>
            <h3 style={h3}>PDF Generieren</h3>
            <p style={sub}>
              {totalRows} Umschläge · {selectedSheets.length} PDF{selectedSheets.length > 1 ? "s" : ""}
              {" · "}<strong>{selectedTemplate.name}</strong>
              {dataSource === "sheets" && <span style={{ color: "#6b7280", fontWeight: 400 }}> (Google Sheets)</span>}
            </p>

            {/* Summary */}
            {placeholders.length > 0 && (
              <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Mapping</div>
                {placeholders.map(p => (
                  <div key={p} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <code style={{ color: "#2563eb", background: "#eff6ff", padding: "1px 6px", borderRadius: 3 }}>{`{{${p}}}`}</code>
                    <span style={{ fontWeight: 600, color: mapping[p] ? "#111" : "#9ca3af" }}>
                      {mapping[p] || "nicht zugeordnet"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Dateiname (Basis)</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={filename} onChange={e => setFilename(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }} placeholder="umschlaege" />
                <span style={{ fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {selectedSheets.length > 1 ? "_Tabellenblatt.pdf" : ".pdf"}
                </span>
              </div>
            </div>

            {error && (
              <div style={{ background: "#fee2e2", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 16 }}>
                ❌ {error}
              </div>
            )}

            {/* Progress bars (shown while/after generating) */}
            {jobs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {jobs.map(job => (
                  <JobProgress key={job.sheetName} job={job} />
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(3)} disabled={generating} style={{ ...ghostBtn, opacity: generating ? 0.5 : 1 }}>← Zurück</button>
              {!generating && jobs.length === 0 && (
                <button onClick={handleGenerate} style={{ ...primaryBtn, flex: 1 }}>
                  ⬇ {totalRows} Umschläge generieren
                </button>
              )}
              {allDone && (
                <button onClick={onClose} style={{ ...primaryBtn, flex: 1, background: "#16a34a" }}>
                  ✓ Fertig — Schließen
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function JobProgress({ job }) {
  const pct   = job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;
  const done  = job.status === "done";
  const error = job.status === "error";

  return (
    <div style={{ background: "#f9fafb", borderRadius: 10, padding: "12px 14px", border: "1.5px solid #e5e7eb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{job.sheetName}</span>
        <span style={{ fontSize: 12, color: done ? "#16a34a" : error ? "#dc2626" : "#6b7280" }}>
          {done  ? "✅ Fertig — wird heruntergeladen" :
           error ? `❌ ${job.error}` :
           `${job.progress} / ${job.total} Umschläge`}
        </span>
      </div>
      <div style={{ background: "#e5e7eb", borderRadius: 99, height: 8, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          borderRadius: 99,
          width: `${done ? 100 : pct}%`,
          background: done ? "#16a34a" : error ? "#dc2626" : "#2563eb",
          transition: "width 0.3s ease",
        }} />
      </div>
      {!done && !error && (
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, textAlign: "right" }}>{pct}%</div>
      )}
    </div>
  );
}

function StepBar({ step }) {
  const steps = [["1","Vorlage"],["2","Daten"],["3","Mapping"],["4","PDF"]];
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
      {steps.map(([n, label], i) => {
        const done = step > i + 1, active = step === i + 1;
        return (
          <div key={n} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", margin: "0 auto 4px",
              background: done ? "#16a34a" : active ? "#2563eb" : "#e5e7eb",
              color: done || active ? "#fff" : "#9ca3af",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700 }}>
              {done ? "✓" : n}
            </div>
            <div className="gm-step-label" style={{ fontSize: 10, color: active ? "#2563eb" : "#9ca3af", fontWeight: active ? 700 : 400 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function DataPreview({ rows, columns }) {
  if (!rows.length) return null;
  const cols = columns.slice(0, 5);
  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f9fafb" }}>
            {cols.map(c => <th key={c} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{c}</th>)}
            {columns.length > 5 && <th style={{ padding: "6px 10px", color: "#9ca3af", fontSize: 11 }}>+{columns.length-5} Spalten</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              {cols.map(c => <td key={c} style={{ padding: "5px 10px", borderBottom: "1px solid #f3f4f6", color: "#6b7280", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(r[c] ?? "")}</td>)}
              {columns.length > 5 && <td style={{ padding: "5px 10px", color: "#9ca3af" }}>…</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const condInput     = { padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, outline: "none", background: "#fff", color: "#1e293b", minHeight: 40 };
const condSelect    = { padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, background: "#fff", color: "#1e293b", cursor: "pointer", minHeight: 40 };
const condRemoveBtn = { padding: "6px 10px", border: "1.5px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#dc2626", cursor: "pointer", fontSize: 13, flexShrink: 0, minHeight: 36 };

const h3 = { margin: "0 0 6px", fontSize: "clamp(16px, 4vw, 18px)", fontWeight: 700, color: "#111" };
const sub = { margin: "0 0 20px", fontSize: 13, color: "#6b7280" };
const tagStyle = { padding: "2px 8px", borderRadius: 20, background: "#eff6ff", color: "#2563eb", fontSize: 11, fontWeight: 600 };
const labelStyle = { display: "block", fontSize: 10.5, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const inputStyle = { width: "100%", padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff", minHeight: 44 };
const primaryBtn = { padding: "12px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "block", width: "100%", textAlign: "center", minHeight: 48 };
const ghostBtn   = { padding: "12px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer", minHeight: 48 };
