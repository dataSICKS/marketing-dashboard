import { ReplitConnectors } from "@replit/connectors-sdk";
import type { EfoAccessCvRow, EfoExitScenarioRow } from "./efo-types.js";
import { logger } from "./logger.js";

const SPREADSHEET_ID = "1gibjDJns9sIR5bnxDAKELz2a4ajWWpcdrvVetjnY0HM";
const MAX_ROWS = 10000;

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  const n = Number(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export async function fetchEfoAccessSheet(): Promise<EfoAccessCvRow[]> {
  const connectors = new ReplitConnectors();

  const [accessResp, cvResp] = await Promise.all([
    connectors.proxy(
      "google-sheet",
      `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`raw_efo_access!R2:U${MAX_ROWS}`)}`,
      { method: "GET" }
    ),
    connectors.proxy(
      "google-sheet",
      `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`raw_efo_cv!Y2:AB${MAX_ROWS}`)}`,
      { method: "GET" }
    ),
  ]);

  const accessData = await accessResp.json() as { values?: string[][] };
  const cvData = await cvResp.json() as { values?: string[][] };

  // access: R=日付, S=広告コード, T=プロファイル名, U=起動数
  const accessMap = new Map<string, number>();
  for (const row of accessData.values ?? []) {
    const date = row[0] ?? "";
    const adCode = row[1] ?? "";
    const profileName = row[2] ?? "";
    const count = parseNum(row[3]);
    if (!date || !adCode || !profileName) continue;
    const key = `${date}|${adCode}|${profileName}`;
    accessMap.set(key, (accessMap.get(key) ?? 0) + count);
  }

  // cv: Y=日付, Z=広告コード, AA=プロファイル名, AB=CV
  const cvMap = new Map<string, number>();
  for (const row of cvData.values ?? []) {
    const date = row[0] ?? "";
    const adCode = row[1] ?? "";
    const profileName = row[2] ?? "";
    const count = parseNum(row[3]);
    if (!date || !adCode || !profileName) continue;
    const key = `${date}|${adCode}|${profileName}`;
    cvMap.set(key, (cvMap.get(key) ?? 0) + count);
  }

  // merge: union of all keys
  const allKeys = new Set([...accessMap.keys(), ...cvMap.keys()]);
  const rows: EfoAccessCvRow[] = [];
  for (const key of allKeys) {
    const [date, adCode, profileName] = key.split("|");
    rows.push({
      date,
      adCode,
      profileName,
      accessCount: accessMap.get(key) ?? 0,
      cvCount: cvMap.get(key) ?? 0,
    });
  }

  logger.info({ rowCount: rows.length }, "Fetched EFO access/cv rows from Google Sheets");
  return rows;
}

export async function fetchEfoExitScenariosSheet(): Promise<EfoExitScenarioRow[]> {
  const connectors = new ReplitConnectors();

  // A=セッション, B=プロファイル名, F=離脱シナリオ, M=広告コード, O=日付
  const resp = await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(`raw_efo_access!A2:O${MAX_ROWS}`)}`,
    { method: "GET" }
  );
  const data = await resp.json() as { values?: string[][] };

  // aggregate: (date, profileName, adCode, exitScenario) → count
  const countMap = new Map<string, number>();
  for (const row of data.values ?? []) {
    if (row.length < 15) continue;
    const profileName = row[1] ?? "";
    const exitScenario = row[5] ?? "";
    const adCode = row[12] ?? "";
    const date = row[14] ?? "";
    if (!date || !exitScenario) continue;
    const key = `${date}|${profileName}|${adCode}|${exitScenario}`;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const rows: EfoExitScenarioRow[] = [];
  for (const [key, sessionCount] of countMap.entries()) {
    const [date, profileName, adCode, exitScenario] = key.split("|");
    rows.push({ date, profileName, adCode, exitScenario, sessionCount });
  }

  logger.info({ rowCount: rows.length }, "Fetched EFO exit scenario rows from Google Sheets");
  return rows;
}
