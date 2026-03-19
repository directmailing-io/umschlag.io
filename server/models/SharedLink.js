import mongoose from "mongoose";

const SharedLinkSchema = new mongoose.Schema({
  shareId:    { type: String, required: true, unique: true }, // UUID shown in URL
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: "EnvelopeTemplate", required: true },
  type:       { type: String, enum: ["free", "paid"], default: "free" },
  // Paid options
  priceGross: { type: Number },   // gross amount in cents (inkl. MwSt.), e.g. 999 = €9.99
  vatRate:    { type: Number, default: 0 }, // 0, 0.07, or 0.19
  currency:   { type: String, default: "eur" },
  label:        { type: String, default: "" }, // Optional description shown at checkout
  frontendBase: { type: String, default: "" }, // Frontend URL for Stripe redirects
}, { timestamps: true });

export default mongoose.model("SharedLink", SharedLinkSchema);
