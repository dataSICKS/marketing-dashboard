import type { NewsletterRow, NewsletterMetrics } from "./newsletter-types.js";

function computeMetrics(label: string, rows: NewsletterRow[]): NewsletterMetrics {
  const deliveryCount = rows.reduce((s, r) => s + r.deliveryCount, 0);
  const openCount = rows.reduce((s, r) => s + r.openCount, 0);
  const clickCount = rows.reduce((s, r) => s + r.clickCount, 0);
  const cvCount = rows.reduce((s, r) => s + r.cvCount, 0);

  return {
    label,
    deliveryCount,
    openCount,
    clickCount,
    cvCount,
    openRate: deliveryCount > 0 ? openCount / deliveryCount : 0,
    clickRate: deliveryCount > 0 ? clickCount / deliveryCount : 0,
    cvr: deliveryCount > 0 ? cvCount / deliveryCount : 0,
  };
}

export type GroupBy = "day" | "week" | "month" | "scenario";

export function aggregateRows(
  rows: NewsletterRow[],
  groupBy: GroupBy
): NewsletterMetrics[] {
  const map = new Map<string, NewsletterRow[]>();

  for (const row of rows) {
    let key: string;
    switch (groupBy) {
      case "day":
        key = row.deliveryDate;
        break;
      case "week":
        key = row.deliveryWeek || row.deliveryYearMonth;
        break;
      case "month":
        key = row.deliveryYearMonth;
        break;
      case "scenario":
        key = row.scenarioName;
        break;
      default:
        key = row.deliveryDate;
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const entries = Array.from(map.entries());

  if (groupBy !== "scenario") {
    entries.sort(([a], [b]) => a.localeCompare(b));
  } else {
    entries.sort(([, a], [, b]) => {
      const totalA = a.reduce((s, r) => s + r.deliveryCount, 0);
      const totalB = b.reduce((s, r) => s + r.deliveryCount, 0);
      return totalB - totalA;
    });
  }

  return entries.map(([key, groupRows]) => computeMetrics(key, groupRows));
}

export function computeSummary(rows: NewsletterRow[]): NewsletterMetrics {
  return computeMetrics("合計", rows);
}
