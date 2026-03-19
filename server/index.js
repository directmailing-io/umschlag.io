import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import templateRoutes from "./routes/templateRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import sheetsRoutes from "./routes/sheetsRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5656;

app.use(cors());
// Serve fonts as static files — Puppeteer loads them via HTTP (avoids 24MB base64 payload)
app.use("/fonts", express.static(path.join(__dirname, "fonts")));
app.use("/api/sheets", sheetsRoutes);
app.use(express.json({ limit: "50mb" }));
app.use("/api/pdf", pdfRoutes);

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    await mongoose.connect(uri);
    console.log("MongoDB verbunden");
  } catch (err) {
    console.error("Fehler bei MongoDB Verbindung:", err.message);
    process.exit(1);
  }
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server läuft" });
});

app.use("/api/templates", templateRoutes);
app.use("/api/shares", shareRoutes);

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
  });
}

start();
