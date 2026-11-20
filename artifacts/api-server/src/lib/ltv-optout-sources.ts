import { ReplitConnectors } from "@replit/connectors-sdk";
import type { OptoutRow } from "./newsletter-types.js";
import { normalizeAnalysisDate, parseMailHistory, type MailHistory } from "./ltv-optout-analysis.js";
import { logger } from "./logger.js";

const SPREADSHEET_ID = "1zITxm8hxMkjNYJb7CKqY1B7JzQWvv20N8afMBkZWVbU";
const OPTOUT_SHEET = "20260101以降のオプトアウトリスト";
const MAIL_SHEET = "ma_raw";
const TTL_MS = 5 * 60 * 1000;
const MAX_SOURCE_ROWS = 200000;

interface AnalysisSnapshot {
  optouts: OptoutRow[];
  mail: MailHistory;
  fetchedAt: string;
}

let cache: { value: AnalysisSnapshot; expires: number } | null = null;
let inFlight: Promise<AnalysisSnapshot> | null = null;

/** Read-only snapshots. No new tables, implicit purchase synchronization or DB writes. */
export async function loadOptoutAnalysisSources(force = false): Promise<AnalysisSnapshot> {
  if (inFlight) return inFlight;
  if (!force && cache && cache.expires > Date.now()) return cache.value;
  const request = (async (): Promise<AnalysisSnapshot> => {
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
    const rowCount = (name: string) => {
      const count = metadata.sheets?.find((sheet) => sheet.properties?.title === name)?.properties?.gridProperties?.rowCount;
      if (!count) throw new Error(`元データに「${name}」シートがありません`);
      if (count > MAX_SOURCE_ROWS) throw new Error(`「${name}」は安全な読取上限を超えています。部分集計を避けるため取得を停止しました`);
      return count;
    };
    const readSheet = async (name: string, lastColumn: string): Promise<unknown[][]> => {
      const count = rowCount(name);
      const range = `'${name.replaceAll("'", "''")}'!A1:${lastColumn}${count}`;
      const result = await get(`${base}/values/${encodeURIComponent(range)}`) as { values?: unknown[][] };
      if (!Array.isArray(result.values) || !result.values.length) throw new Error(`「${name}」のヘッダーを取得できませんでした`);
      return result.values;
    };
    const optoutsPromise = (async () => {
      const [header, ...values] = await readSheet(OPTOUT_SHEET, "B");
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
    const mailPromise = (async () => {
      const [header, ...values] = await readSheet(MAIL_SHEET, "AF");
      return parseMailHistory(header.map(String), values);
    })().catch((err: unknown): MailHistory => {
      logger.warn({ err }, "Opt-out analysis mail snapshot unavailable");
      return {
        rows: [], from: null, to: null, rawRows: 0, excludedRows: 0, duplicateRows: 0, invalidRows: 0,
        available: false, error: "メール配信実績を取得できませんでした。メールの通数は判定せず、購入から解除までの月数のみ表示しています。",
      };
    });
    const [optouts, mail] = await Promise.all([optoutsPromise, mailPromise]);
    const value = { optouts, mail, fetchedAt: new Date().toISOString() };
    // Cache degraded mail results too, preventing an outage from causing request storms.
    cache = { value, expires: Date.now() + TTL_MS };
    return value;
  })();
  inFlight = request;
  try { return await request; }
  finally { inFlight = null; }
}
