import type { MatrixResponse } from "@workspace/api-client-react";
import { CHART_METRICS, formatChartValueLabel } from "@/lib/newsletter-chart";

interface Props {
  series: MatrixResponse["series"];
  periods: string[];
  metrics: string[];
  splitPeriod?: string;
}

/** Column layout uses the same aggregated values as the row layout. */
export default function NewsletterMatrixColumns({ series, periods, metrics, splitPeriod }: Props) {
  const selected = metrics.flatMap((key) => {
    const metric = CHART_METRICS.find((entry) => entry.value === key);
    return metric ? [metric] : [];
  });

  return (
    <table aria-label="マトリクス表・指標を列に表示" className="text-xs border-collapse min-w-full">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-100">
          <th scope="col" rowSpan={2} className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-medium text-gray-500 min-w-[220px]">
            シナリオ / テンプレ
          </th>
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
                <tr key={`${entry.type}-${entry.key}`} style={{ background: index % 2 === 0 ? "#fff" : "#FAFAFA", borderTop: "1px solid #E5E7EB" }}>
                    <th scope="row"
                      className="sticky left-0 z-10 px-4 py-3 text-left align-middle font-medium min-w-[220px] max-w-[320px]"
                      style={{ background: index % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <div className="flex items-start gap-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] shrink-0"
                          style={{ background: entry.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: entry.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                          {entry.type === "scenario" ? "SC" : "TP"}
                        </span>
                        <span className="break-all">{entry.key}</span>
                      </div>
                    </th>
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
