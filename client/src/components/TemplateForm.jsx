import { useState, useRef } from "react";

function TemplateForm({ onCreate, loading }) {
  const [name, setName] = useState("");
  const [font, setFont] = useState("LiebeHeide");
  const [format, setFormat] = useState("C4");
  const [fields, setFields] = useState([]);
  const [error, setError] = useState("");

  const previewRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  function addField() {
    const id = crypto.randomUUID();
    setFields((p) => [
      ...p,
      {
        id,
        label: "Neues Feld",
        x: 50,
        y: 50,
        fontSize: 26
      }
    ]);
  }

  function onMouseDown(e, field) {
    e.preventDefault();
    const rect = previewRef.current.getBoundingClientRect();

    setDragging(field.id);
    setDragOffset({
      x: e.clientX - rect.left - field.x,
      y: e.clientY - rect.top - field.y
    });
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const rect = previewRef.current.getBoundingClientRect();

    const nx = e.clientX - rect.left - dragOffset.x;
    const ny = e.clientY - rect.top - dragOffset.y;

    setFields((p) =>
      p.map((f) =>
        f.id === dragging ? { ...f, x: Math.round(nx), y: Math.round(ny) } : f
      )
    );
  }

  function stopDrag() {
    setDragging(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
  
    if (!name.trim()) {
      setError("Bitte einen Namen für die Vorlage eingeben");
      return;
    }
  
    if (fields.length === 0) {
      setError("Bitte mindestens ein Textfeld hinzufügen");
      return;
    }
  
    const payload = {
      name: name.trim(),
      font,
      layout: {
        format
      },
      fields
    };
  
    await onCreate(payload);
  }
  

  const aspect = format === "C4" ? 229 / 324 : 110 / 220;

  return (
    <form
      onSubmit={submit}
      style={{
        background: "#fff",
        padding: 20,
        borderRadius: 12,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Vorlagenname"
        style={{ padding: 8, border: "1px solid #ccc", borderRadius: 8 }}
      />

      <select
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        style={{ padding: 8, borderRadius: 8 }}
      >
        <option value="C4">C4</option>
        <option value="DIN_LANG">DIN Lang</option>
      </select>

      <select
        value={font}
        onChange={(e) => setFont(e.target.value)}
        style={{ padding: 8, borderRadius: 8 }}
      >
        <option value="LiebeHeide">LiebeHeide</option>
        <option value="BiroScript">BiroScript</option>
      </select>

      <button
        type="button"
        onClick={addField}
        style={{
          padding: 10,
          background: "#1f7ae0",
          color: "#fff",
          borderRadius: 8,
          border: "none",
          fontWeight: 600
        }}
      >
        + Textfeld
      </button>

      <div
        ref={previewRef}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        style={{
          position: "relative",
          width: "100%",
          paddingTop: `${aspect * 100}%`,
          border: "1px solid #ccc",
          borderRadius: 12,
          background: "#f3f3f3"
        }}
      >
        {fields.map((f) => (
          <div
            key={f.id}
            onMouseDown={(e) => onMouseDown(e, f)}
            style={{
              position: "absolute",
              left: f.x,
              top: f.y,
              padding: "6px 8px",
              background: "rgba(0,0,0,0.1)",
              border: "1px dashed #000",
              cursor: "move",
              fontSize: 12
            }}
          >
            {f.label}
          </div>
        ))}
      </div>

      {fields.map((f) => (
        <input
          key={f.id}
          value={f.label}
          onChange={(e) =>
            setFields((p) =>
              p.map((x) =>
                x.id === f.id ? { ...x, label: e.target.value } : x
              )
            )
          }
          placeholder="Feldname"
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #ccc"
          }}
        />
      ))}

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: 10,
          border: "none",
          borderRadius: 10,
          background: "#1f7ae0",
          color: "#fff",
          fontWeight: 600
        }}
      >
        Speichern
      </button>
    </form>
  );
}

export default TemplateForm;
