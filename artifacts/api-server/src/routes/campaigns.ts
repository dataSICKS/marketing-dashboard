import { Router } from "express";
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
} from "../lib/campaigns-supabase.js";

const router = Router();

router.get("/campaigns", async (req, res): Promise<void> => {
  try {
    const campaigns = await listCampaigns();
    res.json({ campaigns });
  } catch (err) {
    req.log.error({ err }, "Failed to list campaigns");
    res.status(500).json({ error: "施策一覧の取得に失敗しました" });
  }
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const { title, startDate, endDate, memo, category } = req.body as {
    title?: string;
    startDate?: string;
    endDate?: string;
    memo?: string | null;
    category?: string | null;
  };
  if (!title || !startDate || !endDate) {
    res.status(400).json({ error: "title, startDate, endDate は必須です" });
    return;
  }
  try {
    const campaign = await createCampaign({ title, startDate, endDate, memo, category });
    res.status(201).json({ campaign });
  } catch (err) {
    req.log.error({ err }, "Failed to create campaign");
    res.status(500).json({ error: "施策の作成に失敗しました" });
  }
});

router.put("/campaigns/:id", async (req, res): Promise<void> => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "無効なIDです" });
    return;
  }
  const { title, startDate, endDate, memo, category } = req.body as {
    title?: string;
    startDate?: string;
    endDate?: string;
    memo?: string | null;
    category?: string | null;
  };
  if (!title || !startDate || !endDate) {
    res.status(400).json({ error: "title, startDate, endDate は必須です" });
    return;
  }
  try {
    const campaign = await updateCampaign(id, { title, startDate, endDate, memo, category });
    res.json({ campaign });
  } catch (err) {
    req.log.error({ err }, "Failed to update campaign");
    res.status(500).json({ error: "施策の更新に失敗しました" });
  }
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ error: "無効なIDです" });
    return;
  }
  try {
    await deleteCampaign(id);
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete campaign");
    res.status(500).json({ error: "施策の削除に失敗しました" });
  }
});

export default router;
