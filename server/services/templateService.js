import EnvelopeTemplate from "../models/EnvelopeTemplate.js";

export async function getAllTemplates() {
  return EnvelopeTemplate.find().sort({ createdAt: -1 }).lean();
}

export async function getTemplateById(id) {
  return EnvelopeTemplate.findById(id).lean();
}

export async function createTemplate(data) {
  const { name, format, fields } = data;
  return EnvelopeTemplate.create({ name, format: format || "DIN_LANG", fields: fields || [] });
}

export async function updateTemplate(id, data) {
  const { name, format, fields } = data;
  return EnvelopeTemplate.findByIdAndUpdate(
    id,
    { name, format, fields },
    { new: true }
  ).lean();
}

export async function deleteTemplate(id) {
  return EnvelopeTemplate.findByIdAndDelete(id);
}
