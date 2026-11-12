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

/** キャッシュ → Supabase → スプレッドシート の順にフォールバックする。 */
async function getLtvRows(req: { log: { info: (...a: unknown[]) => void } }): Promise<{ rows: LtvRow[]; syncedAt: string | null }> {
  let cached = getLtvCache();
  if (!cached) {
    const { rows: supabaseRows, syncedAt: supabaseSyncedAt } = await fetchLtvFromSupabase();
    if (supabaseRows.length > 0 && supabaseSyncedAt) {
      setLtvCache(supabaseRows, supabaseSyncedAt);
      cached = { rows: supabaseRows, syncedAt: supabaseSyncedAt };
    } else {
      req.log.info("LTV table empty, fetching from Google Sheets");
      const rows = await fetchLtvSheet();
      const syncedAt = new Date().toISOString();
      if (rows.length > 0) await upsertLtvRows(rows, syncedAt);
      setLtvCache(rows, syncedAt);
      cached = { rows, syncedAt };
    }
  }
  return cached;
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
      monthMin: monthLabel(rows.map((r) => r.firstOrderMonth).filter((v): v is string => !!v).sort()[0] ?? null),
      lastSyncedAt: syncedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch LTV data");
    res.status(500).json({ error: "LTVデータの取得に失敗しました" });
  }
});

export default router;
