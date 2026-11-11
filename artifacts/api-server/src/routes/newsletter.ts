import { Router, type IRouter } from "express";
import { fetchCalcSheet } from "../lib/newsletter-sheets.js";
import {
  aggregateRows,
  computeSummary,
  mergeComparisonMetrics,
  computeMatrixData,
  getUniqueScenarioNames,
  getUniqueTemplates,
  type GroupBy,
  type MatrixMetric,
} from "../lib/newsletter-aggregate.js";
import { getCache, setCache, getOptoutCache, setOptoutCache } from "../lib/newsletter-cache.js";
import { upsertRows, fetchRowsFromSupabase } from "../lib/newsletter-supabase.js";
import { fetchOptoutSheet } from "../lib/newsletter-optout-sheets.js";
import { upsertOptoutRows, fetchOptoutsFromSupabase } from "../lib/newsletter-optout-supabase.js";
import {
  aggregateOptouts,
  filterByDate,
  mergeOptoutComparison,
  earliestDate,
  type OptoutGroupBy,
} from "../lib/newsletter-optout-aggregate.js";
import { GetNewsletterDataQueryParams } from "@workspace/api-zod";
import type { NewsletterRow, OptoutRow } from "../lib/newsletter-types.js";
import { normalizeNewsletterDate } from "../lib/newsletter-date.js";

const router: IRouter = Router();
function isValidAnchorDate(value: string): boolean {
  try {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
      && normalizeNewsletterDate(value) === value.replace(/-/g, "/");
  } catch {
    return false;
  }
}

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
  return {
    ...cached,
    rows: cached.rows.map((row) => ({
      ...row,
      deliveryDate: normalizeNewsletterDate(row.deliveryDate),
    })),
  };
}

