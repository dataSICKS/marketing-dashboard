import { useState } from "react";
import { useGetEfoData, useSyncEfo } from "@workspace/api-client-react";
import type { GetEfoDataGroupBy, EfoMetrics, EfoExitScenarioCount } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent } from "@/lib/format";
import { RefreshCw, MousePointerClick, CheckCircle, TrendingUp } from "lucide-react";

type GroupBy = GetEfoDataGroupBy;

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";

const GROUP_TABS: { value: GroupBy; label: string }[] = [
  { value: "day", label: "日別" },
  { value: "week", label: "週別" },
  { value: "month", label: "月別" },
];

const FUNNEL_LABELS: Record<string, string> = {
  start: "開始",
  greeting: "挨拶",
  name: "名前入力",
  contact: "連絡先",
  address: "住所",
  product: "商品選択",
  payment: "決済",
  confirm_preview: "確認画面",
  submission: "送信完了",
};

// ─── KPI Card ─────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ElementType; accent?: boolean }) {
  return (
    <div className="rounded-xl p-5 flex flex-col gap-2" style={{ background: "#fff", border: "1px solid #F0F0F0" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "#9CA3AF" }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: accent ? YELLOW_LIGHT : "#F9FAFB" }}>
          <Icon size={14} color={accent ? "#D97706" : "#9CA3AF"} />
        </div>
      </div>
      <span className="text-2xl font-bold" style={{ color: "#1A1A1A" }}>{value}</span>
    </div>
  );
}

// ─── Trend Chart ──────────────────────────────────────────────────
function TrendChart({ items }: { items: EfoMetrics[] }) {
  const data = items.map((item) => ({
    label: item.label,
    accessCount: item.accessCount,
    cvCount: item.cvCount,
    cvr: parseFloat((item.cvr * 100).toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="count" orientation="left" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} unit="%" />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12 }}
          formatter={(value: number, name: string) => {
            if (name === "cvr") return [`${value}%`, "CVR"];
            if (name === "accessCount") return [formatNumber(value), "起動数"];
            if (name === "cvCount") return [formatNumber(value), "CV数"];
            return [value, name];
          }}
        />
        <Bar yAxisId="count" dataKey="accessCount" fill="#E5E7EB" radius={[3, 3, 0, 0]} maxBarSize={40} name="accessCount" />
        <Bar yAxisId="count" dataKey="cvCount" fill={YELLOW} radius={[3, 3, 0, 0]} maxBarSize={40} name="cvCount" />
        <Line yAxisId="rate" type="monotone" dataKey="cvr" stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: "#6366F1" }} name="cvr" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── Arrival Funnel Chart ─────────────────────────────────────────
const FUNNEL_ORDER = ["start", "greeting", "name", "contact", "address", "product", "payment", "confirm_preview", "submission"];

