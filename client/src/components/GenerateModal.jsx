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
  const [workbook, setWorkbook]             = useState(null);
  const [selectedSheets, setSelectedSheets] = useState([]);
  const [sheetRowCounts, setSheetRowCounts] = useState({});
  // columns/rows come from first selected sheet — used for mapping + preview
  const [columns, setColumns]               = useState([]);
  const [previewRows, setPreviewRows]       = useState([]);
  const [mapping, setMapping]               = useState({});
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

  function selectTemplate(t) {
    setTemplate(t);
    const m = {};
    extractPlaceholders(t).forEach(p => { m[p] = ""; });
    setMapping(m);
    setStep(2);
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
    if (!selectedTemplate || selectedSheets.length === 0) return;
    setGenerating(true);
    setError("");

    // Init job list
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
        const res = await fetch(`${API}/pdf/start`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            recipients: sheetRows,
            template:   selectedTemplate,
            mapping,
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
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 620, maxHeight: "90vh",
        overflow: "auto", padding: "32px 36px", position: "relative",
        boxShadow: "0 24px 64px rgba(0,0,0,0.22)" }}>

        <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18,
          background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af" }}>✕</button>

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

        {/* ── STEP 2: Excel ─────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h3 style={h3}>Excel-Datei laden</h3>
            <p style={sub}>Vorlage: <strong>{selectedTemplate.name}</strong></p>

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
                  <div style={{ fontSize: 40, marginBottom: 10, pointerEvents: "none" }}>
                    {draggingFile ? "📥" : "📂"}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: draggingFile ? "#2563eb" : "#374151", pointerEvents: "none" }}>
                    {draggingFile ? "Datei hier ablegen" : "Excel-Datei auswählen oder hier ablegen"}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, pointerEvents: "none" }}>.xlsx · .xls</div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, pointerEvents: "none" }}>
                  <span style={{ fontSize: 22 }}>✅</span>
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
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                          borderRadius: 8, border: `1.5px solid ${checked ? "#2563eb" : "#e5e7eb"}`,
                          background: checked ? "#eff6ff" : "#f9fafb", cursor: "pointer",
                        }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => toggleSheet(name)}
                            style={{ width: 15, height: 15, accentColor: "#2563eb" }} />
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

                {/* Preview of first selected sheet */}
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

        {/* ── STEP 3: Mapping ───────────────────────────────── */}
        {step === 3 && (
          <div>
            <h3 style={h3}>Spalten zuordnen</h3>
            <p style={sub}>
              {selectedSheets.length > 1
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
                {placeholders.map(p => (
                  <div key={p}>
                    <label style={labelStyle}>
                      <code style={{ background: "#eff6ff", color: "#2563eb", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>{`{{${p}}}`}</code>
                      <span style={{ color: "#16a34a", marginLeft: 6, fontSize: 10 }}>→ Excel-Spalte</span>
                    </label>
                    <select value={mapping[p] || ""} onChange={e => setMapping(m => ({ ...m, [p]: e.target.value }))} style={inputStyle}>
                      <option value="">(nicht zuordnen)</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
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
                <span style={{ fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap" }}>
                  {selectedSheets.length > 1 ? "_Blattname.pdf" : ".pdf"}
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
  const steps = [["1","Vorlage"],["2","Excel"],["3","Mapping"],["4","PDF"]];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
      {steps.map(([n, label], i) => {
        const done = step > i + 1, active = step === i + 1;
        return (
          <div key={n} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", margin: "0 auto 4px",
              background: done ? "#16a34a" : active ? "#2563eb" : "#e5e7eb",
              color: done || active ? "#fff" : "#9ca3af",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700 }}>
              {done ? "✓" : n}
            </div>
            <div style={{ fontSize: 10, color: active ? "#2563eb" : "#9ca3af", fontWeight: active ? 700 : 400 }}>{label}</div>
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

const h3 = { margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#111" };
const sub = { margin: "0 0 20px", fontSize: 13, color: "#6b7280" };
const tagStyle = { padding: "2px 8px", borderRadius: 20, background: "#eff6ff", color: "#2563eb", fontSize: 11, fontWeight: 600 };
const labelStyle = { display: "block", fontSize: 10.5, fontWeight: 700, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" };
const inputStyle = { width: "100%", padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" };
const primaryBtn = { padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "block", width: "100%", textAlign: "center" };
const ghostBtn   = { padding: "10px 16px", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: "pointer" };
