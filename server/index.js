import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import templateRoutes from "./routes/templateRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import sheetsRoutes from "./routes/sheetsRoutes.js";


dotenv.config();

const app = express();
const PORT = 5656;

app.use(cors());
app.use("/api/sheets", sheetsRoutes);
app.use(express.json());
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

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
  });
}

start();
