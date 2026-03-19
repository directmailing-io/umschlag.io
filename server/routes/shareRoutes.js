import express from "express";
import { v4 as uuidv4 } from "uuid";
import Stripe from "stripe";
import SharedLink from "../models/SharedLink.js";
import EnvelopeTemplate from "../models/EnvelopeTemplate.js";

const router = express.Router();

// Lazy Stripe initialization — avoids crash when STRIPE_SECRET_KEY is not set at startup
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY ist nicht konfiguriert");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/shares — create a share link (free or paid)
router.post("/", async (req, res) => {
  try {
    const { templateId, type, priceGross, vatRate, label } = req.body;

    const template = await EnvelopeTemplate.findById(templateId);
    if (!template) return res.status(404).json({ error: "Vorlage nicht gefunden" });

    const shareId = uuidv4();
    const link = await SharedLink.create({
      shareId,
      templateId,
      type: type || "free",
      priceGross: type === "paid" ? Math.round(Number(priceGross)) : undefined,
      vatRate: type === "paid" ? Number(vatRate || 0) : 0,
      label: label || template.name,
    });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    res.json({ shareId, url: `${appUrl}/?share=${shareId}` });
  } catch (err) {
    console.error("Share create error:", err);
    res.status(500).json({ error: "Fehler beim Erstellen des Links" });
  }
});

// GET /api/shares/:shareId — get share info + template (public)
router.get("/:shareId", async (req, res) => {
  try {
    const link = await SharedLink.findOne({ shareId: req.params.shareId })
      .populate("templateId");

    if (!link || !link.templateId) {
      return res.status(404).json({ error: "Link nicht gefunden oder Vorlage gelöscht" });
    }

    res.json({
      shareId: link.shareId,
      type: link.type,
      priceGross: link.priceGross,
      vatRate: link.vatRate,
      currency: link.currency,
      label: link.label,
      template: link.type === "free" ? link.templateId : {
        // For paid links, only expose the template name (not fields) until paid
        _id: link.templateId._id,
        name: link.templateId.name,
        format: link.templateId.format,
      },
    });
  } catch (err) {
    console.error("Share get error:", err);
    res.status(500).json({ error: "Serverfehler" });
  }
});

// POST /api/shares/:shareId/checkout — create Stripe Checkout session
router.post("/:shareId/checkout", async (req, res) => {
  try {
    const link = await SharedLink.findOne({ shareId: req.params.shareId })
      .populate("templateId");

    if (!link) return res.status(404).json({ error: "Link nicht gefunden" });
    if (link.type !== "paid") return res.status(400).json({ error: "Dieser Link ist kostenlos" });

    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const templateName = link.templateId?.name || link.label || "Vorlage";

    // Calculate net amount from gross
    const grossCents = link.priceGross;
    const vatRate    = link.vatRate || 0;
    const netCents   = vatRate > 0
      ? Math.round(grossCents / (1 + vatRate))
      : grossCents;
    const taxCents   = grossCents - netCents;

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      currency: link.currency || "eur",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: link.currency || "eur",
          unit_amount: netCents,
          product_data: {
            name: templateName,
            description: link.label !== templateName ? link.label : undefined,
          },
          ...(vatRate > 0 ? {
            tax_behavior: "exclusive",
          } : {}),
        },
      }],
      ...(vatRate > 0 ? {
        automatic_tax: { enabled: false },
      } : {}),
      payment_method_types: ["card", "sepa_debit", "paypal", "klarna", "giropay", "bancontact", "ideal"],
      success_url: `${appUrl}/?share=${link.shareId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/?share=${link.shareId}&cancelled=1`,
      metadata: { shareId: link.shareId },
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Stripe Fehler: " + (err.message || "Unbekannt") });
  }
});

// GET /api/shares/:shareId/verify/:sessionId — verify Stripe payment
router.get("/:shareId/verify/:sessionId", async (req, res) => {
  try {
    const link = await SharedLink.findOne({ shareId: req.params.shareId })
      .populate("templateId");

    if (!link || !link.templateId) {
      return res.status(404).json({ error: "Link nicht gefunden" });
    }

    const session = await getStripe().checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Zahlung noch nicht abgeschlossen", status: session.payment_status });
    }

    // Verify this session belongs to this share link
    if (session.metadata?.shareId !== req.params.shareId) {
      return res.status(403).json({ error: "Session gehört nicht zu diesem Link" });
    }

    res.json({
      paid: true,
      template: link.templateId,
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ error: "Verifizierung fehlgeschlagen: " + (err.message || "Unbekannt") });
  }
});

export default router;