function ArrivalFunnelChart({ scenarios }: { scenarios: EfoExitScenarioCount[] }) {
  if (scenarios.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm" style={{ color: "#bbb" }}>データがありません</div>;
  }

  // exitMap: scenario → 離脱（or完了）セッション数
  const exitMap = new Map<string, number>(scenarios.map((s) => [s.scenario, s.count]));

  // 到達数 = そのステップ以降（そのステップ含む）の離脱数の合計
  // ファネル順に後ろから累積
  const orderedSteps = FUNNEL_ORDER.filter((s) => exitMap.has(s));
  let cumulative = 0;
  const arrivals: { raw: string; name: string; arrival: number }[] = [];
  for (let i = orderedSteps.length - 1; i >= 0; i--) {
    const step = orderedSteps[i];
    cumulative += exitMap.get(step) ?? 0;
    arrivals.unshift({ raw: step, name: FUNNEL_LABELS[step] ?? step, arrival: cumulative });
  }

  const totalArrival = arrivals[0]?.arrival ?? 1;

  return (
    <div className="space-y-2.5">
      {arrivals.map((d) => {
        const pct = totalArrival > 0 ? (d.arrival / totalArrival) * 100 : 0;
        const isGoal = d.raw === "submission";
        return (
          <div key={d.raw} className="flex items-center gap-3">
            <span className="text-xs font-medium w-20 text-right shrink-0" style={{ color: "#6B7280" }}>{d.name}</span>
            <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: isGoal ? "#10B981" : `hsl(${40 + (1 - pct / 100) * 200}, 90%, 60%)`,
                }}
              />
            </div>
            <span className="text-xs font-semibold w-20 shrink-0 text-right" style={{ color: "#374151" }}>
              {formatNumber(d.arrival)}<span className="font-normal ml-1" style={{ color: "#9CA3AF" }}>({pct.toFixed(1)}%)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function EfoPage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useGetEfoData({ groupBy });
  const { mutate: syncEfo, isPending: isSyncing } = useSyncEfo({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["/api/efo/data"] });
      },
    },
  });

  const summary = data?.summary;
  const items = data?.items ?? [];
  const exitScenarios = data?.exitScenarios ?? [];
  const lastSyncedAt = data?.lastSyncedAt;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ background: "#F8F8F8" }}>
      {/* Header */}
      <div className="px-6 py-4 shrink-0" style={{ borderBottom: "1px solid #EBEBEB", background: "#fff" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold" style={{ color: "#1A1A1A" }}>EFO CVRレポート</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              フォーム起動数・CV・CVR・離脱シナリオの分析
              {lastSyncedAt && <> ・最終更新: {new Date(lastSyncedAt).toLocaleString("ja-JP")}</>}
            </p>
          </div>
          <button
            onClick={() => syncEfo(undefined)}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "#1A1A1A", color: "#fff", opacity: isSyncing ? 0.6 : 1 }}
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
            スプレッドシートから更新
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-5">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          ) : (
            <>
              <KpiCard label="起動数（合計）" value={formatNumber(summary?.accessCount ?? 0)} icon={MousePointerClick} />
              <KpiCard label="CV数（合計）" value={formatNumber(summary?.cvCount ?? 0)} icon={CheckCircle} />
              <KpiCard
                label="CVR"
                value={formatPercent(summary?.cvr ?? 0)}
                icon={TrendingUp}
                accent
              />
            </>
          )}
        </div>

        {/* Trend Chart */}
        <div className="rounded-xl p-5" style={{ background: "#fff", border: "1px solid #F0F0F0" }}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold" style={{ color: "#374151" }}>トレンド（起動数・CV数・CVR）</h2>
            <div className="flex gap-1">
              {GROUP_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setGroupBy(tab.value)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={groupBy === tab.value
                    ? { background: "#1A1A1A", color: "#fff" }
                    : { background: "#F3F4F6", color: "#6B7280" }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <Skeleton className="h-60 w-full rounded-lg" />
          ) : error ? (
            <div className="h-60 flex items-center justify-center text-sm" style={{ color: "#EF4444" }}>
              データ取得に失敗しました
            </div>
          ) : items.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-sm" style={{ color: "#bbb" }}>
              データがありません
            </div>
          ) : (
            <TrendChart items={items} />
          )}
        </div>

        {/* Exit Scenario Chart */}
        <div className="rounded-xl p-5" style={{ background: "#fff", border: "1px solid #F0F0F0" }}>
          <h2 className="text-sm font-semibold mb-5" style={{ color: "#374151" }}>
            ステップ別到達数
            <span className="ml-2 text-xs font-normal" style={{ color: "#9CA3AF" }}>（各ステップに到達したセッション数の推移）</span>
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 rounded-full" />)}
            </div>
          ) : (
            <ArrivalFunnelChart scenarios={exitScenarios} />
          )}
        </div>

        {/* Data Table */}
        {!isLoading && items.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid #F0F0F0" }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: "#F0F0F0" }}>
              <h2 className="text-sm font-semibold" style={{ color: "#374151" }}>詳細データ</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                    {["ラベル", "起動数", "CV数", "CVR"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#9CA3AF" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={`${item.label}-${i}`} className="hover:bg-[#FAFAFA] transition-colors" style={{ borderBottom: "1px solid #F9FAFB" }}>
                      <td className="px-5 py-3 font-medium" style={{ color: "#6B7280" }}>{item.label}</td>
                      <td className="px-5 py-3" style={{ color: "#374151" }}>{formatNumber(item.accessCount)}</td>
                      <td className="px-5 py-3" style={{ color: "#374151" }}>{formatNumber(item.cvCount)}</td>
                      <td className="px-5 py-3 font-semibold" style={{ color: item.cvr > 0.1 ? "#10B981" : "#374151" }}>
                        {formatPercent(item.cvr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
