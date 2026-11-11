import { ReplitConnectors } from "@replit/connectors-sdk";
import type { OptoutRow } from "./newsletter-types.js";
import { logger } from "./logger.js";

const SPREADSHEET_ID = "1zITxm8hxMkjNYJb7CKqY1B7JzQWvv20N8afMBkZWVbU";
/**
 * オプトアウト（メルマガ購読のオン→オフ）の顧客一覧タブ。
 * A列: オプトアウト日 / B列: 顧客番号。1行1顧客で、同じ日に複数行が並ぶ。
 * 同スプシの `BQ_オプトアウト調査`（BigQuery直結のConnected Sheet）ではなく、
 * 値が入っているこのタブを正とする（Connected Sheetは値取得APIで読めないため）。
 */
const SHEET_NAME = "20260101以降のオプトアウトリスト";
const MAX_ROWS = 50000;

/** `2025/12/31` `2025-12-31` → `2025-12-31`。解釈できない値は null。 */
function normalizeDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export async function fetchOptoutSheet(): Promise<OptoutRow[]> {
  const connectors = new ReplitConnectors();

  const range = `${SHEET_NAME}!A2:B${MAX_ROWS}`;
  const response = await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
    { method: "GET" }
  );

  const data = (await response.json()) as { values?: string[][] };

  if (!data.values || data.values.length === 0) {
    logger.info("No data returned from Google Sheets optout sheet");
    return [];
  }

  const rows: OptoutRow[] = [];
  let skipped = 0;

  for (const row of data.values) {
    const optoutDate = normalizeDate(row[0]);
    const customerCode = (row[1] ?? "").trim();
    if (!optoutDate || !customerCode) {
      skipped++;
      continue;
    }
    rows.push({ optoutDate, customerCode });
  }

  logger.info({ rowCount: rows.length, skipped }, "Fetched opt-out rows from Google Sheets");
  return rows;
}
