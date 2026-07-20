import { Router } from "express";
import { getSettings, updateSettings } from "../lib/settings-storage.js";

const router = Router();

router.get("/settings", async (req, res) => {
  const settings = await getSettings();
  res.json(settings);
});

router.put("/settings", async (req, res) => {
  const { clarityTargetUrl } = req.body as { clarityTargetUrl?: string | null };
  const updated = await updateSettings({ clarityTargetUrl: clarityTargetUrl ?? null });
  res.json(updated);
});

export default router;
