import { useMemo } from "react";
import type { LtvProductRatioMonth, LtvProductRatios } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { buildProductRatioChart, type ProductRatioItemsKey } from "@/lib/ltv-product-ratio-chart";
import { formatNumber } from "@/lib/format";

const COLORS = ["#61A9BD", "#CED14E", "#DD83C9", "#1F74AD", "#E98E2E", "#9267C6", "#8D6C5B", "#979797"];
const monthLabel = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default function LtvProductRatioChart({ months, data, itemKey, isAll, isMonthly }: {
  months: LtvProductRatioMonth[] | undefined;
  data: LtvProductRatios | undefined;
  itemKey: ProductRatioItemsKey;
  isAll: boolean;
  isMonthly: boolean;
}) {
  const chart = useMemo(() => buildProductRatioChart(
    isMonthly ? months ?? [] : data ? [{ month: "期間合算", productRatios: data }] : [],
    itemKey, isAll, isMonthly,
  ), [months, data, itemKey, isAll, isMonthly]);
  if ((isMonthly && !months) || (!isMonthly && !data)) {
    return <p role="alert" className="p-4 text-xs text-red-500">購入比率グラフのデータを取得できませんでした。</p>;
  }
  if (!chart.points.length || !chart.series.length) {
    return <p className="p-6 text-center text-xs text-gray-400">グラフに表示できる購入記録がありません。</p>;
  }
  const timestamps = chart.points.map((point) => Number(point.timestamp));
  const domain = [Math.min(...timestamps) - 15 * 86400000, Math.max(...timestamps) + 15 * 86400000];
  return (
    <section className="border-t border-gray-100 px-4 py-4 md:px-6" aria-label="商品購入比率のグラフ" data-testid="product-ratio-chart">
      <h3 className="text-sm font-semibold text-gray-900">{isMonthly ? "初回購入月別の購入比率" : "指定期間全体の購入比率"}</h3>
      <p className="mt-1 text-[11px] text-gray-500">100％積み上げ棒グラフ。{isMonthly ? "各月" : "選択期間"}の購入記録件数を分母に計算しています。棒にカーソルを合わせると件数・比率を確認できます。</p>
      {chart.series.some((part) => part.other) && <p className="mt-1 text-[11px] text-gray-500">選択期間の件数上位7区分を表示し、残りは「その他」に合算しています。表では全区分を確認できます。</p>}
      {chart.excludedUndatedCount > 0 && <p className="mt-1 text-[11px] text-amber-700">初回購入月が不明の{formatNumber(chart.excludedUndatedCount)}件はグラフ対象外です（表には含みます）。</p>}
      <div className="mt-4 overflow-x-auto" role="region" aria-label="購入比率グラフ（横スクロール可能）" tabIndex={0}>
        <div style={{ height: 300, minWidth: isMonthly ? Math.max(580, chart.points.length * 44) : 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart.points} margin={{ top: 8, right: 20, bottom: 8, left: 0 }} barSize={isMonthly ? 26 : 100}>
              <XAxis dataKey={isMonthly ? "timestamp" : "label"} type={isMonthly ? "number" : "category"}
                scale={isMonthly ? "time" : "auto"} domain={isMonthly ? domain : undefined}
                ticks={isMonthly ? timestamps : undefined} tickFormatter={isMonthly ? monthLabel : undefined}
                tickLine={false} axisLine={false} fontSize={10} minTickGap={15} />
              <YAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} fontSize={10} width={44} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as Record<string, number | string>;
                return (
                  <div className="max-w-[340px] rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg">
                    <p className="mb-2 font-semibold">{point.label} · 計{formatNumber(Number(point.total))}件</p>
                    {chart.series.map((part, index) => (
                      <div key={part.key} className="mt-1 flex items-start gap-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-sm" style={{ background: COLORS[index] }} />
                        <span className="min-w-0 flex-1 break-words">{part.label}</span>
                        <span className="whitespace-nowrap tabular-nums">{formatNumber(Number(point[`count_${part.key}`]))}件 / {Number(point[part.key]).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                );
              }} />
              {chart.series.map((part, index) => (
                <Bar key={part.key} dataKey={part.key} name={part.label} stackId="composition" fill={COLORS[index]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-gray-600" aria-label="購入比率の凡例">
        {chart.series.map((part, index) => (
          <span key={part.key} className="inline-flex max-w-full items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COLORS[index] }} />
            <span className="break-words">{part.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
