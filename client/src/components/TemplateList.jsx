// client/src/components/TemplateList.jsx
function TemplateList({ templates }) {
    if (!templates || templates.length === 0) {
      return <p>Keine Vorlagen vorhanden</p>;
    }
  
    return (
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          marginTop: 16,
          maxWidth: 480,
          width: "100%"
        }}
      >
        {templates.map((t) => {
          const layout = t.layout || {};
          const fields = layout.fields || [];
          const format = layout.format || "C4";
  
          return (
            <li
              key={t._id}
              style={{
                background: "#ffffff",
                padding: 16,
                marginBottom: 12,
                borderRadius: 12,
                boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
                display: "flex",
                flexDirection: "column",
                gap: 4
              }}
            >
              <strong>{t.name}</strong>
              <span style={{ fontSize: 14, color: "#555" }}>
                Schriftart: {t.font} – Format: {format}
              </span>
              <span style={{ fontSize: 12, color: "#888" }}>
                Textfelder: {fields.length}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  
  export default TemplateList;
  