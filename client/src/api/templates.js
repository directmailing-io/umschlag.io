const BASE = (import.meta.env.VITE_API_URL || "http://localhost:5656") + "/api";

export async function fetchTemplates() {
  const res = await fetch(`${BASE}/templates`);
  if (!res.ok) throw new Error("Laden fehlgeschlagen");
  return res.json();
}

export async function createTemplate(data) {
  const res = await fetch(`${BASE}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Speichern fehlgeschlagen");
  return res.json();
}

export async function updateTemplate(id, data) {
  const res = await fetch(`${BASE}/templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Aktualisieren fehlgeschlagen");
  return res.json();
}

export async function deleteTemplate(id) {
  const res = await fetch(`${BASE}/templates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Löschen fehlgeschlagen");
  return res.json();
}
