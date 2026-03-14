import express from "express";
import { randomUUID } from "crypto";
import { generateEnvelopePDF } from "../utils/pdfGenerator.js";

const router = express.Router();

// In-memory job store
const jobs = new Map();

// Limit concurrent Puppeteer (Chrome) jobs to avoid memory exhaustion
let puppeteerJobsRunning = 0;
const MAX_PUPPETEER_CONCURRENT = 1;
const puppeteerQueue = []; // { jobId, run }

function scheduleCleanup(jobId) {
  setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000); // 15 min
}

function runNextPuppeteerJob() {
  if (puppeteerQueue.length === 0 || puppeteerJobsRunning >= MAX_PUPPETEER_CONCURRENT) return;
  const { jobId, run } = puppeteerQueue.shift();
  puppeteerJobsRunning++;
  const job = jobs.get(jobId);
  if (job) job.status = "running";
  run().finally(() => {
    puppeteerJobsRunning--;
    runNextPuppeteerJob();
  });
}

// POST /api/pdf/start — kick off a job
router.post("/start", (req, res) => {
  const { recipients, template, mapping, filename } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0)
    return res.status(400).json({ error: "Keine Empfänger" });
  if (!template || !Array.isArray(template.fields))
    return res.status(400).json({ error: "Ungültiges Template" });

  const jobId = randomUUID();
  const needsPuppeteer = template.fields.some(f => f.font === "LiebeHeide");

  jobs.set(jobId, {
    status:   needsPuppeteer && puppeteerJobsRunning >= MAX_PUPPETEER_CONCURRENT ? "queued" : "running",
    progress: 0,
    total:    recipients.length,
    pdf:      null,
    error:    null,
    filename,
  });

  const run = async () => {
    try {
      const pdf = await generateEnvelopePDF(
        recipients, template, mapping || {},
        (current, total) => {
          const j = jobs.get(jobId);
          if (j) { j.progress = current; j.total = total; }
        }
      );
      const j = jobs.get(jobId);
      if (j) { j.status = "done"; j.pdf = pdf; }
      scheduleCleanup(jobId);
    } catch (err) {
      console.error("PDF Job Fehler:", err);
      const j = jobs.get(jobId);
      if (j) { j.status = "error"; j.error = err.message; }
    }
  };

  if (needsPuppeteer) {
    puppeteerQueue.push({ jobId, run });
    runNextPuppeteerJob();
  } else {
    // Direct generator: no concurrency limit needed, run immediately
    run();
  }

  res.json({ jobId, total: recipients.length });
});

// GET /api/pdf/progress/:jobId — SSE stream
router.get("/progress/:jobId", (req, res) => {
  const { jobId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/Railway buffering
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Progress polling
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
  }, 300);

  // Keepalive comment every 20s — prevents Railway/nginx from closing idle SSE connection
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(": keepalive\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(keepAlive);
  });
});

// GET /api/pdf/download/:jobId — download completed PDF
router.get("/download/:jobId", (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || job.status !== "done" || !job.pdf)
    return res.status(404).json({ error: "PDF nicht verfügbar" });

  const name = (job.filename || "umschlaege").replace(/[^a-zA-Z0-9_\-]/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
  res.send(Buffer.from(job.pdf));
});

export default router;
