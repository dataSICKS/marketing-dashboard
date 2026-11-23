import { ReplitConnectors } from "@replit/connectors-sdk";
import type { OptoutRow } from "./newsletter-types.js";
import { normalizeAnalysisDate, type MailHistory } from "./ltv-optout-analysis.js";
import { fetchDeliveries, type DeliverySnapshot } from "./ma-deliveries-supabase.js";
import { logger } from "./logger.js";

const SPREADSHEET_ID = "1zITxm8hxMkjNYJb7CKqY1B7JzQWvv20N8afMBkZWVbU";
const OPTOUT_SHEET = "20260101以降のオプトアウトリスト";
/**
 * 配信履歴は元シートの `ma_raw` タブではなく Supabase の `ma_deliveries` から読む。
 * `ma_raw` はMA管理画面からの直近エクスポートが貼られるだけで、2026-11時点で2,000行台しかなく、
 * 集計側（配信数で約22万通）の1%程度しか覆っていない。顧客ごとの通数を数えるには足りない。
 */
const TTL_MS = 10 * 60 * 1000;
const MAX_SOURCE_ROWS = 200000;

interface AnalysisSnapshot {
  optouts: OptoutRow[];
  /** 既存の「解除タイミング分析」が使う形。配信履歴から日付だけを取り出したもの。 */
  mail: MailHistory;
  /** テンプレート・ノードまで含む配信履歴。通数やテンプレート別の分析に使う。 */
  deliveries: DeliverySnapshot;
  fetchedAt: string;
}

let cache: { value: AnalysisSnapshot; expires: number } | null = null;
let inFlight: Promise<AnalysisSnapshot> | null = null;

const unavailableDeliveries = (error: string): DeliverySnapshot => ({
  events: [], from: null, to: null, rawRows: 0, excludedRows: 0, invalidRows: 0, available: false, error,
});

/** `MailHistory` は配信履歴の派生物。重複は取り込み時のユニーク制約で既に除かれている。 */
function toMailHistory(deliveries: DeliverySnapshot): MailHistory {
  return {
    rows: deliveries.events.map(({ customerCode, date }) => ({ customerCode, date })),
    from: deliveries.from,
    to: deliveries.to,
    rawRows: deliveries.rawRows,
    excludedRows: deliveries.excludedRows,
    duplicateRows: 0,
    invalidRows: deliveries.invalidRows,
    available: deliveries.available,
    error: deliveries.error,
  };
}

/** Read-only snapshots. No new tables, implicit purchase synchronization or DB writes. */
export async function loadOptoutAnalysisSources(force = false): Promise<AnalysisSnapshot> {
  if (inFlight) return inFlight;
  if (!force && cache && cache.expires > Date.now()) return cache.value;
  const request = (async (): Promise<AnalysisSnapshot> => {
    const optoutsPromise = (async () => {
      const connectors = new ReplitConnectors();
      const get = async (path: string) => {
        const response = await connectors.proxy("google-sheet", path, { method: "GET" });
        if (!response.ok) throw new Error(`Google Sheetsからの読み取りに失敗しました（HTTP ${response.status}）`);
        return response.json();
      };
      const base = `/v4/spreadsheets/${SPREADSHEET_ID}`;
      const metadata = await get(`${base}?fields=sheets(properties(title,gridProperties(rowCount)))`) as {
        sheets?: { properties?: { title?: string; gridProperties?: { rowCount?: number } } }[];
      };
      const count = metadata.sheets?.find((sheet) => sheet.properties?.title === OPTOUT_SHEET)?.properties?.gridProperties?.rowCount;
      if (!count) throw new Error(`元データに「${OPTOUT_SHEET}」シートがありません`);
      if (count > MAX_SOURCE_ROWS) throw new Error(`「${OPTOUT_SHEET}」は安全な読取上限を超えています。部分集計を避けるため取得を停止しました`);
      const range = `'${OPTOUT_SHEET.replaceAll("'", "''")}'!A1:B${count}`;
      const result = await get(`${base}/values/${encodeURIComponent(range)}`) as { values?: unknown[][] };
      if (!Array.isArray(result.values) || !result.values.length) throw new Error(`「${OPTOUT_SHEET}」のヘッダーを取得できませんでした`);
      const [header, ...values] = result.values;
      const dateColumn = header.findIndex((cell) => String(cell).trim() === "オプトアウト日");
      const codeColumn = header.findIndex((cell) => String(cell).trim() === "顧客番号");
      if (dateColumn < 0 || codeColumn < 0) throw new Error("オプトアウト履歴のヘッダーを認識できません");
      const rows: OptoutRow[] = [];
      for (const row of values) {
        const optoutDate = normalizeAnalysisDate(row[dateColumn]);
        const customerCode = String(row[codeColumn] ?? "").trim();
        if (optoutDate && customerCode) rows.push({ optoutDate, customerCode });
      }
      return rows;
    })();
    const deliveriesPromise = fetchDeliveries().catch((err: unknown): DeliverySnapshot => {
      logger.warn({ err }, "Opt-out analysis delivery snapshot unavailable");
      return unavailableDeliveries(
        "配信履歴を取得できませんでした。メールの通数は判定せず、購入から解除までの月数のみ表示しています。",
      );
    });
    const [optouts, deliveries] = await Promise.all([optoutsPromise, deliveriesPromise]);
    const value = { optouts, mail: toMailHistory(deliveries), deliveries, fetchedAt: new Date().toISOString() };
    // Cache degraded mail results too, preventing an outage from causing request storms.
    cache = { value, expires: Date.now() + TTL_MS };
    return value;
  })();
  inFlight = request;
  try { return await request; }
  finally { inFlight = null; }
}
