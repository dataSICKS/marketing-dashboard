import { ReplitConnectors } from "@replit/connectors-sdk";
import type { LtvRow } from "./ltv-types.js";
import { logger } from "./logger.js";

const SPREADSHEET_ID = "10wmBYd-oWJOMkKCtmu98SeHu5ulV6o02tYd_eqZsf_8";

/**
 * 取り込むデータセット。元のBigQueryクエリが**対象範囲ごと別タブ**になっているため、
 * 片方だけにすると見られる範囲が狭まる。両方取り込んで画面で切り替える。
 *
 * - fb  … FB広告経由のみ・2024-06-01以降
 * - all … 全経路（広告グループの絞り込み無し）・**2026-01-01以降**
 *
 * 2つは**重なる**（2026年以降のFB広告分は両方に出る）ので、同じテーブルに入れるときは
 * 定期購入番号だけでなく dataset も含めて一意にすること。
 *
 * Connected Sheet（`定期ID別購入商品_LTV95_180_365`）は値取得APIで読めないため、
 * その値コピーである RAW タブを正とする。
 */
export const LTV_DATASETS = {
  fb: {
    sheetName: "RAW_定期ID別購入商品_LTV95_180_365",
    label: "FB広告（2024/06〜）",
  },
  all: {
    sheetName: "RAW_定期ID別購入商品_LTV95_180_365_全経路",
    label: "全経路（2026/01〜）",
  },
} as const;

export type LtvDataset = keyof typeof LTV_DATASETS;
export const LTV_DATASET_KEYS = Object.keys(LTV_DATASETS) as LtvDataset[];

/** 2026-11時点で fb=58,215行 / all=25,000行。増える前提で余裕を持たせる。 */
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

export async function fetchLtvSheet(dataset: LtvDataset): Promise<LtvRow[]> {
  const sheetName = LTV_DATASETS[dataset].sheetName;
  const connectors = new ReplitConnectors();

  const read = async (range: string) => {
    const response = await connectors.proxy(
      "google-sheet",
      `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
      { method: "GET" }
    );
    return (await response.json()) as { values?: string[][] };
  };

  const header = await read(`${sheetName}!A1:Z1`);
  const headerRow = header.values?.[0] ?? [];
  const at = buildHeaderIndex(headerRow);

  // 定期購入番号が無いと行を一意にできないので、ここで止める（部分的に壊れたデータを入れない）。
  if (at.subsOrderCode === undefined || at.customerCode === undefined) {
    logger.error({ dataset, sheetName, headerRow }, "LTV sheet header not recognized");
    throw new Error(
      `LTVシート「${sheetName}」のヘッダーを認識できません（「${HEADERS.subsOrderCode}」「${HEADERS.customerCode}」列が見つかりません）`
    );
  }

  const data = await read(`${sheetName}!A2:Z${MAX_ROWS}`);
  if (!data.values || data.values.length === 0) {
    logger.info({ dataset, sheetName }, "No data returned from LTV sheet");
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

  logger.info({ dataset, rowCount: rows.length, skipped }, "Fetched LTV rows from Google Sheets");
  return rows;
}
