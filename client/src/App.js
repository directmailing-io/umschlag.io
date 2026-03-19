import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = "http://localhost:4000";

/* ─── SVG Icon Components ─────────────────────────────────────────────── */

const IconFile = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
    </svg>
);

const IconGrid = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
    </svg>
);

const IconTrash = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
);

const IconPlus = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const IconMinus = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const IconX = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const IconChevron = ({ open }) => (
    <svg
        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true"
        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
    >
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const IconCheck = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const IconAlert = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
);

const IconEnvelope = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
    </svg>
);

const IconInfo = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
);

/* ─── Constants ───────────────────────────────────────────────────────── */

const FIELDS = [
    { value: "vorname",  label: "Vorname" },
    { value: "nachname", label: "Nachname" },
    { value: "firma",    label: "Firma" },
    { value: "strae",    label: "Straße" },
    { value: "plz",      label: "PLZ" },
    { value: "stadt",    label: "Stadt" },
    { value: "land",     label: "Land" },
];

const OPERATORS = [
    { value: "equals",     label: "ist gleich" },
    { value: "contains",   label: "enthält" },
    { value: "startsWith", label: "beginnt mit" },
    { value: "endsWith",   label: "endet mit" },
];

const isValidGoogleSheetsUrl = (url) =>
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+/.test(url);

/* ─── Toast Component ─────────────────────────────────────────────────── */

function Toast({ toast, onClose }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 4500);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div
            className={`toast toast-${toast.type}`}
            role="status"
            aria-live="polite"
        >
            <span className="toast-icon">
                {toast.type === "success" ? <IconCheck /> : <IconAlert />}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={onClose} aria-label="Schließen">
                <IconX size={14} />
            </button>
        </div>
    );
}

/* ─── ConfirmDialog Component ─────────────────────────────────────────── */

function ConfirmDialog({ message, onConfirm, onCancel }) {
    return (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Bestätigung">
            <div className="dialog-box">
                <p className="dialog-message">{message}</p>
                <div className="dialog-actions">
                    <button className="dialog-cancel" onClick={onCancel}>Abbrechen</button>
                    <button className="dialog-confirm" onClick={onConfirm}>Löschen</button>
                </div>
            </div>
        </div>
    );
}

/* ─── Main App ────────────────────────────────────────────────────────── */

