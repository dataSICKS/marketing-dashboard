import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { LtvOptoutMonthBucket, LtvOptoutMailBucket } from "@workspace/api-client-react";
import { formatNumber, formatPercent } from "@/lib/format";

const BAR = "#61A9BD";
const BAR_UNKNOWN = "#979797";

interface Point { label: string; fullLabel: string; count: number; share: number; unknown: boolean }

function DistTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-[280px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm" style={{ overflowWrap: "anywhere" }}>
      <div className="font-semibold text-gray-800">{p.fullLabel}</div>
      <div className="mt-1 tabular-nums text-gray-600">{formatNumber(p.count)} 人（解除顧客の {formatPercent(p.share)}）</div>
    </div>
  );
}

function CountChart({ data, testId }: { data: Point[]; testId: string }) {
  return (
    <div style={{ height: 260 }} data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%" debounce={0}>
        <BarChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="label" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd"
            tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 10)}…` : v)} />
          <YAxis domain={[0, "auto"]} allowDecimals={false} stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} width={44}
            tickFormatter={(v) => formatNumber(v as number)} />
          <Tooltip content={<DistTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} isAnimationActive={false} />
          <Bar dataKey="count" name="顧客数" maxBarSize={36} radius={[3, 3, 0, 0]} isAnimationActive={false}
            shape={(props: unknown) => {
              const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: Point };
              return <rect x={x} y={y} width={width} height={Math.max(0, height)} rx={3} fill={payload.unknown ? BAR_UNKNOWN : BAR} />;
            }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthDistributionChart({ buckets }: { buckets: LtvOptoutMonthBucket[] }) {
  const data: Point[] = [...buckets].sort((a, b) => a.monthIndex - b.monthIndex).map((b) => ({
    label: `${b.monthIndex}ヶ月目`, fullLabel: `初回購入から${b.monthIndex}ヶ月目（初回購入月＝1）`,
    count: b.count, share: b.share, unknown: false,
  }));
  return <CountChart data={data} testId="chart-month-distribution" />;
}

export function MailDistributionChart({ buckets }: { buckets: LtvOptoutMailBucket[] }) {
  const data: Point[] = buckets.map((b) => ({
    label: b.observedCount == null ? "判定不可" : b.label,
    fullLabel: b.observedCount == null ? `${b.label}（前日までの記録なし・0通とは限りません）` : `${b.label}（前日までに記録された配信完了数）`,
    count: b.count, share: b.share, unknown: b.observedCount == null,
  }));
  return <CountChart data={data} testId="chart-mail-distribution" />;
}
