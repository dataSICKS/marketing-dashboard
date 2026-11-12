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
