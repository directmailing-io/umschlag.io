import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../services/templateService.js";

export async function getTemplates(req, res) {
  try {
    res.json(await getAllTemplates());
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Laden" });
  }
}

export async function getTemplate(req, res) {
  try {
    const t = await getTemplateById(req.params.id);
    if (!t) return res.status(404).json({ error: "Nicht gefunden" });
    res.json(t);
  } catch (err) {
    res.status(500).json({ error: "Fehler" });
  }
}

export async function addTemplate(req, res) {
  try {
    res.json(await createTemplate(req.body));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Fehler beim Speichern" });
  }
}

export async function editTemplate(req, res) {
  try {
    const t = await updateTemplate(req.params.id, req.body);
    if (!t) return res.status(404).json({ error: "Nicht gefunden" });
    res.json(t);
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Aktualisieren" });
  }
}

export async function removeTemplate(req, res) {
  try {
    await deleteTemplate(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Löschen" });
  }
}
