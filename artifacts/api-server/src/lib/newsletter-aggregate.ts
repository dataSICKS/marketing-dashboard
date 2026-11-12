import type { NewsletterRow, NewsletterMetrics } from "./newsletter-types.js";
const utcDate = (value: string) => new Date(`${value.replace(/\//g, "-")}T00:00:00Z`);
const dateLabel = (value: Date) => value.toISOString().slice(0, 10).replace(/-/g, "/");

/** Shift from the original anniversary day; clamp at month-end without drift. */
export function shiftAnchor(anchor: string, months: number): Date {
  const origin = utcDate(anchor);
  const first = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(origin.getUTCDate(), lastDay));
  return first;
}

export function newsletterPeriod(date: string, grain: TimeGroupBy, anchor?: string): string {
  const normalized = date.replace(/-/g, "/");
  if (grain === "day") return normalized;
  const value = utcDate(date);
  if (anchor) {
    const origin = utcDate(anchor);
    if (grain === "week") {
      const index = Math.floor((value.getTime() - origin.getTime()) / (7 * 86_400_000));
      return dateLabel(new Date(origin.getTime() + index * 7 * 86_400_000));
    }
    let index = (value.getUTCFullYear() - origin.getUTCFullYear()) * 12 + value.getUTCMonth() - origin.getUTCMonth();
    if (value < shiftAnchor(anchor, index)) index--;
    return dateLabel(shiftAnchor(anchor, index));
  }
  if (grain === "month") return normalized.slice(0, 7);
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return dateLabel(value);
}

export function periodEnd(start: string, grain: TimeGroupBy, anchor: string): string {
  const value = utcDate(start);
  if (grain === "month") {
    const origin = utcDate(anchor);
    const index = (value.getUTCFullYear() - origin.getUTCFullYear()) * 12 + value.getUTCMonth() - origin.getUTCMonth();
    return dateLabel(new Date(shiftAnchor(anchor, index + 1).getTime() - 86_400_000));
  }
  return dateLabel(new Date(value.getTime() + (grain === "week" ? 6 : 0) * 86_400_000));
}

function computeMetrics(label: string, rows: NewsletterRow[], extra?: { subject?: string | null; segment?: string | null; period?: string; periodEnd?: string }): NewsletterMetrics {
  const deliveryCount = rows.reduce((s, r) => s + r.deliveryCount, 0);
  const openCount = rows.reduce((s, r) => s + r.openCount, 0);
  const clickCount = rows.reduce((s, r) => s + r.clickCount, 0);
  const cvCount = rows.reduce((s, r) => s + r.cvCount, 0);

  return {
    label,
    ...(extra?.period ? { period: extra.period } : {}),
    ...(extra?.periodEnd ? { periodEnd: extra.periodEnd } : {}),
    subject: extra?.subject ?? null,
    segment: extra?.segment ?? null,
    deliveryCount,
    openCount,
    clickCount,
    cvCount,
    openRate: deliveryCount > 0 ? openCount / deliveryCount : 0,
    clickRate: openCount > 0 ? clickCount / openCount : 0,
    cvr: deliveryCount > 0 ? cvCount / deliveryCount : 0,
    prevDeliveryCount: null,
    prevOpenRate: null,
    prevClickRate: null,
    prevCvr: null,
  };
}

export type GroupBy = "day" | "week" | "month" | "scenario" | "template";
export type TimeGroupBy = "day" | "week" | "month";

