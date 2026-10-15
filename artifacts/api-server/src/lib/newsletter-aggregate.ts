import type { NewsletterRow, NewsletterMetrics } from "./newsletter-types.js";

function computeMetrics(label: string, rows: NewsletterRow[], extra?: { subject?: string | null; segment?: string | null; period?: string }): NewsletterMetrics {
  const deliveryCount = rows.reduce((s, r) => s + r.deliveryCount, 0);
  const openCount = rows.reduce((s, r) => s + r.openCount, 0);
  const clickCount = rows.reduce((s, r) => s + r.clickCount, 0);
  const cvCount = rows.reduce((s, r) => s + r.cvCount, 0);

  return {
    label,
    ...(extra?.period ? { period: extra.period } : {}),
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
export type TimeGroupBy = "day" | "week" | "month";

/** Derive calendar buckets from the delivery date, not ambiguous sheet week labels. */
export function newsletterPeriod(deliveryDate: string, granularity: TimeGroupBy): string {
  const normalized = deliveryDate.replace(/-/g, "/");
  if (granularity === "month") return normalized.slice(0, 7);
  if (granularity === "day") return normalized;
  const [year, month, day] = normalized.split("/").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10).replace(/-/g, "/");
}

export function aggregateRows(
  rows: NewsletterRow[],
  groupBy: GroupBy,
  timeGroupBy?: TimeGroupBy,
): NewsletterMetrics[] {
  const map = new Map<string, NewsletterRow[]>();

  for (const row of rows) {
    let key: string;
    switch (groupBy) {
      case "day":
        key = newsletterPeriod(row.deliveryDate, "day");
        break;
      case "week":
        key = newsletterPeriod(row.deliveryDate, "week");
        break;
      case "month":
        key = newsletterPeriod(row.deliveryDate, "month");
        break;
      case "scenario":
        key = JSON.stringify([row.scenarioName ?? "(未設定)", row.subject.trim(), timeGroupBy ? newsletterPeriod(row.deliveryDate, timeGroupBy) : undefined]);
        break;
      case "template":
        key = JSON.stringify([row.templateName, row.subject.trim(), timeGroupBy ? newsletterPeriod(row.deliveryDate, timeGroupBy) : undefined]);
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
      if (timeGroupBy) {
        const order = newsletterPeriod(a[0]!.deliveryDate, timeGroupBy).localeCompare(newsletterPeriod(b[0]!.deliveryDate, timeGroupBy));
        if (order) return order;
      }
      const totalA = a.reduce((s, r) => s + r.deliveryCount, 0);
      const totalB = b.reduce((s, r) => s + r.deliveryCount, 0);
      return totalB - totalA;
    });
  } else {
    entries.sort(([a], [b]) => a.localeCompare(b));
  }

  return entries.map(([key, groupRows]) => {
    if (groupBy === "scenario" || groupBy === "template") {
      const [label, subject, period] = JSON.parse(key) as [string, string, string | undefined];
      return computeMetrics(label, groupRows, { subject: subject || null, period });
    }
    // A scenario/template can have different subjects within the selected period.
    // Do not present the first subject as if it describes every delivery.
    const subjects = [...new Set(
      [...groupRows].sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))
        .map((row) => row.subject.trim() || "（件名未取得）"),
    )];
    const subject = ["template", "scenario", "day"].includes(groupBy)
      ? subjects.length === 1
        ? subjects[0] === "（件名未取得）" ? null : subjects[0]
        : `複数の件名（${subjects.length}種類）\n${subjects.join("\n")}`
      : null;
    return computeMetrics(key, groupRows, { subject });
  });
}

export function computeSummary(rows: NewsletterRow[]): NewsletterMetrics {
  return computeMetrics("合計", rows);
}

