import type { EfoAccessCvRow, EcfAdAccessCvRow, EfoMetrics } from "./efo-types.js";

export type EfoGroupBy = "day" | "week" | "month" | "template";

function toISO(date: string): string {
  return date.replace(/\//g, "-");
}

function getWeekLabel(dateStr: string): string {
  const iso = toISO(dateStr);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const diff = d.getTime() - startOfWeek1.getTime();
  const week = Math.floor(diff / (7 * 86400000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function getMonthLabel(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function ecfGroupKey(adDate: string, groupBy: EfoGroupBy): string {
  switch (groupBy) {
    case "week": return getWeekLabel(adDate);
    case "month": return adDate.slice(0, 7);
    default: return adDate;
  }
}

function efoGroupKey(date: string, groupBy: EfoGroupBy): string {
  const iso = toISO(date);
  switch (groupBy) {
    case "week": return getWeekLabel(iso);
    case "month": return iso.slice(0, 7);
    default: return iso;
  }
}

function buildEcfLpMap(ecfRows: EcfAdAccessCvRow[], groupBy: EfoGroupBy): Map<string, number> {
  // key: "{groupKey}|{adUrl}" → sum of lpAccessCount
  const map = new Map<string, number>();
  for (const r of ecfRows) {
    const key = `${ecfGroupKey(r.adDate, groupBy)}|${r.adUrl}`;
    map.set(key, (map.get(key) ?? 0) + r.lpAccessCount);
  }
  return map;
}

function computeMetrics(
  label: string,
  rows: EfoAccessCvRow[],
  lpAccessCount: number | null,
): EfoMetrics {
  const accessCount = rows.reduce((s, r) => s + r.accessCount, 0);
  const cvCount = rows.reduce((s, r) => s + r.cvCount, 0);
  const cvr = accessCount > 0 ? cvCount / accessCount : 0;
  const chatLaunchRate = lpAccessCount != null && lpAccessCount > 0 ? accessCount / lpAccessCount : null;
  const lpCvr = lpAccessCount != null && lpAccessCount > 0 ? cvCount / lpAccessCount : null;
  return { label, accessCount, cvCount, cvr, lpAccessCount, chatLaunchRate, lpCvr };
}

export function aggregateEfoRows(
  rows: EfoAccessCvRow[],
  groupBy: EfoGroupBy,
  ecfRows: EcfAdAccessCvRow[] = [],
): EfoMetrics[] {
  if (groupBy === "template") {
    const efoMap = new Map<string, EfoAccessCvRow[]>();
    for (const row of rows) {
      const key = row.profileName || "不明";
      if (!efoMap.has(key)) efoMap.set(key, []);
      efoMap.get(key)!.push(row);
    }
    const entries = Array.from(efoMap.entries()).sort(([a], [b]) => a.localeCompare(b, "ja"));
    return entries.map(([key, groupRows]) => computeMetrics(key, groupRows, null));
  }

  const efoMap = new Map<string, EfoAccessCvRow[]>();
  for (const row of rows) {
    const key = efoGroupKey(row.date, groupBy);
    if (!efoMap.has(key)) efoMap.set(key, []);
    efoMap.get(key)!.push(row);
  }

  const ecfLpMap = buildEcfLpMap(ecfRows, groupBy);

  const ecfGroupTotals = new Map<string, number>();
  for (const [key, lp] of ecfLpMap) {
    const groupKey = key.split("|")[0];
    ecfGroupTotals.set(groupKey, (ecfGroupTotals.get(groupKey) ?? 0) + lp);
  }

  const entries = Array.from(efoMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([key, groupRows]) => {
    const lp = ecfGroupTotals.has(key) ? ecfGroupTotals.get(key)! : null;
    return computeMetrics(key, groupRows, lp);
  });
}

export function computeEfoSummary(rows: EfoAccessCvRow[], ecfRows: EcfAdAccessCvRow[] = []): EfoMetrics {
  const lpAccessCount = ecfRows.length > 0
    ? ecfRows.reduce((s, r) => s + r.lpAccessCount, 0)
    : null;
  return computeMetrics("合計", rows, lpAccessCount);
}
