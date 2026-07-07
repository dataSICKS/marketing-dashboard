import { Router, type IRouter } from "express";
import { fetchCalcSheet } from "../lib/newsletter-sheets.js";
import {
  aggregateRows,
  computeSummary,
  mergeComparisonMetrics,
  computeMatrixData,
  getUniqueSegments,
  getUniqueTemplates,
  type GroupBy,
  type MatrixMetric,
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
    const templateNameParam = parsed.success ? ((parsed.data as Record<string, unknown>).templateName as string | undefined) : undefined;
    const compareFrom = parsed.success ? ((parsed.data as Record<string, unknown>).compareFrom as string | undefined) : undefined;
    const compareTo = parsed.success ? ((parsed.data as Record<string, unknown>).compareTo as string | undefined) : undefined;

    const { rows: allRows, syncedAt } = await getRows(req);

    const availableSegments = getUniqueSegments(allRows);

    // parse comma-separated segments
    const selectedSegments = segmentParam
      ? segmentParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // parse comma-separated template names
    const selectedTemplates = templateNameParam
      ? templateNameParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // filter current period
    let rows = allRows;
    if (dateFrom) rows = rows.filter((r) => r.deliveryDate >= dateFrom);
    if (dateTo) rows = rows.filter((r) => r.deliveryDate <= dateTo);
    if (selectedTemplates.length > 0) rows = rows.filter((r) => selectedTemplates.includes(r.templateName));

    // filter prev period
    let prevRows: NewsletterRow[] = [];
    const hasComparison = !!(compareFrom || compareTo);
    if (hasComparison) {
      prevRows = allRows;
      if (compareFrom) prevRows = prevRows.filter((r) => r.deliveryDate >= compareFrom);
      if (compareTo) prevRows = prevRows.filter((r) => r.deliveryDate <= compareTo);
      if (selectedTemplates.length > 0) prevRows = prevRows.filter((r) => selectedTemplates.includes(r.templateName));
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

router.get("/newsletter/change-events", async (req, res): Promise<void> => {
  try {
    const { rows: allRows } = await getRows(req);

    const scenarioNameParam = typeof req.query.scenarioName === "string" ? req.query.scenarioName : undefined;
    const segmentParam = typeof req.query.segment === "string" ? req.query.segment : undefined;

    let rows = allRows;
    if (scenarioNameParam) rows = rows.filter((r) => r.scenarioName === scenarioNameParam);
    if (segmentParam) rows = rows.filter((r) => r.segment === segmentParam);

    // Group by scenarioName
    const byScenario = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!byScenario.has(row.scenarioName)) byScenario.set(row.scenarioName, []);
      byScenario.get(row.scenarioName)!.push(row);
    }

    const eventMap = new Map<string, { date: string; type: string; scenarioName: string; before: string; after: string }>();

    for (const [scenarioName, scenarioRows] of byScenario) {
      // One representative row per date (deduplicate within same date)
      const byDate = new Map<string, (typeof rows)[number]>();
      for (const row of scenarioRows) {
        if (!byDate.has(row.deliveryDate)) byDate.set(row.deliveryDate, row);
      }
      const sorted = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, row]) => row);

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        if (prev.subject !== curr.subject) {
          const key = `${curr.deliveryDate}|subject|${scenarioName}`;
          if (!eventMap.has(key)) {
            eventMap.set(key, { date: curr.deliveryDate, type: "subject", scenarioName, before: prev.subject, after: curr.subject });
          }
        }
        if (prev.templateName !== curr.templateName) {
          const key = `${curr.deliveryDate}|template|${scenarioName}`;
          if (!eventMap.has(key)) {
            eventMap.set(key, { date: curr.deliveryDate, type: "template", scenarioName, before: prev.templateName, after: curr.templateName });
          }
        }
      }
    }

    const events = Array.from(eventMap.values()).sort((a, b) => b.date.localeCompare(a.date));
    res.json({ events });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch change events");
    res.status(500).json({ error: "変更イベント取得に失敗しました" });
  }
});

router.get("/newsletter/matrix", async (req, res): Promise<void> => {
  try {
    const { rows: allRows } = await getRows(req);
    const q = req.query as Record<string, string | undefined>;

    const validTime = ["day", "week", "month"];
    const validMetric = ["deliveryCount", "openRate", "clickRate", "cvr", "cvCount"];

    const timeGroupBy = (validTime.includes(q.timeGroupBy ?? "") ? q.timeGroupBy : "month") as "day" | "week" | "month";
    const rawMetrics = q.metrics ? q.metrics.split(",").map((s) => s.trim()).filter((s) => validMetric.includes(s)) as MatrixMetric[] : [];
    const metrics = rawMetrics.length > 0 ? rawMetrics : (["deliveryCount"] as MatrixMetric[]);
    const scenarios = q.scenarios ? q.scenarios.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const templates = q.templates ? q.templates.split(",").map((s) => s.trim()).filter(Boolean) : [];

    let rows = allRows;
    if (q.dateFrom) rows = rows.filter((r) => r.deliveryDate >= q.dateFrom!);
    if (q.dateTo) rows = rows.filter((r) => r.deliveryDate <= q.dateTo!);

    const data = computeMatrixData(rows, scenarios, templates, timeGroupBy, metrics);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to compute matrix data");
    res.status(500).json({ error: "マトリクスデータの取得に失敗しました" });
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

router.get("/newsletter/templates", async (req, res): Promise<void> => {
  try {
    const { rows } = await getRows(req);
    const templates = getUniqueTemplates(rows);
    res.json({ templates });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch templates");
    res.status(500).json({ error: "テンプレート取得に失敗しました" });
  }
});

export default router;
