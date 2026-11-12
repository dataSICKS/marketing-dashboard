import type { OptoutRow, OptoutMetrics } from "./newsletter-types.js";
import { newsletterPeriod, type TimeGroupBy } from "./newsletter-aggregate.js";

export type OptoutGroupBy = "day" | "week" | "month";

/**
 * 期間ラベル。既存の配信データ（calcシートの「配信月週」列）の表記に合わせる。
 * day: 2026/01/05 / week: 1月1W / month: 2026/01
 * 週は「月初から7日ごと」で、calcシートの既存ラベル（9/12→9月2W, 9/15→9月3W）と一致する。
 */
export function periodLabel(isoDate: string, groupBy: OptoutGroupBy): string {
  const [y, m, d] = isoDate.split("-");
  if (groupBy === "day") return `${y}/${m}/${d}`;
  if (groupBy === "month") return `${y}/${m}`;
  const week = Math.floor((Number(d) - 1) / 7) + 1;
  return `${Number(m)}月${week}W`;
}

/** ラベルの時系列ソート用キー（週ラベルは年月を含まないため別途キーを持つ） */
function sortKey(isoDate: string, groupBy: OptoutGroupBy): string {
  if (groupBy === "month") return isoDate.slice(0, 7);
  if (groupBy === "day") return isoDate;
  const [y, m, d] = isoDate.split("-");
  const week = Math.floor((Number(d) - 1) / 7) + 1;
  return `${y}-${m}-${week}`;
}

export function filterByDate(rows: OptoutRow[], from?: string, to?: string): OptoutRow[] {
  let out = rows;
  if (from) out = out.filter((r) => r.optoutDate >= from);
  if (to) out = out.filter((r) => r.optoutDate <= to);
  return out;
}

export function aggregateOptouts(rows: OptoutRow[], groupBy: OptoutGroupBy): OptoutMetrics[] {
  const map = new Map<string, { label: string; count: number }>();

  for (const row of rows) {
    const key = sortKey(row.optoutDate, groupBy);
    const entry = map.get(key);
    if (entry) {
      entry.count++;
    } else {
      map.set(key, { label: periodLabel(row.optoutDate, groupBy), count: 1 });
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ label: v.label, optoutCount: v.count, prevOptoutCount: null }));
}

/**
 * 比較期間の値を同じ期間ラベルに突き合わせる（既存の mergeComparisonMetrics と同じ方式）。
 * 比較期間が別の日付範囲だとラベルは一致しないので、その場合 prev は null のままになる。
 * 期間全体の比較は summary.prevOptoutCount（期間内の総件数）で行う。
 */
export function mergeOptoutComparison(current: OptoutMetrics[], prev: OptoutMetrics[]): OptoutMetrics[] {
  const prevMap = new Map(prev.map((p) => [p.label, p]));
  return current.map((item) => {
    const p = prevMap.get(item.label);
    if (!p) return item;
    return { ...item, prevOptoutCount: p.optoutCount };
  });
}

export function earliestDate(rows: OptoutRow[]): string | null {
  let min: string | null = null;
  for (const r of rows) {
    if (min === null || r.optoutDate < min) min = r.optoutDate;
  }
  return min;
}

/**
 * 配信データとまったく同じ期間ラベルでオプトアウトを数える。
 * オプトアウトを「指標の1つ」としてトレンド/マトリクスに重ねるには、
 * ラベルが aggregateRows（newsletterPeriod）と一致していないと突き合わせできない。
 * periodLabel（週＝「9月2W」）とは別物なので混同しないこと。
 */
export function optoutCountsByPeriod(
  rows: OptoutRow[],
  grain: TimeGroupBy,
  anchorDate?: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const label = newsletterPeriod(row.optoutDate, grain, anchorDate);
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return counts;
}
