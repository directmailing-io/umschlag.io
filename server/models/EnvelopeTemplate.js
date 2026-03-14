import mongoose from "mongoose";

const FieldSchema = new mongoose.Schema(
  {
    id:         { type: String, required: true },
    label:      { type: String, required: true },  // display name in field list
    content:    { type: String, default: "" },      // template string: "{{Vorname}} {{Nachname}}" or static "Berlin, 2026"
    x:          { type: Number, required: true },   // % of envelope width
    y:          { type: Number, required: true },   // % of envelope height
    width:      { type: Number, default: 35 },      // % of envelope width
    fontSize:   { type: Number, default: 22 },      // pt
    lineHeight: { type: Number, default: 1.3 },     // multiplier
    font:       { type: String, default: "LiebeHeide" },
    color:      { type: String, default: "#000000" },
    // legacy fields kept for backwards compat
    isPlaceholder: { type: Boolean },
    staticText:    { type: String },
  },
  { _id: false }
);

const EnvelopeTemplateSchema = new mongoose.Schema(
  {
    name:   { type: String, required: true },
    format: {
      type: String,
      enum: ["DIN_LANG", "C4", "C5", "C6"],
      default: "DIN_LANG",
    },
    fields: { type: [FieldSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model(
  "EnvelopeTemplate",
  EnvelopeTemplateSchema,
  "umschlag_templates"
);
