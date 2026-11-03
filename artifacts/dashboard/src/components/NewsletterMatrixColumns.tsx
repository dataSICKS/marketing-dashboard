import type { MatrixResponse } from "@workspace/api-client-react";
import { CHART_METRICS, formatChartValueLabel } from "@/lib/newsletter-chart";
import NewsletterMatrixIdentity from "@/components/NewsletterMatrixIdentity";
import { matrixSeriesId, type MatrixDimension } from "@/lib/newsletter-matrix";

interface Props {
  series: MatrixResponse["series"];
  periods: string[];
  metrics: string[];
  splitPeriod?: string;
  dimensions: MatrixDimension[];
}

/** Column layout uses the same aggregated values as the row layout. */
export default function NewsletterMatrixColumns({ series, periods, metrics, splitPeriod, dimensions }: Props) {
  const selected = metrics.flatMap((key) => {
    const metric = CHART_METRICS.find((entry) => entry.value === key);
    return metric ? [metric] : [];
  });

  return (
    <table aria-label="マトリクス表・指標を列に表示" className="text-xs border-collapse min-w-full">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-100">
          <NewsletterMatrixIdentity dimensions={dimensions} rowSpan={2} background="#F9FAFB" />
          {periods.map((period) => (
            <th scope="colgroup" colSpan={selected.length} key={period}
              className="border-l border-gray-200 px-4 py-3 text-center font-medium whitespace-nowrap"
              style={{ color: splitPeriod ? period < splitPeriod ? "#64748B" : "#059669" : "#6B7280",
                background: splitPeriod ? period < splitPeriod ? "#F8FAFC" : "#F0FDF4" : undefined }}>
              {period}
              {splitPeriod && <span className="ml-2 text-[10px]">{period < splitPeriod ? "施策前" : "施策後"}</span>}
            </th>
          ))}
        </tr>
        <tr className="bg-gray-50 border-b border-gray-100">
          {periods.flatMap((period) => selected.map((metric, metricIndex) => (
            <th scope="col" key={`${period}-${metric.value}`}
              className={`px-4 py-2 text-right font-medium text-gray-500 whitespace-nowrap ${metricIndex === 0 ? "border-l border-gray-200" : ""}`}>
              {metric.label}
            </th>
          )))}
        </tr>
      </thead>
      <tbody>
        {series.map((entry, index) => (
                <tr key={matrixSeriesId(entry)} style={{ background: index % 2 === 0 ? "#fff" : "#FAFAFA", borderTop: "1px solid #E5E7EB" }}>
                    <NewsletterMatrixIdentity dimensions={dimensions} series={entry} background={index % 2 === 0 ? "#fff" : "#FAFAFA"} />
                  {periods.flatMap((period) => selected.map((metric, metricIndex) => {
                    const value = entry.metricValues[metric.value]?.[period];
                    return (
                      <td key={`${period}-${metric.value}`}
                        className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${metricIndex === 0 ? "border-l border-gray-200" : ""}`}
                        style={{ background: splitPeriod ? period < splitPeriod ? "#F8FAFC" : "#F0FDF4" : undefined }}>
                        {value == null ? <span className="text-gray-300">—</span> : formatChartValueLabel(value, metric.isRate)}
                      </td>
                    );
                  }))}
                </tr>
        ))}
      </tbody>
    </table>
  );
}
