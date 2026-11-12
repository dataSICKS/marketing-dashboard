import type { LtvMetrics } from "@workspace/api-client-react";

/** Keep API metrics intact; only regroup monthly rows for presentation. */
export function groupLtvTableRows(items: readonly LtvMetrics[]) {
  const groups = new Map<string, LtvMetrics[]>();
  for (const item of items) {
    const rows = groups.get(item.segment) ?? [];
    rows.push(item);
    groups.set(item.segment, rows);
  }
  return Array.from(groups, ([segment, rows]) => ({
    segment,
    rows: rows.sort((a, b) => a.label.localeCompare(b.label)),
  })).sort((a, b) => a.segment.localeCompare(b.segment, "ja"));
}

const TABLE_METRICS = [
  { key: "count", label: "件数" },
  { key: "ltv95", label: "LTV95" },
  { key: "ltv180", label: "LTV180" },
  { key: "ltv365", label: "LTV365" },
] as const;

/** Use the same chronological columns in every block; absent data stays absent. */
export function pivotLtvTable(items: readonly LtvMetrics[]) {
  const periods = [...new Set(items.map((item) => item.label))].sort();
  const blocks = groupLtvTableRows(items).map(({ segment, rows }) => {
    const byPeriod = new Map(rows.map((item) => [item.label, item]));
    return {
      segment,
      metrics: TABLE_METRICS.map(({ key, label }) => ({
        key,
        label,
        values: periods.map((period) => byPeriod.get(period)?.[key] ?? null),
      })),
    };
  });
  return { periods, blocks };
}
