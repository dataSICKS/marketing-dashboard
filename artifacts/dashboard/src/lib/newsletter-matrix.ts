import type { MatrixResponse } from "@workspace/api-client-react";

type Series = MatrixResponse["series"][number];
export const MATRIX_DIMENSIONS = [
  { value: "scenario", label: "シナリオ", width: 220 },
  { value: "subject", label: "件名", width: 300 },
  { value: "template", label: "テンプレ", width: 220 },
] as const;
export type MatrixDimension = typeof MATRIX_DIMENSIONS[number]["value"];
export const DEFAULT_MATRIX_DIMENSIONS: MatrixDimension[] = ["scenario", "subject"];

export function matrixDimensionColumns(dimensions: MatrixDimension[]) {
  let left = 0;
  const columns = MATRIX_DIMENSIONS.filter((item) => dimensions.includes(item.value)).map((item) => {
    const column = { key: item.value as MatrixDimension | "total", label: item.label as string, width: item.width as number, left };
    left += item.width;
    return column;
  });
  return columns.length ? columns : [{ key: "total" as const, label: "集計", width: 120, left: 0 }];
}
export const matrixIdentityWidth = (dimensions: MatrixDimension[]) =>
  matrixDimensionColumns(dimensions).reduce((sum, column) => sum + column.width, 0);

/**
 * サーバ側 newsletter-aggregate.ts の OPTOUT_SERIES_KEY と同じ文字列。
 * オプトアウトはシナリオ/テンプレートに紐づかないので「指標」としては扱わず、
 * この専用系列を1行足すかどうかで管理する。
 */
export const OPTOUT_SERIES_KEY = "オプトアウト（全体）";
export const OPTOUT_METRIC = "optoutCount";
export const isOptoutSeries = (series: Pick<Series, "key">) => series.key === OPTOUT_SERIES_KEY;

/** オプトアウト行はオプトアウト数だけを持つ。他の系列は選択中の指標をそのまま並べる。 */
export const seriesMetrics = (series: Pick<Series, "key">, selected: string[]) =>
  isOptoutSeries(series) ? [OPTOUT_METRIC] : selected;

/** Include type as scenarios and templates can share both name and subject. */
export const matrixSeriesId = (series: Pick<Series, "type" | "key" | "subject" | "groupKey">) =>
  series.groupKey ?? JSON.stringify([series.type, series.key, series.subject]);

export const matrixSeriesLabel = (series: Series) =>
  series.dimensionValues
    ? MATRIX_DIMENSIONS.filter((dimension) => dimension.value in series.dimensionValues!)
      .map((dimension) => `${dimension.label}: ${series.dimensionValues![dimension.value] ?? "未設定"}`).join(" / ") || "合計"
    : `${series.type === "scenario" ? "シナリオ" : "テンプレ"}: ${series.key} / ${series.subject ?? "（件名未取得）"}`;

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
