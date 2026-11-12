import { Router, type IRouter } from "express";
import { fetchLtvSheet } from "../lib/ltv-sheets.js";
import { upsertLtvRows, fetchLtvFromSupabase } from "../lib/ltv-supabase.js";
import { getLtvCache, setLtvCache } from "../lib/ltv-cache.js";
import { loadOptoutCustomerCodes } from "../lib/newsletter-optout-source.js";
import {
  aggregateLtv,
  collectFilters,
  filterLtvRows,
  maturedThrough,
  summarizeLtv,
  monthLabel,
  type LtvSplitBy,
  type LtvQuery,
} from "../lib/ltv-aggregate.js";
import type { LtvRow } from "../lib/ltv-types.js";

const router: IRouter = Router();

const SPLIT_BY: LtvSplitBy[] = ["none", "optout", "offer", "firstProduct", "subsStatus", "adGroup"];

/** Supabaseからの読み込みが同時に走らないようにする（57,000行超を二重に取りに行かないため）。 */
let inFlight: Promise<{ rows: LtvRow[]; syncedAt: string | null }> | null = null;

/**
 * キャッシュ → Supabase。**GET の中でスプレッドシートからの取り込みはしない**。
 * 5万行超の取り込みは数十秒かかり、画面を開いただけで走るとタイムアウトして
 * 「一部の月しか出ない」「絞り込みの候補が空」といった中途半端な表示になるため、
 * 取り込みは明示的に `POST /ltv/sync` でだけ行う。
 */
async function getLtvRows(req: { log: { info: (...a: unknown[]) => void } }): Promise<{ rows: LtvRow[]; syncedAt: string | null }> {
  const cached = getLtvCache();
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const { rows, syncedAt } = await fetchLtvFromSupabase();
    if (rows.length > 0 && syncedAt) {
      setLtvCache(rows, syncedAt);
      return { rows, syncedAt };
    }
    req.log.info("LTV table is empty; waiting for an explicit /ltv/sync");
    return { rows: [] as LtvRow[], syncedAt: null };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** `a|b|c` → `["a","b","c"]`。商品名にカンマが入るのでパイプ区切りにしている。 */
const splitList = (value: string | undefined): string[] =>
  value ? value.split("|").map((s) => s.trim()).filter(Boolean) : [];

const isMonthStart = (value: string | undefined): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

router.post("/ltv/sync", async (req, res): Promise<void> => {
  try {
    const rows = await fetchLtvSheet();
    const syncedAt = new Date().toISOString();
    if (rows.length > 0) await upsertLtvRows(rows, syncedAt);
    setLtvCache(rows, syncedAt);
    res.json({ rowCount: rows.length, syncedAt });
  } catch (err) {
    req.log.error({ err }, "Failed to sync LTV data");
    res.status(500).json({ error: "LTVデータの取得に失敗しました" });
  }
});

router.get("/ltv/filters", async (req, res): Promise<void> => {
  try {
    const { rows } = await getLtvRows(req);
    const months = rows
      .map((row) => row.firstOrderMonth)
      .filter((value): value is string => !!value)
      .sort();
    res.json({
      ...collectFilters(rows),
      monthMin: months[0] ?? null,
      monthMax: months.at(-1) ?? null,
      rowCount: rows.length,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch LTV filters");
    res.status(500).json({ error: "LTVの絞り込み条件の取得に失敗しました" });
  }
});

router.get("/ltv/data", async (req, res): Promise<void> => {
  try {
    const q = req.query as Record<string, string | undefined>;

    if ((q.monthFrom && !isMonthStart(q.monthFrom)) || (q.monthTo && !isMonthStart(q.monthTo))) {
      res.status(400).json({ error: "初回購入月の指定が不正です（YYYY-MM-DD）" });
      return;
    }
    const splitBy = (SPLIT_BY as string[]).includes(q.splitBy ?? "") ? (q.splitBy as LtvSplitBy) : "none";
    const optout = q.optout === "yes" || q.optout === "no" ? q.optout : "all";

    const { rows, syncedAt } = await getLtvRows(req);

    // オプトアウトが取れなくても LTV の表示は止めない（軸として使えないだけ）。
    let optedOut = new Set<string>();
    let optoutAvailable = true;
    try {
      optedOut = await loadOptoutCustomerCodes();
    } catch (err) {
      optoutAvailable = false;
      req.log.error({ err }, "Failed to load opt-out customers for LTV");
    }

    const query: LtvQuery = {
      monthFrom: q.monthFrom,
      monthTo: q.monthTo,
      offers: splitList(q.offers),
      firstProducts: splitList(q.firstProducts),
      subsStatuses: splitList(q.subsStatuses),
      adGroups: splitList(q.adGroups),
      optout: optoutAvailable ? optout : "all",
    };

    const allMonths = rows.map((r) => r.firstOrderMonth).filter((v): v is string => !!v).sort();
    const filtered = filterLtvRows(rows, query, optedOut);
    const items = aggregateLtv(filtered, optoutAvailable ? splitBy : "none", optedOut);
    const segments = [...new Set(items.map((item) => item.segment))];

    res.json({
      splitBy: optoutAvailable ? splitBy : "none",
      items,
      segments,
      summary: summarizeLtv(filtered),
      subscriptionCount: filtered.length,
      customerCount: new Set(filtered.map((row) => row.customerCode)).size,
      // この月より後は期間が足りず LTV365 が小さく出る（画面で注記する）。
      matured365Through: maturedThrough(365),
      matured180Through: maturedThrough(180),
      optoutAvailable,
      // オプトアウトは2025-12-31以降しか無い。それ以前の月は「なし」に寄るので注記に使う。
      optoutDataFrom: "2025-12-31",
      monthMin: monthLabel(allMonths[0] ?? null),
      monthMax: monthLabel(allMonths.at(-1) ?? null),
      // 絞り込み前の取り込み総件数。画面に出して「取り込めていない」のか「絞り込みで消えた」のかを分かるようにする。
      loadedRowCount: rows.length,
      lastSyncedAt: syncedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch LTV data");
    res.status(500).json({ error: "LTVデータの取得に失敗しました" });
  }
});

export default router;
