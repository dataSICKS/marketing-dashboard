import { Router, type IRouter } from "express";
import { fetchEfoAccessSheet, fetchEfoExitScenariosSheet } from "../lib/efo-sheets.js";
import { aggregateEfoRows, computeEfoSummary, type EfoGroupBy } from "../lib/efo-aggregate.js";
import {
  upsertEfoAccessCv,
  upsertEfoExitScenarios,
  fetchEfoAccessCvFromSupabase,
  fetchEfoExitScenariosFromSupabase,
  fetchEcfAdAccessCvFromSupabase,
} from "../lib/efo-supabase.js";
import { listEfoPresets, createEfoPreset, deleteEfoPreset } from "../lib/efo-preset-supabase.js";
import type { EfoAccessCvRow, EfoExitScenarioRow, EcfAdAccessCvRow, EfoExitScenarioCount } from "../lib/efo-types.js";

const router: IRouter = Router();

const FUNNEL_ORDER = ["start", "greeting", "name", "contact", "address", "product", "payment", "confirm_preview", "submission"];

const CACHE_TTL_MS = 30 * 60 * 1000; // 30分
let accessCvCache: { rows: EfoAccessCvRow[]; syncedAt: string; loadedAt: number } | null = null;
let exitScenariosCache: { rows: EfoExitScenarioRow[]; syncedAt: string; loadedAt: number } | null = null;
let ecfCache: { rows: EcfAdAccessCvRow[]; loadedAt: number } | null = null;

function isCacheStale(): boolean {
  if (!accessCvCache || !exitScenariosCache) return true;
  return Date.now() - accessCvCache.loadedAt > CACHE_TTL_MS;
}

async function getEfoData(req: { log: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void } }) {
  if (isCacheStale()) {
    req.log.info("EFO cache stale or empty, fetching from Supabase");
    const [{ rows: acRows, syncedAt: acSyncedAt }, { rows: esRows, syncedAt: esSyncedAt }, ecfRows] = await Promise.all([
      fetchEfoAccessCvFromSupabase(),
      fetchEfoExitScenariosFromSupabase(),
      fetchEcfAdAccessCvFromSupabase(),
    ]);
    const now = Date.now();
    ecfCache = { rows: ecfRows, loadedAt: now };
    if (acRows.length > 0 && acSyncedAt) {
      accessCvCache = { rows: acRows, syncedAt: acSyncedAt, loadedAt: now };
      exitScenariosCache = { rows: esRows, syncedAt: esSyncedAt ?? acSyncedAt, loadedAt: now };
    } else {
      req.log.info("Supabase EFO empty, fetching from Google Sheets");
      const [acSheets, esSheets] = await Promise.all([
        fetchEfoAccessSheet(),
        fetchEfoExitScenariosSheet(),
      ]);
      const syncedAt = new Date().toISOString();
      await Promise.all([
        upsertEfoAccessCv(acSheets, syncedAt),
        upsertEfoExitScenarios(esSheets, syncedAt),
      ]);
      accessCvCache = { rows: acSheets, syncedAt, loadedAt: now };
      exitScenariosCache = { rows: esSheets, syncedAt, loadedAt: now };
    }
  }
  if (!accessCvCache || !exitScenariosCache) throw new Error("EFO cache failed to populate");
  return {
    accessCvRows: accessCvCache.rows,
    exitScenarioRows: exitScenariosCache.rows,
    ecfRows: ecfCache?.rows ?? [],
    syncedAt: accessCvCache.syncedAt,
  };
}

