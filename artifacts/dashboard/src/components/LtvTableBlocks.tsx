import { useMemo } from "react";
import type { LtvMetrics } from "@workspace/api-client-react";
import { pivotLtvTable } from "@/lib/ltv-table";
import { formatNumber } from "@/lib/format";

interface Props {
  items: LtvMetrics[];
  splitLabel: string;
}

const yen = (value: number) => `¥${formatNumber(Math.round(value))}`;

export default function LtvTableBlocks({ items, splitLabel }: Props) {
  const { periods, blocks } = useMemo(() => pivotLtvTable(items), [items]);

  if (!blocks.length) {
    return <div className="py-8 text-center text-xs text-gray-400">データがありません</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" data-testid="ltv-table-blocks">
      {blocks.map(({ segment, metrics }) => (
        <section key={segment} aria-label={`${splitLabel}：${segment}`}
          className="overflow-hidden rounded-lg border border-gray-200" data-testid="ltv-table-block">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-4 py-3">
            <h3 className="break-all text-sm font-semibold text-gray-900">
              <span className="mr-2 text-xs font-normal text-gray-500">{splitLabel}</span>
              {segment}
            </h3>
            <span className="text-xs text-gray-500">{periods.length}か月</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" aria-label={`${segment}の月別LTV`}>
              <caption className="sr-only">横に初回購入月、縦に件数とLTV指標を表示。データのない月は「—」。</caption>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <th scope="col" className="sticky left-0 z-10 min-w-[110px] whitespace-nowrap bg-gray-50 px-4 py-2.5 text-left font-medium">項目 / 初回購入月</th>
                  {periods.map((period) => (
                    <th key={period} scope="col" className="min-w-[100px] whitespace-nowrap px-4 py-2.5 text-right font-medium">{period}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric, index) => (
                  <tr key={metric.key} className="border-t border-gray-100 odd:bg-white even:bg-gray-50">
                    <th scope="row"
                      className={`sticky left-0 z-10 whitespace-nowrap px-4 py-2 text-left font-medium text-gray-900 ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                      {metric.label}
                    </th>
                    {metric.values.map((value, periodIndex) => (
                      <td key={periods[periodIndex]} className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                        {value === null ? "—" : metric.key === "count" ? formatNumber(value) : yen(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
