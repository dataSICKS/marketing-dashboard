import { Fragment } from "react";
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
          <th scope="col" className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-medium text-gray-500 min-w-[220px]">
            シナリオ / テンプレ
          </th>
          <th scope="col" className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">期間</th>
          {splitPeriod && <th scope="col" className="px-3 py-3 text-left font-medium text-gray-500 whitespace-nowrap">施策前後</th>}
          {selected.map((metric) => (
            <th scope="col" key={metric.value} className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">
              {metric.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {series.map((entry, index) => (
          <Fragment key={`${entry.type}-${entry.key}`}>
            {periods.map((period, periodIndex) => {
              const before = splitPeriod ? period < splitPeriod : undefined;
              const background = splitPeriod ? before ? "#F8FAFC" : "#F0FDF4"
                : index % 2 === 0 ? "#fff" : "#FAFAFA";
              return (
                <tr key={period} style={{ background, borderTop: periodIndex === 0 ? "2px solid #E5E7EB" : "1px solid #F3F4F6" }}>
                  {periodIndex === 0 && (
                    <th scope="rowgroup" rowSpan={periods.length}
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
                  )}
                  <th scope="row" className="px-3 py-2 text-left font-normal whitespace-nowrap text-gray-600">{period}</th>
                  {splitPeriod && (
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: before ? "#64748B" : "#059669" }}>
                      {before ? "施策前" : "施策後"}
                    </td>
                  )}
                  {selected.map((metric) => {
                    const value = entry.metricValues[metric.value]?.[period];
                    return (
                      <td key={metric.value} className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                        {value == null ? <span className="text-gray-300">—</span> : formatChartValueLabel(value, metric.isRate)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
