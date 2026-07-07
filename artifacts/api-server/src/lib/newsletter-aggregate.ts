import type { NewsletterRow, NewsletterMetrics } from "./newsletter-types.js";

function computeMetrics(label: string, rows: NewsletterRow[], extra?: { subject?: string | null; segment?: string | null }): NewsletterMetrics {
  const deliveryCount = rows.reduce((s, r) => s + r.deliveryCount, 0);
  const openCount = rows.reduce((s, r) => s + r.openCount, 0);
  const clickCount = rows.reduce((s, r) => s + r.clickCount, 0);
  const cvCount = rows.reduce((s, r) => s + r.cvCount, 0);

  return {
    label,
    subject: extra?.subject ?? null,
    segment: extra?.segment ?? null,
    deliveryCount,
    openCount,
    clickCount,
    cvCount,
    openRate: deliveryCount > 0 ? openCount / deliveryCount : 0,
    clickRate: deliveryCount > 0 ? clickCount / deliveryCount : 0,
    cvr: deliveryCount > 0 ? cvCount / deliveryCount : 0,
    prevDeliveryCount: null,
    prevOpenRate: null,
    prevClickRate: null,
    prevCvr: null,
  };
}

export type GroupBy = "day" | "week" | "month" | "scenario" | "template";

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
        key = row.segment ?? "(未設定)";
        break;
      case "template":
        key = row.templateName;
        break;
      default:
        key = row.deliveryDate;
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  const entries = Array.from(map.entries());

  if (groupBy === "template" || groupBy === "scenario") {
    entries.sort(([, a], [, b]) => {
      const totalA = a.reduce((s, r) => s + r.deliveryCount, 0);
      const totalB = b.reduce((s, r) => s + r.deliveryCount, 0);
      return totalB - totalA;
    });
  } else {
    entries.sort(([a], [b]) => a.localeCompare(b));
  }

  return entries.map(([key, groupRows]) => {
    const subject = groupBy === "template"
      ? (groupRows[0]?.subject ?? null)
      : groupBy === "day"
        ? (groupRows[0]?.subject ?? null)
        : null;
    return computeMetrics(key, groupRows, { subject });
  });
}

export function computeSummary(rows: NewsletterRow[]): NewsletterMetrics {
  return computeMetrics("合計", rows);
}

export function mergeComparisonMetrics(
  current: NewsletterMetrics[],
  prev: NewsletterMetrics[]
): NewsletterMetrics[] {
  const prevMap = new Map(prev.map((p) => [p.label, p]));
  return current.map((item) => {
    const p = prevMap.get(item.label);
    if (!p) return item;
    return {
      ...item,
      prevDeliveryCount: p.deliveryCount,
      prevOpenRate: p.openRate,
      prevClickRate: p.clickRate,
      prevCvr: p.cvr,
    };
  });
}

export function getUniqueSegments(rows: NewsletterRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.segment) set.add(r.segment);
  }
  return Array.from(set).sort();
}

export function getUniqueTemplates(rows: NewsletterRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.templateName) set.add(r.templateName);
  }
  return Array.from(set).sort();
}
