import express from "express";
import {
  getTemplates,
  getTemplate,
  addTemplate,
  editTemplate,
  removeTemplate,
} from "../controllers/templateController.js";

const router = express.Router();

router.get("/", getTemplates);
router.get("/:id", getTemplate);
router.post("/", addTemplate);
router.put("/:id", editTemplate);
router.delete("/:id", removeTemplate);

export default router;
