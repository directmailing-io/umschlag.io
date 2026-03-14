/**
 * Orchestrator: routes to the fastest generator based on fonts used.
 *
 * - No LiebeHeide → pdfGeneratorDirect (pdf-lib, no Puppeteer, ~10ms/envelope)
 * - LiebeHeide    → pdfGeneratorPuppeteer (batched page.pdf(), ~150 envelopes/call)
 */
import { generatePdfDirect }     from "./pdfGeneratorDirect.js";
import { generatePdfPuppeteer }  from "./pdfGeneratorPuppeteer.js";

export async function generateEnvelopePDF(recipients, template, mapping, onProgress) {
  const needsPuppeteer = (template.fields || []).some(f => f.font === "LiebeHeide");

  if (needsPuppeteer) {
    return generatePdfPuppeteer(recipients, template, mapping, onProgress);
  } else {
    return generatePdfDirect(recipients, template, mapping, onProgress);
  }
}
