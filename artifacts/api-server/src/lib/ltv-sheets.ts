import { ReplitConnectors } from "@replit/connectors-sdk";
import type { LtvRow } from "./ltv-types.js";
import { logger } from "./logger.js";

const SPREADSHEET_ID = "10wmBYd-oWJOMkKCtmu98SeHu5ulV6o02tYd_eqZsf_8";
/**
 * 定期購入番号ごとの購入商品とLTVのタブ。
 * 同スプシの `定期ID別購入商品_LTV95_180_365`（BigQuery直結のConnected Sheet）は
 * 値取得APIで読めないため、その値コピーであるこのRAWタブを正とする。
 */
const SHEET_NAME = "RAW_定期ID別購入商品_LTV95_180_365";
/** 2026-11時点で58,215行。増える前提で余裕を持たせる。 */
const MAX_ROWS = 80000;

/**
 * 列は位置ではなくヘッダー名で引く。
 * BigQuery側のSELECTに列が足されても、既存列の読み取りがずれないようにするため。
 */
const HEADERS = {
  customerCode: "顧客番号",
  subsOrderCode: "定期購入番号",
  firstOrderMonth: "初回購入月",
  firstProduct: "初回購入の商品ラベル",
  adGroupName: "広告グループ名",
  subsStatus: "サブスク状態",
  product2: "2回目の商品",
  product3: "3回目の商品",
  product4: "4回目の商品",
  ltv95: "LTV95",
  ltv180: "LTV180",
  ltv365: "LTV365",
  sellingUrl: "販売URL",
  offerName: "オファー名",
} as const;

type FieldKey = keyof typeof HEADERS;

/** `2024/06/01` `2024-06-01` `2024/06` → `2024-06-01`。解釈できない値は null。 */
export function normalizeMonth(value: string | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const full = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-01`;
  const short = text.match(/^(\d{4})[/-](\d{1,2})$/);
  if (short) return `${short[1]}-${short[2].padStart(2, "0")}-01`;
  return null;
}

/** `1,234` `¥1,234` `-500` → 数値。空欄・解釈できない値は 0。 */
export function parseAmount(value: string | undefined): number {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[,¥\s]/g, "");
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** ヘッダー行から「項目 → 列index」を作る。見つからない列は undefined。 */
export function buildHeaderIndex(headerRow: string[]): Partial<Record<FieldKey, number>> {
  const normalized = headerRow.map((cell) => (cell ?? "").trim());
  const index: Partial<Record<FieldKey, number>> = {};
  for (const [field, label] of Object.entries(HEADERS) as [FieldKey, string][]) {
    const at = normalized.indexOf(label);
    if (at >= 0) index[field] = at;
  }
  return index;
}

export async function fetchLtvSheet(): Promise<LtvRow[]> {
  const connectors = new ReplitConnectors();

  const read = async (range: string) => {
    const response = await connectors.proxy(
      "google-sheet",
      `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
      { method: "GET" }
    );
    return (await response.json()) as { values?: string[][] };
  };

  const header = await read(`${SHEET_NAME}!A1:Z1`);
  const headerRow = header.values?.[0] ?? [];
  const at = buildHeaderIndex(headerRow);

  // 定期購入番号が無いと行を一意にできないので、ここで止める（部分的に壊れたデータを入れない）。
  if (at.subsOrderCode === undefined || at.customerCode === undefined) {
    logger.error({ headerRow }, "LTV sheet header not recognized");
    throw new Error(
      `LTVシートのヘッダーを認識できません（「${HEADERS.subsOrderCode}」「${HEADERS.customerCode}」列が見つかりません）`
    );
  }

  const data = await read(`${SHEET_NAME}!A2:Z${MAX_ROWS}`);
  if (!data.values || data.values.length === 0) {
    logger.info("No data returned from LTV sheet");
    return [];
  }

  const cell = (row: string[], field: FieldKey): string => {
    const column = at[field];
    return column === undefined ? "" : (row[column] ?? "").trim();
  };

  const rows: LtvRow[] = [];
  let skipped = 0;

  for (const row of data.values) {
    const subsOrderCode = cell(row, "subsOrderCode");
    const customerCode = cell(row, "customerCode");
    if (!subsOrderCode || !customerCode) {
      skipped++;
      continue;
    }
    rows.push({
      subsOrderCode,
      customerCode,
      firstOrderMonth: normalizeMonth(cell(row, "firstOrderMonth")),
      firstProduct: cell(row, "firstProduct"),
      adGroupName: cell(row, "adGroupName"),
      subsStatus: cell(row, "subsStatus"),
      product2: cell(row, "product2"),
      product3: cell(row, "product3"),
      product4: cell(row, "product4"),
      ltv95: parseAmount(cell(row, "ltv95")),
      ltv180: parseAmount(cell(row, "ltv180")),
      ltv365: parseAmount(cell(row, "ltv365")),
      sellingUrl: cell(row, "sellingUrl"),
      offerName: cell(row, "offerName"),
    });
  }

  logger.info({ rowCount: rows.length, skipped }, "Fetched LTV rows from Google Sheets");
  return rows;
}
