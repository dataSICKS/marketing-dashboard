import { Router } from "express";
import { getSettings, updateSettings } from "../lib/settings-storage.js";

const router = Router();

router.get("/settings", async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const { adCodes } = req.body as { adCodes?: string[] };
  const codes = Array.isArray(adCodes)
    ? adCodes.map((c) => c.trim()).filter(Boolean)
    : [];
  const updated = await updateSettings({ adCodes: codes });
  res.json(updated);
});

export default router;
