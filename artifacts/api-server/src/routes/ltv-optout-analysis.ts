import { Router, type Request, type IRouter } from "express";
import { GetLtvOptoutAnalysisQueryParams, GetLtvOptoutAnalysisResponse, RefreshLtvOptoutAnalysisResponse } from "@workspace/api-zod";
import type { LtvRow } from "../lib/ltv-types.js";
import { analyzeOptoutTiming, normalizeAnalysisDate } from "../lib/ltv-optout-analysis.js";
import { loadOptoutAnalysisSources } from "../lib/ltv-optout-sources.js";

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
