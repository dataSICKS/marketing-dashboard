import type { MatrixResponse } from "./sample-data";
import { CHART_METRICS, formatChartValueLabel } from "./chart-format";

interface Props {
  series: MatrixResponse["series"];
  periods: string[];
  metrics: string[];
}

/** One scenario per row, with its latest segment kept in the sticky row header. */
export default function LatestTable({ series, periods, metrics }: Props) {
  const selected = metrics.flatMap((key) => {
    const metric = CHART_METRICS.find((entry) => entry.value === key);
    return metric ? [metric] : [];
  });

  return (
    <table
      aria-label="マトリクス表・最新セグメント"
      className="min-w-[1240px] w-full border-collapse text-xs"
    >
      <thead>
        <tr className="border-b border-gray-100 bg-gray-50">
          <th
            scope="col"
            rowSpan={2}
            className="sticky left-0 z-20 min-w-[360px] bg-gray-50 px-4 py-3 text-left font-medium text-gray-500"
          >
            シナリオ / テンプレ
          </th>
          {periods.map((period) => (
            <th
              scope="colgroup"
              colSpan={selected.length}
              key={period}
              className="whitespace-nowrap border-l border-gray-200 px-4 py-3 text-center font-medium text-gray-600"
            >
              {period}
            </th>
          ))}
        </tr>
        <tr className="border-b border-gray-100 bg-gray-50">
          {periods.flatMap((period) =>
            selected.map((metric, metricIndex) => (
              <th
                scope="col"
                key={`${period}-${metric.value}`}
                className={`min-w-[110px] whitespace-nowrap px-4 py-2 text-right font-medium text-gray-500 ${
                  metricIndex === 0 ? "border-l border-gray-200" : ""
                }`}
              >
                {metric.label}
              </th>
            )),
          )}
        </tr>
      </thead>
      <tbody>
        {series.map((entry, index) => {
          const rowBackground = index % 2 === 0 ? "#fff" : "#FAFAFA";
          const latestSegment = entry.segments[entry.segments.length - 1];
          return (
            <tr
              key={`${entry.type}-${entry.key}`}
              data-testid={`row-scenario-${entry.key}`}
              style={{ background: rowBackground, borderTop: "1px solid #E5E7EB" }}
            >
              <th
                scope="row"
                className="sticky left-0 z-10 min-w-[360px] max-w-[420px] px-4 py-3 text-left align-middle font-medium"
                style={{ background: rowBackground }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px]"
                    style={{
                      background: entry.type === "scenario" ? "#EDE9FE" : "#FEF3C7",
                      color: entry.type === "scenario" ? "#7C3AED" : "#D97706",
                    }}
                  >
                    {entry.type === "scenario" ? "SC" : "TP"}
                  </span>
                  <div className="min-w-0">
                    <div className="break-all text-[12px] leading-5 text-gray-800">{entry.key}</div>
                    <div className="mt-0.5 flex items-baseline gap-1.5 text-[10px] font-normal leading-4">
                      <span className="shrink-0 text-gray-400">最新セグメント</span>
                      <span className="break-words text-gray-600">{latestSegment || "—"}</span>
                    </div>
                  </div>
                </div>
              </th>
              {periods.flatMap((period) =>
                selected.map((metric, metricIndex) => {
                  const value = entry.metricValues[metric.value]?.[period];
                  return (
                    <td
                      key={`${period}-${metric.value}`}
                      className={`whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-700 ${
                        metricIndex === 0 ? "border-l border-gray-200" : ""
                      }`}
                    >
                      {value == null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        formatChartValueLabel(value, metric.isRate)
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          );
        })}
        {series.length === 0 && (
          <tr>
            <td colSpan={1 + periods.length * selected.length} className="px-6 py-12 text-center text-sm text-gray-400">
              条件に一致するシナリオはありません
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
