import { Router, type IRouter } from "express";
import { fetchCalcSheet } from "../lib/newsletter-sheets.js";
import {
  aggregateRows,
  computeSummary,
  mergeComparisonMetrics,
  getUniqueSegments,
  type GroupBy,
} from "../lib/newsletter-aggregate.js";
import { getCache, setCache } from "../lib/newsletter-cache.js";
import { upsertRows, fetchRowsFromSupabase } from "../lib/newsletter-supabase.js";
import { GetNewsletterDataQueryParams } from "@workspace/api-zod";
import type { NewsletterRow } from "../lib/newsletter-types.js";

const router: IRouter = Router();

async function getRows(req: { log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void } }): Promise<{ rows: NewsletterRow[]; syncedAt: string }> {
  let cached = getCache();
  if (!cached) {
    req.log.info("No in-memory cache, fetching from Supabase");
    const { rows: supabaseRows, syncedAt: supabaseSyncedAt } = await fetchRowsFromSupabase();
    if (supabaseRows.length > 0 && supabaseSyncedAt) {
      setCache(supabaseRows, supabaseSyncedAt);
      cached = { rows: supabaseRows, syncedAt: supabaseSyncedAt };
    } else {
      req.log.info("Supabase empty, fetching from Google Sheets");
      const rows = await fetchCalcSheet();
      const syncedAt = new Date().toISOString();
      await upsertRows(rows, syncedAt);
      setCache(rows, syncedAt);
      cached = { rows, syncedAt };
    }
  }
  return cached;
}

router.post("/newsletter/sync", async (req, res): Promise<void> => {
  try {
    req.log.info("Syncing newsletter data from Google Sheets");
    const rows = await fetchCalcSheet();
    const syncedAt = new Date().toISOString();
    await upsertRows(rows, syncedAt);
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
    const groupBy: GroupBy = ((parsed.success ? parsed.data.groupBy : "day") ?? "day") as GroupBy;
    const dateFrom = parsed.success ? (parsed.data.dateFrom ?? undefined) : undefined;
    const dateTo = parsed.success ? (parsed.data.dateTo ?? undefined) : undefined;
    const segmentParam = parsed.success ? ((parsed.data as Record<string, unknown>).segment as string | undefined) : undefined;
    const compareFrom = parsed.success ? ((parsed.data as Record<string, unknown>).compareFrom as string | undefined) : undefined;
    const compareTo = parsed.success ? ((parsed.data as Record<string, unknown>).compareTo as string | undefined) : undefined;

    const { rows: allRows, syncedAt } = await getRows(req);

    const availableSegments = getUniqueSegments(allRows);

    // parse comma-separated segments
    const selectedSegments = segmentParam
      ? segmentParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // filter current period
    let rows = allRows;
    if (dateFrom) rows = rows.filter((r) => r.deliveryDate >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.deliveryDate <= dateTo);

    // filter prev period
    let prevRows: NewsletterRow[] = [];
    const hasComparison = !!(compareFrom || compareTo);
    if (hasComparison) {
      prevRows = allRows;
      if (compareFrom) prevRows = prevRows.filter((r) => r.deliveryDate >= compareFrom);
      if (compareTo) prevRows = prevRows.filter((r) => r.deliveryDate <= compareTo);
    }

    // no segment filter → single flat aggregation
    if (selectedSegments.length === 0) {
      let items = aggregateRows(rows, groupBy);
      const summary = computeSummary(rows);

      if (hasComparison) {
        const prevItems = aggregateRows(prevRows, groupBy);
        items = mergeComparisonMetrics(items, prevItems);
      }

      res.json({ groupBy, items, segmentGroups: [], summary, lastSyncedAt: syncedAt, availableSegments });
      return;
    }

    // segment filter → build segmentGroups
    const segmentGroups = selectedSegments.map((seg) => {
      const segRows = rows.filter((r) => r.segment === seg);
      let items = aggregateRows(segRows, groupBy);
      const summary = computeSummary(segRows);
      if (hasComparison) {
        const prevSegRows = prevRows.filter((r) => r.segment === seg);
        const prevItems = aggregateRows(prevSegRows, groupBy);
        items = mergeComparisonMetrics(items, prevItems);
      }
      return { segment: seg, items, summary };
    });

    // top-level items = all selected segments combined
    const combinedRows = selectedSegments.length > 0
      ? rows.filter((r) => selectedSegments.includes(r.segment))
      : rows;
    let items = aggregateRows(combinedRows, groupBy);
    const summary = computeSummary(combinedRows);
    if (hasComparison) {
      const prevCombined = prevRows.filter((r) => selectedSegments.includes(r.segment));
      items = mergeComparisonMetrics(items, aggregateRows(prevCombined, groupBy));
    }

    res.json({ groupBy, items, segmentGroups, summary, lastSyncedAt: syncedAt, availableSegments });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch newsletter data");
    res.status(500).json({ error: "データ取得に失敗しました" });
  }
});

router.get("/newsletter/segments", async (req, res): Promise<void> => {
  try {
    const { rows } = await getRows(req);
    const segments = getUniqueSegments(rows);
    res.json({ segments });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch segments");
    res.status(500).json({ error: "セグメント取得に失敗しました" });
  }
});

export default router;
