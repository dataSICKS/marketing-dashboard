import type { MatrixResponse } from "@workspace/api-client-react";

type Series = MatrixResponse["series"][number];

/** Include type as scenarios and templates can share both name and subject. */
export const matrixSeriesId = (series: Pick<Series, "type" | "key" | "subject">) =>
  JSON.stringify([series.type, series.key, series.subject]);

export const matrixSeriesLabel = (series: Series) =>
  `${series.type === "scenario" ? "シナリオ" : "テンプレ"}: ${series.key} / ${series.subject ?? "（件名未取得）"}`;

/** Avoid Recharts treating subject punctuation as nested property paths. */
export const matrixMetricKey = (series: Series, metric: string) =>
  `m_${encodeURIComponent(matrixSeriesId(series)).replace(/\./g, "%2E")}__${metric}`;

/** A subject delivered on only one side must still appear, without borrowing another subject's metrics. */
export function mergeMatrixSeries(before: Series[] = [], after: Series[] = []): Series[] {
  const merged = new Map<string, Series>();
  for (const row of [...before, ...after]) {
    const id = matrixSeriesId(row);
    const previous = merged.get(id);
    if (!previous) {
      merged.set(id, row);
      continue;
    }
    const metricValues = { ...previous.metricValues };
    for (const key of Object.keys(row.metricValues) as (keyof Series["metricValues"])[]) {
      metricValues[key] = { ...previous.metricValues[key], ...row.metricValues[key] };
    }
    const latestSegment = row.latestSegment && (!previous.latestSegment || row.latestSegment.date >= previous.latestSegment.date)
      ? row.latestSegment : previous.latestSegment;
    merged.set(id, {
      ...previous,
      metricValues,
      latestSegment,
      segments: [...new Set([...previous.segments, ...row.segments])],
      periodSegments: { ...previous.periodSegments, ...row.periodSegments },
    });
  }
  return [...merged.values()];
}
