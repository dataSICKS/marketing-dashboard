import { useMemo } from "react";
import type { LtvMetrics } from "@workspace/api-client-react";
import { groupLtvTableRows } from "@/lib/ltv-table";
import { formatNumber } from "@/lib/format";

interface Props {
  items: LtvMetrics[];
  splitLabel: string;
}

const yen = (value: number) => `¥${formatNumber(Math.round(value))}`;

export default function LtvTableBlocks({ items, splitLabel }: Props) {
  const blocks = useMemo(() => groupLtvTableRows(items), [items]);

  if (!blocks.length) {
    return <div className="py-8 text-center text-xs text-gray-400">データがありません</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6" data-testid="ltv-table-blocks">
      {blocks.map(({ segment, rows }) => (
        <section key={segment} aria-label={`${splitLabel}：${segment}`}
          className="overflow-hidden rounded-lg border border-gray-200" data-testid="ltv-table-block">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-4 py-3">
            <h3 className="break-all text-sm font-semibold text-gray-900">
              <span className="mr-2 text-xs font-normal text-gray-500">{splitLabel}</span>
              {segment}
            </h3>
            <span className="text-xs text-gray-500">{rows.length}か月</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" aria-label={`${segment}の月別LTV`}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-left font-medium">初回購入月</th>
                  {["件数", "LTV95", "LTV180", "LTV365"].map((label) => (
                    <th key={label} scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-medium">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.label} className="border-t border-gray-100 odd:bg-white even:bg-gray-50">
                    <th scope="row" className="whitespace-nowrap px-4 py-2 text-left font-normal text-gray-900">{item.label}</th>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(item.count)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{yen(item.ltv95)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{yen(item.ltv180)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{yen(item.ltv365)}</td>
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