export function aggregateRows(
  rows: NewsletterRow[],
  groupBy: GroupBy,
  timeGroupBy?: TimeGroupBy,
  anchorDate?: string,
): NewsletterMetrics[] {
  const map = new Map<string, NewsletterRow[]>();

  for (const row of rows) {
    let key: string;
    switch (groupBy) {
      case "day":
        key = newsletterPeriod(row.deliveryDate, "day", anchorDate);
        break;
      case "week":
        key = newsletterPeriod(row.deliveryDate, "week", anchorDate);
        break;
      case "month":
        key = newsletterPeriod(row.deliveryDate, "month", anchorDate);
        break;
      case "scenario":
        key = JSON.stringify([row.scenarioName ?? "(未設定)", row.subject.trim(), timeGroupBy ? newsletterPeriod(row.deliveryDate, timeGroupBy, anchorDate) : undefined]);
        break;
      case "template":
        key = JSON.stringify([row.templateName, row.subject.trim(), timeGroupBy ? newsletterPeriod(row.deliveryDate, timeGroupBy, anchorDate) : undefined]);
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
        const order = newsletterPeriod(a[0]!.deliveryDate, timeGroupBy, anchorDate).localeCompare(newsletterPeriod(b[0]!.deliveryDate, timeGroupBy, anchorDate));
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
      return computeMetrics(label, groupRows, {
        subject: subject || null, period,
        periodEnd: anchorDate && timeGroupBy && period ? periodEnd(period, timeGroupBy, anchorDate) : undefined,
      });
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
    return computeMetrics(key, groupRows, {
      subject,
      periodEnd: anchorDate ? periodEnd(key, groupBy as TimeGroupBy, anchorDate) : undefined,
    });
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
export type MatrixMetric = "deliveryCount" | "openCount" | "clickCount" | "openRate" | "clickRate" | "cvr" | "cvCount" | "optoutCount";

/** オプトアウトは配信行に紐づかないため、専用の1系列としてマトリクスに並べる。 */
export const OPTOUT_SERIES_KEY = "オプトアウト（全体）";
export type MatrixDimension = "scenario" | "subject" | "template";

export interface MatrixSeriesRow {
  key: string;
  groupKey?: string;
  dimensionValues?: Partial<Record<MatrixDimension, string | null>>;
  subject: string | null;
  type: "scenario" | "template";
  segments: string[];
  latestSegment: { scenarioName: string; segment: string; date: string } | null;
  periodSegments: Record<string, { scenarioName: string; segment: string }[]>;
  metricValues: Partial<Record<MatrixMetric, Record<string, number>>>;
}

export interface MatrixData {
  timePeriods: string[];
  series: MatrixSeriesRow[];
  metrics: MatrixMetric[];
}

function extractMetric(m: NewsletterMetrics, metric: MatrixMetric): number {
  switch (metric) {
    case "openCount": return m.openCount;
    case "clickCount": return m.clickCount;
    case "openRate": return m.openRate;
    case "clickRate": return m.clickRate;
    case "cvr": return m.cvr;
    case "cvCount": return m.cvCount;
    // optoutCount は配信行から計算できない（専用系列で別途埋める）。
    case "optoutCount": return 0;
    default: return m.deliveryCount;
  }
}

export function computeMatrixData(
  rows: NewsletterRow[],
  scenarios: string[],
  templates: string[],
  timeGroupBy: "day" | "week" | "month",
  metrics: MatrixMetric[],
  anchorDate?: string,
  dimensions?: MatrixDimension[],
  optoutByPeriod?: Record<string, number>,
): MatrixData {
  const allPeriods = new Set<string>();
  const rowsForScenarios = templates.length > 0
    ? rows.filter((row) => templates.includes(row.templateName))
    : rows;
  const rowsForTemplates = scenarios.length > 0
    ? rows.filter((row) => scenarios.includes(row.scenarioName))
    : rows;

  const buildRow = (filtered: NewsletterRow[], key: string, type: "scenario" | "template", subject: string | null): MatrixSeriesRow => {
    const agg = aggregateRows(filtered, timeGroupBy, undefined, anchorDate);
    for (const item of agg) allPeriods.add(item.label);
    const metricValues: Partial<Record<MatrixMetric, Record<string, number>>> = {};
    for (const m of metrics) {
      // オプトアウトはシナリオ/テンプレート別に分解できない。各系列に全体値を入れると
      // どの行も同じ数字になって誤読されるので、専用系列（OPTOUT_SERIES_KEY）だけが持つ。
      if (m === "optoutCount") continue;
      metricValues[m] = {};
      for (const item of agg) {
        metricValues[m]![item.label] = extractMetric(item, m);
      }
    }
    const segments = [...new Set(filtered.map((row) => row.segment?.trim()).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "ja"));
    const periodSegments: MatrixSeriesRow["periodSegments"] = {};
    let latestSegment: MatrixSeriesRow["latestSegment"] = null;
    for (const row of filtered) {
      const date = row.deliveryDate.replace(/\//g, "-");
      if (!latestSegment || date >= latestSegment.date) {
        latestSegment = { scenarioName: row.scenarioName, segment: row.segment?.trim() ?? "", date };
      }
      const period = newsletterPeriod(row.deliveryDate, timeGroupBy, anchorDate);
      const entry = { scenarioName: row.scenarioName, segment: row.segment?.trim() ?? "" };
      const entries = periodSegments[period] ??= [];
      if (!entries.some((other) => other.scenarioName === entry.scenarioName && other.segment === entry.segment)) entries.push(entry);
    }
    for (const entries of Object.values(periodSegments)) {
      entries.sort((a, b) => a.scenarioName.localeCompare(b.scenarioName, "ja") || a.segment.localeCompare(b.segment, "ja"));
    }
    return { key, subject, type, segments, latestSegment, periodSegments, metricValues };
  };

  const buildSubjectRows = (filtered: NewsletterRow[], key: string, type: "scenario" | "template") => {
    const bySubject = new Map<string | null, NewsletterRow[]>();
    for (const row of filtered) {
      const subject = row.subject.trim() || null;
      const group = bySubject.get(subject) ?? [];
      group.push(row);
      bySubject.set(subject, group);
    }
    return Array.from(bySubject, ([subject, deliveries]) => buildRow(deliveries, key, type, subject));
  };
  let series: MatrixSeriesRow[] = dimensions === undefined ? [
    ...scenarios.flatMap((s) => buildSubjectRows(rowsForScenarios.filter((r) => r.scenarioName === s), s, "scenario")),
    ...templates.flatMap((t) => buildSubjectRows(rowsForTemplates.filter((r) => r.templateName === t), t, "template")),
  ] : [];

  if (dimensions !== undefined) {
    // Group source deliveries once, not the already aggregated scenario/template rows.
    // This avoids duplicate counts when both scenario and template filters are selected.
    allPeriods.clear();
    const selected = (["scenario", "subject", "template"] as const).filter((dimension) => dimensions.includes(dimension));
    const groups = new Map<string, { values: NonNullable<MatrixSeriesRow["dimensionValues"]>; rows: NewsletterRow[] }>();
    for (const row of rows) {
      if (scenarios.length && !scenarios.includes(row.scenarioName)) continue;
      if (templates.length && !templates.includes(row.templateName)) continue;
      const values: NonNullable<MatrixSeriesRow["dimensionValues"]> = {};
      for (const dimension of selected) {
        const value = dimension === "scenario" ? row.scenarioName : dimension === "template" ? row.templateName : row.subject;
        values[dimension] = value.trim() || null;
      }
      const groupKey = JSON.stringify(selected.map((dimension) => [dimension, values[dimension]]));
      const group = groups.get(groupKey) ?? { values, rows: [] };
      group.rows.push(row);
      groups.set(groupKey, group);
    }
    series = Array.from(groups, ([groupKey, group]) => ({
      ...buildRow(group.rows, selected.map((dimension) => group.values[dimension] ?? "未設定").join(" / ") || "合計",
        selected.includes("scenario") ? "scenario" : "template", group.values.subject ?? null),
      groupKey,
      dimensionValues: group.values,
    }));
  }

  if (metrics.includes("optoutCount") && optoutByPeriod) {
    const values: Record<string, number> = {};
    for (const [period, count] of Object.entries(optoutByPeriod)) {
      // 配信が1件も無い期間でもオプトアウトは発生するので、列（期間）側も足しておく。
      allPeriods.add(period);
      values[period] = count;
    }
    series = [...series, {
      key: OPTOUT_SERIES_KEY,
      subject: null,
      type: "scenario",
      segments: [],
      latestSegment: null,
      periodSegments: {},
      metricValues: { optoutCount: values },
      ...(dimensions === undefined ? {} : {
        groupKey: JSON.stringify([["optout", OPTOUT_SERIES_KEY]]),
        dimensionValues: Object.fromEntries(
          (["scenario", "subject", "template"] as const)
            .filter((dimension) => dimensions.includes(dimension))
            .map((dimension, index) => [dimension, index === 0 ? OPTOUT_SERIES_KEY : null]),
        ),
      }),
    }];
  }

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
