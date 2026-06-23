import { Router, type IRouter } from "express";
import { fetchCalcSheet } from "../lib/newsletter-sheets.js";
import { aggregateRows, computeSummary, type GroupBy } from "../lib/newsletter-aggregate.js";
import { getCache, setCache } from "../lib/newsletter-cache.js";
import { GetNewsletterDataQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/newsletter/sync", async (req, res): Promise<void> => {
  try {
    req.log.info("Syncing newsletter data from Google Sheets");
    const rows = await fetchCalcSheet();
    const syncedAt = new Date().toISOString();
    setCache(rows, syncedAt);
    res.json({ rowCount: rows.length, syncedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to sync newsletter data");
    res.status(500).json({ error: "Google Sheets からのデータ取得に失敗しました" });
  }
});

router.get("/newsletter/data", async (req, res): Promise<void> => {
  try {
    const parsed = GetNewsletterDataQueryParams.safeParse(req.query);
    const groupBy: GroupBy = (parsed.success ? parsed.data.groupBy : "day") as GroupBy ?? "day";
    const dateFrom = parsed.success ? parsed.data.dateFrom : undefined;
    const dateTo = parsed.success ? parsed.data.dateTo : undefined;

    let cached = getCache();

    if (!cached) {
      req.log.info("No cache found, fetching from Google Sheets");
      const rows = await fetchCalcSheet();
      const syncedAt = new Date().toISOString();
      setCache(rows, syncedAt);
      cached = { rows, syncedAt };
    }

    let rows = cached.rows;

    if (dateFrom) {
      rows = rows.filter((r) => r.deliveryDate >= dateFrom);
    }
    if (dateTo) {
      rows = rows.filter((r) => r.deliveryDate <= dateTo);
    }

    const items = aggregateRows(rows, groupBy);
    const summary = computeSummary(rows);

    res.json({
      groupBy,
      items,
      summary,
      lastSyncedAt: cached.syncedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch newsletter data");
    res.status(500).json({ error: "データ取得に失敗しました" });
  }
});

export default router;
