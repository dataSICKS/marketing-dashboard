import type { EfoAccessCvRow, EfoMetrics } from "./efo-types.js";

export type EfoGroupBy = "day" | "week" | "month";

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

function computeMetrics(label: string, rows: EfoAccessCvRow[]): EfoMetrics {
  const accessCount = rows.reduce((s, r) => s + r.accessCount, 0);
  const cvCount = rows.reduce((s, r) => s + r.cvCount, 0);
  return {
    label,
    accessCount,
    cvCount,
    cvr: accessCount > 0 ? cvCount / accessCount : 0,
  };
}

export function aggregateEfoRows(
  rows: EfoAccessCvRow[],
  groupBy: EfoGroupBy
): EfoMetrics[] {
  const map = new Map<string, EfoAccessCvRow[]>();

  for (const row of rows) {
    let key: string;
    switch (groupBy) {
      case "day":
        key = row.date;
        break;
      case "week":
        key = getWeekLabel(row.date);
        break;
      case "month":
        key = getMonthLabel(row.date);
        break;
      default:
        key = row.date;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([key, groupRows]) => computeMetrics(key, groupRows));
}

export function computeEfoSummary(rows: EfoAccessCvRow[]): EfoMetrics {
  return computeMetrics("合計", rows);
}