function App() {
    // Data source
    const [dataSource, setDataSource] = useState("excel");
    const [file, setFile] = useState(null);
    const [googleSheetsUrl, setGoogleSheetsUrl] = useState("");
    const fileInputRef = useRef(null);

    // Sender management
    const [senders, setSenders] = useState([]);
    const [selectedSenderId, setSelectedSenderId] = useState("");
    const [senderForm, setSenderForm] = useState({ line1: "", line2: "", line3: "" });
    const [confirmDelete, setConfirmDelete] = useState(null); // id to delete

    // Conditions (Wenn-Dann)
    const [conditionsOpen, setConditionsOpen] = useState(false);
    const [conditions, setConditions] = useState([]);

    // PDF settings
    const [format, setFormat] = useState("C4");
    const [filename, setFilename] = useState("umschlaege");

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => { loadSenders(); }, []);

    const showToast = (type, message) => setToast({ type, message });

    /* ─── Senders ─── */

    const loadSenders = async () => {
        try {
            const res = await fetch(`${API}/senders`);
            setSenders(await res.json());
        } catch {
            showToast("error", "Absender konnten nicht geladen werden.");
        }
    };

    const saveSender = async () => {
        if (!senderForm.line1.trim()) return;
        try {
            await fetch(`${API}/senders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(senderForm),
            });
            await loadSenders();
            showToast("success", "Absender gespeichert.");
        } catch {
            showToast("error", "Absender konnte nicht gespeichert werden.");
        }
    };

    const deleteSender = async (id) => {
        try {
            await fetch(`${API}/senders/${id}`, { method: "DELETE" });
            setSelectedSenderId("");
            setSenderForm({ line1: "", line2: "", line3: "" });
            await loadSenders();
            showToast("success", "Absender gelöscht.");
        } catch {
            showToast("error", "Absender konnte nicht gelöscht werden.");
        }
        setConfirmDelete(null);
    };

    const handleSelectSender = (id) => {
        setSelectedSenderId(id);
        const s = senders.find((x) => x.id === Number(id));
        if (!s) {
            setSenderForm({ line1: "", line2: "", line3: "" });
            return;
        }
        setSenderForm({ line1: s.line1 || "", line2: s.line2 || "", line3: s.line3 || "" });
    };

    /* ─── Conditions ─── */

    const addConditionRule = () => {
        setConditions([
            ...conditions,
            {
                field: "land",
                rules: [{ when: "", operator: "equals", then: "" }],
                useDefault: false,
                default: "",
            },
        ]);
        setConditionsOpen(true);
    };

    const removeConditionRule = (idx) =>
        setConditions(conditions.filter((_, i) => i !== idx));

    const updateConditionRule = (idx, updates) =>
        setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...updates } : c)));

    const addSubCondition = (ruleIdx) => {
        const rule = conditions[ruleIdx];
        updateConditionRule(ruleIdx, {
            rules: [...rule.rules, { when: "", operator: "equals", then: "" }],
        });
    };

    const removeSubCondition = (ruleIdx, subIdx) => {
        const rule = conditions[ruleIdx];
        updateConditionRule(ruleIdx, {
            rules: rule.rules.filter((_, i) => i !== subIdx),
        });
    };

    const updateSubCondition = (ruleIdx, subIdx, updates) => {
        const rule = conditions[ruleIdx];
        updateConditionRule(ruleIdx, {
            rules: rule.rules.map((r, i) => (i === subIdx ? { ...r, ...updates } : r)),
        });
    };

    /* ─── Submit ─── */

    const submit = async () => {
        setIsLoading(true);
        setToast(null);
        try {
            const formData = new FormData();

            if (dataSource === "excel" && file) {
                formData.append("file", file);
            } else if (dataSource === "google_sheets") {
                formData.append("googleSheetsUrl", googleSheetsUrl);
            }

            formData.append("format", format);
            formData.append("filename", filename);
            formData.append("sender1", senderForm.line1);
            formData.append("sender2", senderForm.line2);
            formData.append("sender3", senderForm.line3);

            const activeConditions = conditions.filter((c) =>
                c.rules.some((r) => r.when.trim())
            );
            if (activeConditions.length > 0) {
                formData.append("conditions", JSON.stringify(activeConditions));
            }

            const res = await fetch(`${API}/generate`, { method: "POST", body: formData });

            if (!res.ok) {
                const ct = res.headers.get("content-type") || "";
                if (ct.includes("application/json")) {
                    const err = await res.json();
                    throw new Error(err.error || "Unbekannter Fehler");
                }
                throw new Error(`Server-Fehler (${res.status})`);
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${filename || "umschlaege"}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            showToast("success", "PDF erfolgreich erstellt und heruntergeladen.");
        } catch (err) {
            showToast("error", err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const canSubmit =
        dataSource === "excel"
            ? !!file
            : isValidGoogleSheetsUrl(googleSheetsUrl);

    const urlState = googleSheetsUrl
        ? isValidGoogleSheetsUrl(googleSheetsUrl) ? "valid" : "invalid"
        : "";

    const activeConditionsCount = conditions.filter((c) =>
        c.rules.some((r) => r.when.trim())
    ).length;

    /* ─── Render ─── */

    return (
        <div className="app">
            {/* Toast */}
            {toast && <Toast toast={toast} onClose={() => setToast(null)} />}

            {/* Confirm Dialog */}
            {confirmDelete !== null && (
                <ConfirmDialog
                    message="Diesen Absender wirklich löschen?"
                    onConfirm={() => deleteSender(confirmDelete)}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}

            {/* Header */}
            <header className="app-header">
                <div className="app-logo"><IconEnvelope /></div>
                <h1 className="app-title">Umschlag Generator</h1>
                <p className="app-subtitle">PDF-Umschläge aus Excel oder Google Sheets erstellen</p>
            </header>

            {/* ── Card: Datenquelle ── */}
            <section className="card" aria-label="Datenquelle">
                <h2 className="card-title">Datenquelle</h2>

                <div className="source-tabs" role="tablist" aria-label="Datenquelle wählen">
                    <button
                        role="tab"
                        aria-selected={dataSource === "excel"}
                        className={`tab-btn ${dataSource === "excel" ? "tab-active" : ""}`}
                        onClick={() => setDataSource("excel")}
                    >
                        <IconFile />
                        Excel-Datei
                    </button>
                    <button
                        role="tab"
                        aria-selected={dataSource === "google_sheets"}
                        className={`tab-btn ${dataSource === "google_sheets" ? "tab-active" : ""}`}
                        onClick={() => setDataSource("google_sheets")}
                    >
                        <IconGrid />
                        Google Sheets
                    </button>
                </div>

                <div className="tab-panel">
                    {dataSource === "excel" ? (
                        <div>
                            <label
                                htmlFor="file-input"
                                className={`file-zone ${file ? "file-zone-filled" : ""}`}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    id="file-input"
                                    accept=".xlsx,.xls"
                                    className="file-input-hidden"
                                    onChange={(e) => setFile(e.target.files[0] || null)}
                                    aria-label="Excel-Datei auswählen"
                                />
                                <span className="file-zone-icon">
                                    {file ? <IconCheck /> : <IconFile />}
                                </span>
                                <span className="file-zone-text">
                                    {file ? file.name : "Excel-Datei auswählen oder hierhin ziehen"}
                                </span>
                                {!file && (
                                    <span className="file-zone-hint">.xlsx oder .xls</span>
                                )}
                            </label>
                            {file && (
                                <button
                                    className="clear-file-btn"
                                    onClick={() => {
                                        setFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = "";
                                    }}
                                    aria-label="Datei entfernen"
                                >
                                    <IconX size={13} />
                                    Datei entfernen
                                </button>
                            )}
                        </div>
                    ) : (
                        <div>
                            <div className={`url-row url-row-${urlState}`}>
                                <label htmlFor="sheets-url" className="sr-only">
                                    Google Sheets URL
                                </label>
                                <input
                                    id="sheets-url"
                                    type="url"
                                    className="url-input"
                                    placeholder="https://docs.google.com/spreadsheets/d/…"
                                    value={googleSheetsUrl}
                                    onChange={(e) => setGoogleSheetsUrl(e.target.value)}
                                    aria-describedby="url-hint"
                                    aria-invalid={urlState === "invalid"}
                                />
                                {urlState === "valid" && (
                                    <span className="url-badge url-badge-valid" aria-label="URL gültig">
                                        <IconCheck />
                                    </span>
                                )}
                                {urlState === "invalid" && (
                                    <span className="url-badge url-badge-invalid" aria-label="Ungültige URL">
                                        <IconX size={13} />
                                    </span>
                                )}
                            </div>
                            <p id="url-hint" className="hint-box">
                                <IconInfo />
                                <span>
                                    Die Tabelle muss öffentlich geteilt sein:
                                    Google Sheets → <strong>Teilen</strong> → <strong>Jeder mit dem Link kann anzeigen</strong>.
                                    Alle gängigen URL-Formate werden erkannt (inkl. <code>#gid=…</code> für bestimmte Blätter).
                                </span>
                            </p>
                            {urlState === "invalid" && googleSheetsUrl && (
                                <p className="field-error" role="alert">
                                    Keine gültige Google Sheets URL erkannt.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* ── Card: Absender ── */}
            <section className="card" aria-label="Absender">
                <h2 className="card-title">Absender</h2>
                <div className="field-stack">
                    <div className="sender-select-row">
                        <label htmlFor="sender-select" className="sr-only">
                            Gespeicherten Absender wählen
                        </label>
                        <select
                            id="sender-select"
                            className="select-field"
                            value={selectedSenderId}
                            onChange={(e) => handleSelectSender(e.target.value)}
                        >
                            <option value="">Gespeicherten Absender wählen …</option>
                            {senders.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.line1}
                                </option>
                            ))}
                        </select>
                        {selectedSenderId && (
                            <button
                                className="icon-danger-btn"
                                onClick={() => setConfirmDelete(Number(selectedSenderId))}
                                aria-label="Ausgewählten Absender löschen"
                                title="Absender löschen"
                            >
                                <IconTrash />
                            </button>
                        )}
                    </div>

                    <label htmlFor="sender-line1" className="sr-only">Name</label>
                    <input
                        id="sender-line1"
                        className="text-field"
                        placeholder="Name"
                        value={senderForm.line1}
                        onChange={(e) => setSenderForm({ ...senderForm, line1: e.target.value })}
                    />

                    <label htmlFor="sender-line2" className="sr-only">Adresse</label>
                    <input
                        id="sender-line2"
                        className="text-field"
                        placeholder="Adresse"
                        value={senderForm.line2}
                        onChange={(e) => setSenderForm({ ...senderForm, line2: e.target.value })}
                    />

                    <label htmlFor="sender-line3" className="sr-only">PLZ Ort</label>
                    <input
                        id="sender-line3"
                        className="text-field"
                        placeholder="PLZ Ort"
                        value={senderForm.line3}
                        onChange={(e) => setSenderForm({ ...senderForm, line3: e.target.value })}
                    />

                    <button
                        className="secondary-btn"
                        onClick={saveSender}
                        disabled={!senderForm.line1.trim()}
                    >
                        Absender speichern
                    </button>
                </div>
            </section>

            {/* ── Card: Platzhalter-Regeln (Wenn-Dann) ── */}
            <section className="card card-collapsible" aria-label="Platzhalter-Regeln">
                <button
                    className="collapse-trigger"
                    onClick={() => setConditionsOpen(!conditionsOpen)}
                    aria-expanded={conditionsOpen}
                    aria-controls="conditions-panel"
                >
                    <h2 className="card-title card-title-inline">Platzhalter-Regeln</h2>
                    <div className="collapse-meta">
                        {activeConditionsCount > 0 && (
                            <span className="badge" aria-label={`${activeConditionsCount} aktive Regeln`}>
                                {activeConditionsCount} aktiv
                            </span>
                        )}
                        {activeConditionsCount === 0 && !conditionsOpen && (
                            <span className="badge-muted">Optional</span>
                        )}
                        <IconChevron open={conditionsOpen} />
                    </div>
                </button>

                {conditionsOpen && (
                    <div id="conditions-panel" className="conditions-panel">
                        <p className="conditions-intro">
                            Transformieren Sie Felder dynamisch. Beispiel: Wenn „Land" gleich „Deutschland" ist → „DE" ausgeben.
                            Vergleiche sind nicht-Groß-/Kleinschreibungsabhängig.
                        </p>

                        {conditions.length === 0 && (
                            <div className="empty-rules">
                                Noch keine Regeln definiert. Klicken Sie auf „Neue Regel".
                            </div>
                        )}

                        {conditions.map((rule, ruleIdx) => (
                            <div key={ruleIdx} className="rule-card">
                                {/* Rule header */}
                                <div className="rule-header">
                                    <div className="rule-field-row">
                                        <label
                                            htmlFor={`rule-field-${ruleIdx}`}
                                            className="rule-field-label"
                                        >
                                            Feld
                                        </label>
                                        <select
                                            id={`rule-field-${ruleIdx}`}
                                            className="rule-field-select"
                                            value={rule.field}
                                            onChange={(e) =>
                                                updateConditionRule(ruleIdx, { field: e.target.value })
                                            }
                                        >
                                            {FIELDS.map((f) => (
                                                <option key={f.value} value={f.value}>
                                                    {f.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        className="rule-remove-btn"
                                        onClick={() => removeConditionRule(ruleIdx)}
                                        aria-label={`Regel für ${FIELDS.find(f => f.value === rule.field)?.label} entfernen`}
                                    >
                                        <IconX size={13} />
                                        Regel entfernen
                                    </button>
                                </div>

                                {/* Sub-conditions */}
                                <div className="sub-conditions">
                                    {rule.rules.map((sub, subIdx) => (
                                        <div key={subIdx} className="sub-row">
                                            <span className="sub-label">Wenn</span>
                                            <input
                                                className="sub-input"
                                                placeholder="Wert …"
                                                value={sub.when}
                                                aria-label={`Bedingungswert ${subIdx + 1}`}
                                                onChange={(e) =>
                                                    updateSubCondition(ruleIdx, subIdx, { when: e.target.value })
                                                }
                                            />
                                            <select
                                                className="sub-operator"
                                                value={sub.operator}
                                                aria-label="Operator"
                                                onChange={(e) =>
                                                    updateSubCondition(ruleIdx, subIdx, { operator: e.target.value })
                                                }
                                            >
                                                {OPERATORS.map((op) => (
                                                    <option key={op.value} value={op.value}>
                                                        {op.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <span className="sub-arrow" aria-hidden="true">→</span>
                                            <input
                                                className="sub-input"
                                                placeholder="Ausgabe …"
                                                value={sub.then}
                                                aria-label={`Ausgabewert ${subIdx + 1}`}
                                                onChange={(e) =>
                                                    updateSubCondition(ruleIdx, subIdx, { then: e.target.value })
                                                }
                                            />
                                            {rule.rules.length > 1 && (
                                                <button
                                                    className="sub-remove-btn"
                                                    onClick={() => removeSubCondition(ruleIdx, subIdx)}
                                                    aria-label={`Bedingung ${subIdx + 1} entfernen`}
                                                >
                                                    <IconMinus />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Rule footer */}
                                <div className="rule-footer">
                                    <button
                                        className="add-sub-btn"
                                        onClick={() => addSubCondition(ruleIdx)}
                                    >
                                        <IconPlus />
                                        Weitere Wenn–Dann
                                    </button>

                                    <div className="default-row">
                                        <label className="default-toggle">
                                            <input
                                                type="checkbox"
                                                checked={rule.useDefault}
                                                onChange={(e) =>
                                                    updateConditionRule(ruleIdx, { useDefault: e.target.checked })
                                                }
                                            />
                                            <span>Sonst:</span>
                                        </label>
                                        {rule.useDefault ? (
                                            <input
                                                className="default-input"
                                                placeholder="Ausgabe (leer = Feld ausblenden)"
                                                value={rule.default}
                                                aria-label="Standardwert wenn keine Bedingung zutrifft"
                                                onChange={(e) =>
                                                    updateConditionRule(ruleIdx, { default: e.target.value })
                                                }
                                            />
                                        ) : (
                                            <span className="default-muted">Originalwert behalten</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        <button className="add-rule-btn" onClick={addConditionRule}>
                            <IconPlus />
                            Neue Regel hinzufügen
                        </button>
                    </div>
                )}
            </section>

            {/* ── Card: Dateiname ── */}
            <section className="card" aria-label="Dateiname">
                <h2 className="card-title">Dateiname</h2>
                <label htmlFor="filename-input" className="sr-only">Dateiname für das PDF</label>
                <input
                    id="filename-input"
                    className="text-field"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    aria-describedby="filename-hint"
                />
                <p id="filename-hint" className="field-hint">
                    Die Datei wird als <strong>{(filename || "umschlaege").replace(/[^a-z0-9-_]/gi, "_").toLowerCase()}.pdf</strong> gespeichert.
                </p>
            </section>

            {/* ── Card: Format ── */}
            <section className="card" aria-label="Format">
                <h2 className="card-title">Umschlag-Format</h2>
                <div className="format-grid" role="group" aria-label="Format wählen">
                    {[
                        { id: "C4",      label: "C4",       dims: "324 × 229 mm", desc: "Für A4-Dokumente gefaltet" },
                        { id: "DIN_LANG", label: "DIN Lang", dims: "220 × 110 mm", desc: "Für DIN-A4 gedrittelt" },
                    ].map(({ id, label, dims, desc }) => (
                        <button
                            key={id}
                            className={`format-btn ${format === id ? "format-btn-active" : ""}`}
                            onClick={() => setFormat(id)}
                            aria-pressed={format === id}
                        >
                            <span className="format-label">{label}</span>
                            <span className="format-dims">{dims}</span>
                            <span className="format-desc">{desc}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* ── Submit ── */}
            <button
                className={`primary-btn ${isLoading ? "primary-btn-loading" : ""}`}
                onClick={submit}
                disabled={!canSubmit || isLoading}
                aria-busy={isLoading}
                aria-label={isLoading ? "PDF wird erstellt …" : "PDF erstellen"}
            >
                {isLoading ? (
                    <>
                        <span className="spinner" aria-hidden="true" />
                        Wird erstellt …
                    </>
                ) : (
                    "PDF erstellen"
                )}
            </button>
        </div>
    );
}

export default App;
