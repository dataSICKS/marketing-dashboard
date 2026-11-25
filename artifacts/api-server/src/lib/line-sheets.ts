import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  parseLineRow, verifyLineRow, parseUrlMaster, parseCvMatrix,
  type LineDailyRow, type LineRowIssue, type LineUrlMaster, type LineUrlCv,
} from "./line-sheet-parse.js";
import { logger } from "./logger.js";

/**
 * `O2O×SICKS／LINE実績レポート` を読む。
 *
 * **値は `UNFORMATTED_VALUE` で取る。** 表示形式のままだと
 * 友だち数が `50,920`（桁区切り）、日付が `2月1日`（年が落ちる）で返ってくる。
 *
 * **タブ名はメタデータから解決する。** GASが作るタブには `GAS_` の接頭辞が付いており、
 * 手作業のタブ（`SICKS作成用_パラメURL`）には付いていない。接頭辞の有無で固定名を書くと、
 * 片方が必ず外れる。末尾一致で引き当て、見つからなければ**実際のタブ名を並べて**止める。
 */

const SPREADSHEET_ID = "1ol--HUyOeodoFPEQIyleBsP3HyFhFBv7rCJfrxrx42g";

/** 探すタブ。`suffix` は末尾一致で引き当てる名前。 */
const TABS = {
  daily: { suffix: "日実績", lastColumn: "DE" },
  urlMaster: { suffix: "作成用_パラメURL", lastColumn: "X" },
  urlCv: { suffix: "LINE_ECFCV（URL_日別）", lastColumn: "GZ" },
} as const;

/** 想定外に大きいときは部分集計を返さず止める。2026-11時点で日実績136行・CV357行。 */
const MAX_ROWS = 20000;

export interface LineSheetTab {
  title: string;
  /** スプレッドシートURLの `gid`。どのタブを見ているかを突き合わせるのに使う。 */
  sheetId: number;
  rowCount: number;
  columnCount: number;
}

export interface LineSheetSnapshot {
  daily: LineDailyRow[];
  issues: LineRowIssue[];
  master: LineUrlMaster[];
  cv: LineUrlCv[];
  /** 列数が109から変わっていたらここに入る。経路が増えた合図。 */
  columnCountWarning: string | null;
  masterSkipped: number;
  masterDuplicates: number;
  cvIdentifiers: number;
  cvInvalidDates: number;
  tabs: LineSheetTab[];
  fetchedAt: string;
}

function createClient() {
  const connectors = new ReplitConnectors();
  return async (path: string) => {
    const response = await connectors.proxy("google-sheet", path, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Google Sheetsからの読み取りに失敗しました（HTTP ${response.status}）`);
    }
    return response.json();
  };
}

export async function fetchLineSheet(): Promise<LineSheetSnapshot> {
  const get = createClient();
  const base = `/v4/spreadsheets/${SPREADSHEET_ID}`;

  const metadata = await get(`${base}?fields=sheets(properties(title,sheetId,gridProperties))`) as {
    sheets?: {
      properties?: {
        title?: string;
        sheetId?: number;
        gridProperties?: { rowCount?: number; columnCount?: number };
      };
    }[];
  };
  const tabs: LineSheetTab[] = (metadata.sheets ?? []).map((sheet) => ({
    title: sheet.properties?.title ?? "",
    sheetId: sheet.properties?.sheetId ?? -1,
    rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
    columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
  }));

  const resolve = (suffix: string): LineSheetTab => {
    const found = tabs.find((tab) => tab.title.endsWith(suffix));
    if (!found) {
      throw new Error(
        `タブ「…${suffix}」が見つかりません。実際のタブ: ${tabs.map((tab) => tab.title).join(" / ")}`,
      );
    }
    if (found.rowCount > MAX_ROWS) {
      throw new Error(`タブ「${found.title}」は${found.rowCount}行あり読取上限を超えています。部分集計を避けるため停止しました`);
    }
    return found;
  };

  const read = async (tab: LineSheetTab, lastColumn: string): Promise<unknown[][]> => {
    const range = `'${tab.title.replaceAll("'", "''")}'!A1:${lastColumn}${tab.rowCount}`;
    const result = await get(
      `${base}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
    ) as { values?: unknown[][] };
    return result.values ?? [];
  };

  const dailyTab = resolve(TABS.daily.suffix);
  const masterTab = resolve(TABS.urlMaster.suffix);
  const cvTab = resolve(TABS.urlCv.suffix);

  const [dailyValues, masterValues, cvValues] = await Promise.all([
    read(dailyTab, TABS.daily.lastColumn),
    read(masterTab, TABS.urlMaster.lastColumn),
    read(cvTab, TABS.urlCv.lastColumn),
  ]);

  const daily: LineDailyRow[] = [];
  const issues: LineRowIssue[] = [];
  for (const row of dailyValues) {
    const parsed = parseLineRow(row);
    if (!parsed) continue;
    daily.push(parsed);
    issues.push(...verifyLineRow(parsed));
  }

  // 列が増減していたら、位置で読んでいる日実績の読み取りがずれている可能性がある。
  const widest = dailyValues.reduce((max, row) => Math.max(max, row.length), 0);
  const columnCountWarning = widest > 0 && widest !== 109
    ? `日実績の列数が109ではなく${widest}列です。経路ゾーンが増減した可能性があるため、列位置の対応を確認してください。`
    : null;

  const master = parseUrlMaster(masterValues);
  const cv = parseCvMatrix(cvValues);

  logger.info({
    dailyRows: daily.length, issues: issues.length, masterRows: master.rows.length,
    cvRows: cv.rows.length, identifiers: cv.identifiers.length, widest,
  }, "Fetched LINE report sheet");

  return {
    daily,
    issues,
    master: master.rows,
    cv: cv.rows,
    columnCountWarning,
    masterSkipped: master.skipped,
    masterDuplicates: master.duplicates,
    cvIdentifiers: cv.identifiers.length,
    cvInvalidDates: cv.invalidDates,
    tabs,
    fetchedAt: new Date().toISOString(),
  };
}