export function mergeComparisonMetrics(
  current: NewsletterMetrics[],
  prev: NewsletterMetrics[],
  groupBy?: GroupBy,
  periods?: { granularity: TimeGroupBy; currentStart?: string; previousStart?: string },
): NewsletterMetrics[] {
  const temporal = groupBy === "day" || groupBy === "week" || groupBy === "month";
  const bucket = (item: NewsletterMetrics) => item.period ?? (temporal ? item.label : undefined);
  const origin = (items: NewsletterMetrics[], start?: string) => {
    if (start && periods) return newsletterPeriod(start, periods.granularity);
    return items.map(bucket).filter((s): s is string => !!s).sort()[0];
  };
  const currentOrigin = origin(current, periods?.currentStart);
  const previousOrigin = origin(prev, periods?.previousStart);
  const offset = (period: string, start: string) => {
    if (periods?.granularity === "month") {
      const index = (value: string) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
      return index(period) - index(start);
    }
    const utc = (value: string) => Date.parse(`${value.replace(/\//g, "-")}T00:00:00Z`);
    return (utc(period) - utc(start)) / (86_400_000 * (periods?.granularity === "week" ? 7 : 1));
  };
  const identity = (item: NewsletterMetrics, start?: string) => {
    const period = bucket(item);
    const periodKey = periods && period && start ? offset(period, start) : period ?? "";
    return temporal ? JSON.stringify([periodKey])
      : groupBy === "scenario" || groupBy === "template"
        ? JSON.stringify([item.label, item.subject ?? "", periodKey])
        : item.label;
  };
  const prevMap = new Map(prev.map((p) => [identity(p, previousOrigin), p]));
  return current.map((item) => {
    const p = prevMap.get(identity(item, currentOrigin));
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

// ─── Matrix ────────────────────────────────────────────────────────
export type MatrixMetric = "deliveryCount" | "openRate" | "clickRate" | "cvr" | "cvCount";

export interface MatrixSeriesRow {
  key: string;
  type: "scenario" | "template";
  metricValues: Partial<Record<MatrixMetric, Record<string, number>>>;
}

export interface MatrixData {
  timePeriods: string[];
  series: MatrixSeriesRow[];
  metrics: MatrixMetric[];
}

function extractMetric(m: NewsletterMetrics, metric: MatrixMetric): number {
  switch (metric) {
    case "openRate": return m.openRate;
    case "clickRate": return m.clickRate;
    case "cvr": return m.cvr;
    case "cvCount": return m.cvCount;
    default: return m.deliveryCount;
  }
}

export function computeMatrixData(
  rows: NewsletterRow[],
  scenarios: string[],
  templates: string[],
  timeGroupBy: "day" | "week" | "month",
  metrics: MatrixMetric[],
): MatrixData {
  const allPeriods = new Set<string>();
  const rowsForScenarios = templates.length > 0
    ? rows.filter((row) => templates.includes(row.templateName))
    : rows;
  const rowsForTemplates = scenarios.length > 0
    ? rows.filter((row) => scenarios.includes(row.scenarioName))
    : rows;

  const buildRow = (filtered: NewsletterRow[], key: string, type: "scenario" | "template"): MatrixSeriesRow => {
    const agg = aggregateRows(filtered, timeGroupBy);
    for (const item of agg) allPeriods.add(item.label);
    const metricValues: Partial<Record<MatrixMetric, Record<string, number>>> = {};
    for (const m of metrics) {
      metricValues[m] = {};
      for (const item of agg) {
        metricValues[m]![item.label] = extractMetric(item, m);
      }
    }
    return { key, type, metricValues };
  };

  const series: MatrixSeriesRow[] = [
    ...scenarios.map((s) => buildRow(rowsForScenarios.filter((r) => r.scenarioName === s), s, "scenario")),
    ...templates.map((t) => buildRow(rowsForTemplates.filter((r) => r.templateName === t), t, "template")),
  ];

  const timePeriods = Array.from(allPeriods).sort();
  return { timePeriods, series, metrics };
}

export function getUniqueScenarioNames(rows: NewsletterRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.scenarioName) set.add(r.scenarioName);
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
