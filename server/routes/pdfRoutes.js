import express from "express";
import { randomUUID } from "crypto";
import { generateEnvelopePDF } from "../utils/pdfGenerator.js";

const router = express.Router();

// In-memory job store: jobId → { status, progress, total, pdf, error, filename }
const jobs = new Map();

// Clean up completed jobs after 10 minutes
function scheduleCleanup(jobId) {
  setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
}

// POST /api/pdf/start — create and immediately kick off a job
router.post("/start", (req, res) => {
  const { recipients, template, mapping, filename } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ error: "Keine Empfänger" });
  }
  if (!template || !Array.isArray(template.fields)) {
    return res.status(400).json({ error: "Ungültiges Template" });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { status: "running", progress: 0, total: recipients.length, pdf: null, error: null, filename });

  // Run asynchronously
  (async () => {
    try {
      const pdf = await generateEnvelopePDF(
        recipients,
        template,
        mapping || {},
        (current, total) => {
          const job = jobs.get(jobId);
          if (job) { job.progress = current; job.total = total; }
        }
      );
      const job = jobs.get(jobId);
      if (job) { job.status = "done"; job.pdf = pdf; }
      scheduleCleanup(jobId);
    } catch (err) {
      console.error("PDF Job Fehler:", err);
      const job = jobs.get(jobId);
      if (job) { job.status = "error"; job.error = err.message; }
    }
  })();

  res.json({ jobId, total: recipients.length });
});

// GET /api/pdf/progress/:jobId — SSE stream
router.get("/progress/:jobId", (req, res) => {
  const { jobId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const interval = setInterval(() => {
    const job = jobs.get(jobId);
    if (!job) {
      send({ status: "error", error: "Job nicht gefunden" });
      clearInterval(interval);
      res.end();
      return;
    }
    send({ status: job.status, progress: job.progress, total: job.total, error: job.error });
    if (job.status === "done" || job.status === "error") {
      clearInterval(interval);
      res.end();
    }
  }, 250);

  req.on("close", () => clearInterval(interval));
});

// GET /api/pdf/download/:jobId — download completed PDF
router.get("/download/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || job.status !== "done" || !job.pdf) {
    return res.status(404).json({ error: "PDF nicht verfügbar" });
  }

  const name = (job.filename || "umschlaege").replace(/[^a-zA-Z0-9_\-]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
  res.send(Buffer.from(job.pdf));
});

export default router;
