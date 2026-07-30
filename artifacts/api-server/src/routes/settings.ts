import { Router } from "express";
import { getSettings, updateSettings } from "../lib/settings-storage.js";

const router = Router();

router.get("/settings", async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const { clarityTargetUrls, adCodes } = req.body as { clarityTargetUrls?: string[]; adCodes?: string[] };
  const urls = Array.isArray(clarityTargetUrls)
    ? clarityTargetUrls.map((u) => u.trim()).filter(Boolean)
    : [];
  const codes = Array.isArray(adCodes)
    ? adCodes.map((c) => c.trim()).filter(Boolean)
    : [];
  const updated = await updateSettings({ clarityTargetUrls: urls, adCodes: codes });
  res.json(updated);
});

export default router;
