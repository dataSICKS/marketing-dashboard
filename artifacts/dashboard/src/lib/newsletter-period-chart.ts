import type { ChartMetric } from "./newsletter-chart";

type SourceRow = {
  label: string;
  period?: string;
  subject?: string | null;
} & Partial<Record<ChartMetric, number | null>>;

type PeriodPoint = { chartKey: string; label: string; [key: string]: string | number | null };

/** Period is the X axis. Identity/subject belong to separate series, never ticks. */
export function buildNewsletterPeriodChart(items: SourceRow[], metrics: readonly ChartMetric[]) {
  const series = new Map<string, { id: string; name: string; keys: Partial<Record<ChartMetric, string>> }>();
  const periods = new Map<string, PeriodPoint>();
  for (const item of items) {
    if (!item.period) throw new Error("件名別グラフに集計期間がありません");
    const id = JSON.stringify([item.label, item.subject ?? null]);
    const entry = series.get(id) ?? {
      id, name: `${item.label} / ${item.subject ?? "（件名未取得）"}`,
      keys: {} as Partial<Record<ChartMetric, string>>,
    };
    const point = periods.get(item.period) ?? { chartKey: item.period, label: item.period };
    for (const metric of metrics) {
      const key = `s_${encodeURIComponent(id).replace(/\./g, "%2E")}__${metric}`;
      entry.keys[metric] = key;
      point[key] = item[metric] ?? null;
    }
    series.set(id, entry);
    periods.set(item.period, point);
  }
  const points = [...periods.values()].sort((a, b) => a.chartKey.localeCompare(b.chartKey));
  for (const point of points) {
    for (const entry of series.values()) {
      for (const key of Object.values(entry.keys)) point[key] ??= null;
    }
  }
  return { points, series: [...series.values()] };
}