router.post("/efo/sync", async (req, res): Promise<void> => {
  try {
    req.log.info("Syncing EFO data from Google Sheets");
    const [acRows, esRows] = await Promise.all([
      fetchEfoAccessSheet(),
      fetchEfoExitScenariosSheet(),
    ]);
    const syncedAt = new Date().toISOString();
    await Promise.all([
      upsertEfoAccessCv(acRows, syncedAt),
      upsertEfoExitScenarios(esRows, syncedAt),
    ]);
    const loadedAt = Date.now();
    accessCvCache = { rows: acRows, syncedAt, loadedAt };
    exitScenariosCache = { rows: esRows, syncedAt, loadedAt };
    res.json({ accessCvRowCount: acRows.length, exitScenarioRowCount: esRows.length, syncedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to sync EFO data");
    res.status(500).json({ error: "Google Sheets からのEFOデータ取得に失敗しました" });
  }
});

router.get("/efo/filters", async (req, res): Promise<void> => {
  try {
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const { accessCvRows: allRows } = await getEfoData(req);

    const isoDate = (d: string) => d.replace(/\//g, "-");
    let rows = allRows;
    if (dateFrom) rows = rows.filter((r) => isoDate(r.date) >= dateFrom);
    if (dateTo) rows = rows.filter((r) => isoDate(r.date) <= dateTo);

    const profileNames = Array.from(
      new Set(rows.filter((r) => r.accessCount > 0).map((r) => r.profileName)),
    ).sort();
    const adCodes = Array.from(
      new Set(rows.filter((r) => r.accessCount > 0).map((r) => r.adCode)),
    ).sort();

    res.json({ profileNames, adCodes });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch EFO filters");
    res.status(500).json({ error: "EFOフィルター取得に失敗しました" });
  }
});

router.get("/efo/data", async (req, res): Promise<void> => {
  try {
    const groupBy = (req.query.groupBy as EfoGroupBy | undefined) ?? "day";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const profileName = req.query.profileName as string | undefined;
    const adCode = req.query.adCode as string | undefined;

    // Support comma-separated multi-value filters
    const profileNames = profileName ? profileName.split(",").filter(Boolean) : null;
    const adCodes = adCode ? adCode.split(",").filter(Boolean) : null;

    const { accessCvRows: allAccessCv, exitScenarioRows: allExitScenarios, ecfRows: allEcf, syncedAt } = await getEfoData(req);

    let accessCvRows = allAccessCv;
    const isoDate = (d: string) => d.replace(/\//g, "-");
    if (dateFrom) accessCvRows = accessCvRows.filter((r) => isoDate(r.date) >= dateFrom);
    if (dateTo) accessCvRows = accessCvRows.filter((r) => isoDate(r.date) <= dateTo);
    if (profileNames?.length) accessCvRows = accessCvRows.filter((r) => profileNames.includes(r.profileName));
    if (adCodes?.length) accessCvRows = accessCvRows.filter((r) => adCodes.includes(r.adCode));

    let exitScenarioRows = allExitScenarios;
    if (dateFrom) exitScenarioRows = exitScenarioRows.filter((r) => isoDate(r.date) >= dateFrom);
    if (dateTo) exitScenarioRows = exitScenarioRows.filter((r) => isoDate(r.date) <= dateTo);
    if (profileNames?.length) exitScenarioRows = exitScenarioRows.filter((r) => profileNames.includes(r.profileName));
    if (adCodes?.length) exitScenarioRows = exitScenarioRows.filter((r) => adCodes.includes(r.adCode));

    let ecfRows = allEcf;
    if (dateFrom) ecfRows = ecfRows.filter((r) => r.adDate >= dateFrom);
    if (dateTo) ecfRows = ecfRows.filter((r) => r.adDate <= dateTo);
    if (adCodes?.length) ecfRows = ecfRows.filter((r) => adCodes.includes(r.adUrl));

    const items = aggregateEfoRows(accessCvRows, groupBy, ecfRows);
    const summary = computeEfoSummary(accessCvRows, ecfRows);

    // aggregate exit scenarios
    const scenarioMap = new Map<string, number>();
    for (const r of exitScenarioRows) {
      scenarioMap.set(r.exitScenario, (scenarioMap.get(r.exitScenario) ?? 0) + r.sessionCount);
    }
    const exitScenarios: EfoExitScenarioCount[] = Array.from(scenarioMap.entries())
      .map(([scenario, count]) => ({ scenario, count }))
      .sort((a, b) => {
        const ai = FUNNEL_ORDER.indexOf(a.scenario);
        const bi = FUNNEL_ORDER.indexOf(b.scenario);
        if (ai === -1 && bi === -1) return a.scenario.localeCompare(b.scenario);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });

    res.json({ groupBy, items, summary, exitScenarios, lastSyncedAt: syncedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch EFO data");
    res.status(500).json({ error: "EFOデータ取得に失敗しました" });
  }
});

// ─── Presets ──────────────────────────────────────────────────────

router.get("/efo/presets", async (req, res) => {
  try {
    const presets = await listEfoPresets();
    res.json({ presets });
  } catch (err) {
    req.log.error({ err }, "Failed to list efo presets");
    res.status(500).json({ error: "プリセット取得に失敗しました" });
  }
});

router.post("/efo/presets", async (req, res) => {
  try {
    const { name, groupBy, segmentA, segmentB } = req.body as {
      name: string;
      groupBy: string;
      segmentA: { dateFrom?: string | null; dateTo?: string | null; profileNames: string[]; adCodes: string[] };
      segmentB: { dateFrom?: string | null; dateTo?: string | null; profileNames: string[]; adCodes: string[] };
    };
    if (!name || !groupBy || !segmentA || !segmentB) {
      res.status(400).json({ error: "name, groupBy, segmentA, segmentB は必須です" });
      return;
    }
    const preset = await createEfoPreset({
      name,
      groupBy,
      segmentA: { dateFrom: segmentA.dateFrom ?? null, dateTo: segmentA.dateTo ?? null, profileNames: segmentA.profileNames, adCodes: segmentA.adCodes },
      segmentB: { dateFrom: segmentB.dateFrom ?? null, dateTo: segmentB.dateTo ?? null, profileNames: segmentB.profileNames, adCodes: segmentB.adCodes },
    });
    res.status(201).json({ preset });
  } catch (err) {
    req.log.error({ err }, "Failed to create efo preset");
    res.status(500).json({ error: "プリセット作成に失敗しました" });
  }
});

router.delete("/efo/presets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "無効なIDです" });
      return;
    }
    await deleteEfoPreset(id);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete efo preset");
    res.status(500).json({ error: "プリセット削除に失敗しました" });
  }
});

export default router;