async function getOptoutRows(req: { log: { info: (...a: unknown[]) => void } }): Promise<{ rows: OptoutRow[]; syncedAt: string | null }> {
  let cached = getOptoutCache();
  if (!cached) {
    const { rows: supabaseRows, syncedAt: supabaseSyncedAt } = await fetchOptoutsFromSupabase();
    if (supabaseRows.length > 0 && supabaseSyncedAt) {
      setOptoutCache(supabaseRows, supabaseSyncedAt);
      cached = { rows: supabaseRows, syncedAt: supabaseSyncedAt };
    } else {
      req.log.info("Opt-out table empty, fetching from Google Sheets");
      const rows = await fetchOptoutSheet();
      const syncedAt = new Date().toISOString();
      if (rows.length > 0) await upsertOptoutRows(rows, syncedAt);
      setOptoutCache(rows, syncedAt);
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

    // オプトアウトも同じ同期操作でまとめて更新する。
    // 配信データの同期は成功させたいので、ここでの失敗はログに残して続行する。
    let optoutRowCount: number | null = null;
    try {
      const optoutRows = await fetchOptoutSheet();
      if (optoutRows.length > 0) await upsertOptoutRows(optoutRows, syncedAt);
      setOptoutCache(optoutRows, syncedAt);
      optoutRowCount = optoutRows.length;
    } catch (optoutErr) {
      req.log.error({ err: optoutErr }, "Failed to sync opt-out data (newsletter rows were synced)");
    }

    res.json({ rowCount: rows.length, optoutRowCount, syncedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to sync newsletter data");
    res.status(500).json({ error: "Google Sheets からのデータ取得に失敗しました" });
  }
});

router.get("/newsletter/data", async (req, res): Promise<void> => {
  try {
    const parsed = GetNewsletterDataQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "集計パラメータが不正です" });
      return;
    }
    const anchorDate = parsed.data.anchorDate;
    if (anchorDate && !isValidAnchorDate(anchorDate)) {
      res.status(400).json({ error: "施策の基準日が不正です" });
      return;
    }
    const groupBy: GroupBy = ((parsed.success ? parsed.data.groupBy : "day") ?? "day") as GroupBy;
    const timeGroupBy = parsed.success ? parsed.data.timeGroupBy : undefined;
    const dateFrom = parsed.success ? (parsed.data.dateFrom ?? undefined) : undefined;
    const dateTo = parsed.success ? (parsed.data.dateTo ?? undefined) : undefined;
    const scenarioNameParam = parsed.success ? ((parsed.data as Record<string, unknown>).scenarioName as string | undefined) : undefined;
    const templateNameParam = parsed.success ? ((parsed.data as Record<string, unknown>).templateName as string | undefined) : undefined;
    const compareFrom = parsed.success ? ((parsed.data as Record<string, unknown>).compareFrom as string | undefined) : undefined;
    const compareTo = parsed.success ? ((parsed.data as Record<string, unknown>).compareTo as string | undefined) : undefined;
    const comparisonGranularity = timeGroupBy ?? (groupBy === "day" || groupBy === "week" || groupBy === "month" ? groupBy : undefined);
    const comparisonPeriods = comparisonGranularity ? {
      granularity: comparisonGranularity, currentStart: dateFrom, previousStart: compareFrom,
    } : undefined;

    const { rows: allRows, syncedAt } = await getRows(req);

    const availableScenarios = getUniqueScenarioNames(allRows);

    // Parse pipe-separated filters. Values within one filter are ORed;
    // scenario and template filters are combined as AND conditions.
    const selectedScenarioNames = scenarioNameParam
      ? scenarioNameParam.split("|").map((s) => s.trim()).filter(Boolean)
      : [];

    const selectedTemplates = templateNameParam
      ? templateNameParam.split("|").map((s) => s.trim()).filter(Boolean)
      : [];

    // filter current period
    let rows = allRows;
    const toIso = (s: string) => s.replace(/\//g, "-");
    if (dateFrom) rows = rows.filter((r) => toIso(r.deliveryDate) >= dateFrom);
    if (dateTo) rows = rows.filter((r) => toIso(r.deliveryDate) <= dateTo);
    if (selectedTemplates.length > 0) rows = rows.filter((r) => selectedTemplates.includes(r.templateName));

    // filter prev period
    let prevRows: NewsletterRow[] = [];
    const hasComparison = !!(compareFrom || compareTo);
    if (hasComparison) {
      prevRows = allRows;
      if (compareFrom) prevRows = prevRows.filter((r) => toIso(r.deliveryDate) >= compareFrom);
      if (compareTo) prevRows = prevRows.filter((r) => toIso(r.deliveryDate) <= compareTo);
      if (selectedTemplates.length > 0) prevRows = prevRows.filter((r) => selectedTemplates.includes(r.templateName));
    }

    // no scenario filter → single flat aggregation
    if (selectedScenarioNames.length === 0) {
      let items = aggregateRows(rows, groupBy, timeGroupBy, anchorDate);
      let summary = computeSummary(rows);

      if (hasComparison) {
        const prevItems = aggregateRows(prevRows, groupBy, timeGroupBy, anchorDate);
        items = mergeComparisonMetrics(items, prevItems, groupBy, comparisonPeriods);
        summary = mergeComparisonMetrics([summary], [computeSummary(prevRows)])[0]!;
      }

      res.json({ groupBy, items, scenarioGroups: [], summary, lastSyncedAt: syncedAt, availableScenarios });
      return;
    }

    // scenario filter → build scenarioGroups
    const scenarioGroups = selectedScenarioNames.map((scenarioName) => {
      const scenarioRows = rows.filter((r) => r.scenarioName === scenarioName);
      let items = aggregateRows(scenarioRows, groupBy, timeGroupBy, anchorDate);
      let summary = computeSummary(scenarioRows);
      if (hasComparison) {
        const prevScenarioRows = prevRows.filter((r) => r.scenarioName === scenarioName);
        const prevItems = aggregateRows(prevScenarioRows, groupBy, timeGroupBy, anchorDate);
        items = mergeComparisonMetrics(items, prevItems, groupBy, comparisonPeriods);
        summary = mergeComparisonMetrics([summary], [computeSummary(prevScenarioRows)])[0]!;
      }
      return { scenarioName, items, summary };
    });

    // top-level items = all selected scenarios combined
    const combinedRows = selectedScenarioNames.length > 0
      ? rows.filter((r) => selectedScenarioNames.includes(r.scenarioName))
      : rows;
    let items = aggregateRows(combinedRows, groupBy, timeGroupBy, anchorDate);
    let summary = computeSummary(combinedRows);
    if (hasComparison) {
      const prevCombined = prevRows.filter((r) => selectedScenarioNames.includes(r.scenarioName));
      items = mergeComparisonMetrics(items, aggregateRows(prevCombined, groupBy, timeGroupBy, anchorDate), groupBy, comparisonPeriods);
      summary = mergeComparisonMetrics([summary], [computeSummary(prevCombined)])[0]!;
    }

    res.json({ groupBy, items, scenarioGroups, summary, lastSyncedAt: syncedAt, availableScenarios });
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
    if (q.anchorDate && !isValidAnchorDate(q.anchorDate)) {
      res.status(400).json({ error: "施策の基準日が不正です" });
      return;
    }

    const validTime = ["day", "week", "month"];
    const validMetric = ["deliveryCount", "openCount", "clickCount", "openRate", "clickRate", "cvr", "cvCount"];
    const validDimensions = ["scenario", "subject", "template"] as const;
    const dimensions = q.dimensions === undefined ? undefined : q.dimensions.split(",").map((value) => value.trim()).filter(Boolean);
    if (dimensions?.some((dimension) => !validDimensions.some((valid) => valid === dimension))) {
      res.status(400).json({ error: "表の集計項目が不正です" });
      return;
    }

    const timeGroupBy = (validTime.includes(q.timeGroupBy ?? "") ? q.timeGroupBy : "month") as "day" | "week" | "month";
    const rawMetrics = q.metrics ? q.metrics.split(",").map((s) => s.trim()).filter((s) => validMetric.includes(s)) as MatrixMetric[] : [];
    const metrics = rawMetrics.length > 0 ? rawMetrics : (["deliveryCount"] as MatrixMetric[]);
    const scenarios = q.scenarios ? q.scenarios.split("|").map((s) => s.trim()).filter(Boolean) : [];
    const templates = q.templates ? q.templates.split("|").map((s) => s.trim()).filter(Boolean) : [];

    let rows = allRows;
    const toIsoMtx = (s: string) => s.replace(/\//g, "-");
    if (q.dateFrom) rows = rows.filter((r) => toIsoMtx(r.deliveryDate) >= q.dateFrom!);
    if (q.dateTo) rows = rows.filter((r) => toIsoMtx(r.deliveryDate) <= q.dateTo!);

    const data = computeMatrixData(rows, scenarios, templates, timeGroupBy, metrics, q.anchorDate, dimensions as ("scenario" | "subject" | "template")[] | undefined);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to compute matrix data");
    res.status(500).json({ error: "マトリクスデータの取得に失敗しました" });
  }
});

router.get("/newsletter/segments", async (req, res): Promise<void> => {
  try {
    const { rows } = await getRows(req);
    const scenarios = getUniqueScenarioNames(rows);
    res.json({ segments: scenarios });
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

router.get("/newsletter/optout", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const validGroupBy = ["day", "week", "month"];
    const groupBy = (validGroupBy.includes(q.groupBy ?? "") ? q.groupBy : "day") as OptoutGroupBy;

    const { rows: allRows, syncedAt } = await getOptoutRows(req);

    const rows = filterByDate(allRows, q.dateFrom, q.dateTo);
    let items = aggregateOptouts(rows, groupBy);

    const hasComparison = !!(q.compareFrom || q.compareTo);
    let prevOptoutCount: number | null = null;
    if (hasComparison) {
      const prevRows = filterByDate(allRows, q.compareFrom, q.compareTo);
      items = mergeOptoutComparison(items, aggregateOptouts(prevRows, groupBy));
      prevOptoutCount = prevRows.length;
    }

    res.json({
      groupBy,
      items,
      summary: { optoutCount: rows.length, prevOptoutCount },
      dataFrom: earliestDate(allRows),
      lastSyncedAt: syncedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch newsletter opt-out data");
    res.status(500).json({ error: "オプトアウトデータの取得に失敗しました" });
  }
});

export default router;
