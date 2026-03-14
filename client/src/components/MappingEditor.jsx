import { useState } from "react";

function MappingEditor({ template, columns, onSave }) {
  const [mapping, setMapping] = useState(
    template.mapping || []
  );

  function setMap(fieldId, columnName) {
    setMapping((p) => {
      const ex = p.filter((m) => m.fieldId !== fieldId);
      return [...ex, { fieldId, columnName }];
    });
  }

  return (
    <div style={{ background: "#fff", padding: 20, borderRadius: 12 }}>
      {template.fields.map((f) => (
        <div
          key={f.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 10
          }}
        >
          <span>{f.label}</span>
          <select
            value={
              mapping.find((m) => m.fieldId === f.id)?.columnName || ""
            }
            onChange={(e) => setMap(f.id, e.target.value)}
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid #ccc"
            }}
          >
            <option value="">—</option>
            {columns.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ))}

      <button
        onClick={() => onSave(mapping)}
        style={{
          marginTop: 10,
          padding: 10,
          background: "#1f7ae0",
          color: "#fff",
          borderRadius: 8,
          border: "none"
        }}
      >
        Speichern
      </button>
    </div>
  );
}

export default MappingEditor;
