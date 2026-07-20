import { Router } from "express";
import { getSettings, updateSettings } from "../lib/settings-storage.js";

const router = Router();

router.get("/settings", async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const { clarityTargetUrls } = req.body as { clarityTargetUrls?: string[] };
  const urls = Array.isArray(clarityTargetUrls)
    ? clarityTargetUrls.map((u) => u.trim()).filter(Boolean)
    : [];
  const updated = await updateSettings({ clarityTargetUrls: urls });
  res.json(updated);
});

export default router;
