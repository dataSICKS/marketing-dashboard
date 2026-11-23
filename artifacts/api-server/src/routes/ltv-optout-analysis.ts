import { Router, type Request, type IRouter } from "express";
import {
  GetLtvOptoutAnalysisQueryParams, GetLtvOptoutAnalysisResponse, RefreshLtvOptoutAnalysisResponse,
  GetOptoutMailAnalysisQueryParams, GetOptoutMailAnalysisResponse,
} from "@workspace/api-zod";
import type { LtvRow } from "../lib/ltv-types.js";
import { analyzeOptoutTiming, normalizeAnalysisDate } from "../lib/ltv-optout-analysis.js";
import { analyzeOptoutMail, coverageAgainstAggregate } from "../lib/optout-mail-analysis.js";
import { loadOptoutAnalysisSources } from "../lib/ltv-optout-sources.js";
import { fetchRowsFromSupabase } from "../lib/newsletter-supabase.js";
import { getCache } from "../lib/newsletter-cache.js";
import { normalizeNewsletterDate } from "../lib/newsletter-date.js";
import { logger } from "../lib/logger.js";

/**
 * オプトアウトのデータが始まる日。元のBigQueryクエリが `imported_date >= 2026-01-01` 起点で、
 * そこから1日引いた日付を出しているため、取得できる最も古い解除日はこの日になる。
 * これより前から配信が始まっている顧客は「解除したのに記録に出てこない」可能性が残る。
 */
const OPTOUT_DATA_FROM = "2025-12-31";

/** 集計側の配信日は `2026/11/04` 形式やシートの連番。比較のためISOに寄せる。 */
const toIsoDate = (value: string): string | null => {
  try {
    return normalizeNewsletterDate(value).replaceAll("/", "-");
  } catch {
    return null;
  }
};

/**
 * 個票の網羅率を出すための集計行。取れなくても分析自体は続ける
 * （網羅率が「不明」になるだけで、ハザードの計算には使っていない）。
 */
async function loadAggregateRows() {
  const cached = getCache();
  if (cached) return cached.rows;
  const { rows } = await fetchRowsFromSupabase();
  return rows;
}

type LoadPurchases = (req: Request) => Promise<{ rows: LtvRow[]; syncedAt: string | null }>;

/** Inject the normal ALL-channel LTV source, sharing its DB cache and single-flight reads. */
export function createLtvOptoutRouter(loadPurchases: LoadPurchases): IRouter {
  const router: IRouter = Router();
  router.get("/ltv/optout-analysis", async (req, res): Promise<void> => {
    const parsed = GetLtvOptoutAnalysisQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "検索条件またはページの指定が不正です" });
      return;
    }
    const filters = parsed.data;
    const validMonth = (value?: string) => !value || /^\d{4}-\d{2}$/.test(value) && normalizeAnalysisDate(`${value}-01`) !== null;
    const validDate = (value?: string) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) && normalizeAnalysisDate(value) !== null;
    if (!validMonth(filters.monthFrom) || !validMonth(filters.monthTo) ||
      !validDate(filters.optoutFrom) || !validDate(filters.optoutTo) ||
      (filters.monthFrom && filters.monthTo && filters.monthFrom > filters.monthTo) ||
      (filters.optoutFrom && filters.optoutTo && filters.optoutFrom > filters.optoutTo)) {
      res.status(400).json({ error: "初回購入月はYYYY-MM、解除日はYYYY-MM-DDの有効な日付を、開始から終了の順に指定してください" });
      return;
    }
    try {
      const [purchases, snapshot] = await Promise.all([loadPurchases(req), loadOptoutAnalysisSources()]);
      const analysis = analyzeOptoutTiming(purchases.rows, snapshot.optouts, snapshot.mail, filters, {
        purchaseSyncedAt: purchases.syncedAt, fetchedAt: snapshot.fetchedAt,
      });
      res.json(GetLtvOptoutAnalysisResponse.parse(analysis));
    } catch (err) {
      req.log.error({ err }, "Failed to analyze customer opt-out timing");
      res.status(503).json({ error: "購入データまたは解除履歴を取得できませんでした。時間をおいて再取得してください。" });
    }
  });
  router.get("/ltv/optout-mail-analysis", async (req, res): Promise<void> => {
    const parsed = GetOptoutMailAnalysisQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "表示件数の下限の指定が不正です" });
      return;
    }
    try {
      const [purchases, snapshot, aggregate] = await Promise.all([
        loadPurchases(req),
        loadOptoutAnalysisSources(),
        loadAggregateRows().catch((err: unknown) => {
          logger.warn({ err }, "Aggregate rows unavailable; coverage will be unknown");
          return [];
        }),
      ]);
      const coverage = aggregate.length
        ? coverageAgainstAggregate(snapshot.deliveries, aggregate, toIsoDate)
        : undefined;
      const analysis = analyzeOptoutMail(
        snapshot.deliveries, snapshot.optouts, purchases.rows,
        { minEvents: parsed.data.minEvents, optoutDataFrom: OPTOUT_DATA_FROM },
        { purchaseSyncedAt: purchases.syncedAt, fetchedAt: snapshot.fetchedAt, coverage },
      );
      res.json(GetOptoutMailAnalysisResponse.parse(analysis));
    } catch (err) {
      req.log.error({ err }, "Failed to analyze deliveries against opt-out");
      res.status(503).json({ error: "配信履歴または解除履歴を取得できませんでした。時間をおいて再取得してください。" });
    }
  });
  router.post("/ltv/optout-analysis/refresh", async (req, res): Promise<void> => {
    try {
      const snapshot = await loadOptoutAnalysisSources(true);
      res.json(RefreshLtvOptoutAnalysisResponse.parse({ fetchedAt: snapshot.fetchedAt, mailAvailable: snapshot.mail.available }));
    } catch (err) {
      req.log.error({ err }, "Failed to refresh opt-out analysis snapshots");
      res.status(503).json({ error: "元シートからの再取得に失敗しました。時間をおいて再度お試しください。" });
    }
  });
  return router;
}
