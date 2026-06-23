import { useState } from "react";
import {
  useGetNewsletterData,
  useSyncNewsletter,
  getGetNewsletterDataQueryKey,
} from "@workspace/api-client-react";
import type { GetNewsletterDataGroupBy } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import {
  RefreshCw,
  LayoutDashboard,
  Mail,
  BarChart2,
  Settings,
  LogOut,
  ChevronLeft,
  Calendar,
} from "lucide-react";

type GroupBy = GetNewsletterDataGroupBy;

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "ホーム", active: false },
  { icon: Mail, label: "メルマガ分析", active: true },
  { icon: BarChart2, label: "シナリオ分析", active: false },
  { icon: Settings, label: "設定", active: false },
];

const GROUP_TABS: { value: GroupBy; label: string }[] = [
  { value: "day", label: "日別" },
  { value: "week", label: "週別" },
  { value: "month", label: "月別" },
  { value: "scenario", label: "シナリオ別" },
];

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<GroupBy>("day");

  const { data, isLoading, isError } = useGetNewsletterData(
    { groupBy },
    { query: { enabled: true, queryKey: getGetNewsletterDataQueryKey({ groupBy }) } }
  );

  const syncMutation = useSyncNewsletter({
    mutation: {
      onSuccess: () => {
        (["day", "week", "month", "scenario"] as GroupBy[]).forEach((g) =>
          queryClient.invalidateQueries({ queryKey: getGetNewsletterDataQueryKey({ groupBy: g }) })
        );
      },
    },
  });

  const summary = data?.summary;
  const items = data?.items ?? [];
  const lastSyncedAt = data?.lastSyncedAt;

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter','Noto Sans JP',sans-serif", background: "#F7F8FA" }}>

      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 flex flex-col bg-white" style={{ borderRight: "1px solid #EBEBEB" }}>
        {/* Logo */}
        <div className="px-5 h-14 flex items-center justify-between" style={{ borderBottom: "1px solid #EBEBEB" }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: YELLOW }}>
              <BarChart2 size={14} color="#fff" />
            </div>
            <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>Mail Analytics</span>
          </div>
          <ChevronLeft size={15} color="#BBBBBB" />
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-0.5">
          <div className="px-3 py-2 text-[10px] font-semibold" style={{ color: "#BBBBBB", letterSpacing: "0.1em" }}>
            分析
          </div>
          {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm"
              style={active
                ? { background: YELLOW_LIGHT, color: YELLOW_DARK, fontWeight: 600 }
                : { color: "#6B7280" }}
            >
              <Icon size={16} color={active ? YELLOW_DARK : "#9CA3AF"} />
              {label}
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-3" style={{ borderTop: "1px solid #EBEBEB" }}>
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm"
            style={{ color: "#9CA3AF" }}
          >
            <LogOut size={16} color="#9CA3AF" />
            ログアウト
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div
          className="bg-white px-8 h-14 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid #EBEBEB" }}
        >
          <div>
            <div className="text-xs" style={{ color: "#9CA3AF" }}>メルマガ · 配信分析</div>
            <div className="text-base font-bold leading-tight" style={{ color: "#1A1A1A" }} data-testid="heading-title">
              メルマガレポート
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Date badge */}
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ border: "1px solid #EBEBEB", color: "#6B7280", background: "#FAFAFA" }}
            >
              <Calendar size={13} color="#9CA3AF" />
              <span data-testid="text-last-sync">最終更新: {formatDate(lastSyncedAt)}</span>
            </div>
            {/* Sync button */}
            <button
              onClick={() => syncMutation.mutate(undefined)}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
              style={{ background: YELLOW, color: "#fff", boxShadow: `0 1px 4px ${YELLOW}66` }}
              data-testid="button-sync"
            >
              <RefreshCw size={12} className={syncMutation.isPending ? "animate-spin" : ""} />
              スプレッドシートから更新
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 px-8 py-6 flex flex-col gap-5">

          {/* Horizontal tabs */}
          <div className="flex items-center gap-0" style={{ borderBottom: "1px solid #EBEBEB" }}>
            {GROUP_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setGroupBy(tab.value)}
                className="px-4 py-2.5 text-sm font-medium transition-all relative"
                style={{ color: groupBy === tab.value ? YELLOW_DARK : "#9CA3AF" }}
                data-testid={`tab-${tab.value}`}
              >
                {tab.label}
                {groupBy === tab.value && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ background: YELLOW }}
                  />
                )}
              </button>
            ))}
          </div>

          {isLoading ? (
            <LoadingSkeleton />
          ) : isError ? (
            <ErrorState onRetry={() => queryClient.invalidateQueries()} />
          ) : (
            <>
              {/* KPI cards — 3 wide like reference */}
              <div className="grid grid-cols-3 gap-4" data-testid="kpi-grid">
                <KpiCard
                  label="配信数"
                  value={formatNumber(summary?.deliveryCount)}
                  sub="通"
                  testId="kpi-delivery"
                  accent
                />
                <KpiCard
                  label="開封率 / クリック率"
                  value={formatPercent(summary?.openRate)}
                  sub2={`クリック ${formatPercent(summary?.clickRate)}`}
                  testId="kpi-open-rate"
                />
                <KpiCard
                  label="CV数 / CVR"
                  value={formatNumber(summary?.cvCount)}
                  sub="件"
                  sub2={`CVR ${formatPercent(summary?.cvr)}`}
                  testId="kpi-cv-count"
                />
              </div>

              {/* Chart */}
              <div
                className="bg-white rounded-xl p-6"
                style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                data-testid="card-chart"
              >
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="text-sm font-bold" style={{ color: "#1A1A1A" }}>配信トレンド</div>
                    <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                      棒：配信数　折れ線：開封率 / クリック率
                    </div>
                  </div>
                  {/* mini period tabs */}
                  <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: "#F3F4F6" }}>
                    {(["日別", "週別", "月別"] as const).map((t, i) => (
                      <span key={t} className="px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer"
                        style={i === (groupBy === "day" ? 0 : groupBy === "week" ? 1 : 2)
                          ? { background: "#fff", color: "#1A1A1A", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
                          : { color: "#9CA3AF" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="h-52 flex items-center justify-center text-sm" style={{ color: "#bbb" }}>
                    データがありません
                  </div>
                ) : (
                  <>
                    <div style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={items} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                          <XAxis dataKey="label" stroke="#D1D5DB" fontSize={11} tickLine={false} axisLine={false} tickMargin={6} />
                          <YAxis yAxisId="left" stroke="#D1D5DB" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatNumber} />
                          <YAxis yAxisId="right" orientation="right" stroke="#D1D5DB" fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatPercent} />
                          <Tooltip
                            contentStyle={{ background: "#fff", border: "1px solid #EBEBEB", borderRadius: "10px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                            formatter={(value: number, name: string) =>
                              name === "配信数" ? [formatNumber(value), name] : [formatPercent(value), name]
                            }
                          />
                          <Bar yAxisId="left" dataKey="deliveryCount" name="配信数" fill={YELLOW} radius={[4, 4, 0, 0]} maxBarSize={32} opacity={0.9} />
                          <Line yAxisId="right" type="monotone" dataKey="openRate" name="開封率" stroke="#60A5FA" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          <Line yAxisId="right" type="monotone" dataKey="clickRate" name="クリック率" stroke="#34D399" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Legend */}
                    <div className="flex items-center gap-6 mt-3 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                      {[
                        { color: YELLOW, label: "配信数" },
                        { color: "#60A5FA", label: "開封率" },
                        { color: "#34D399", label: "クリック率" },
                      ].map((l) => (
                        <div key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                          {l.label}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Table */}
              <div
                className="bg-white rounded-xl overflow-hidden"
                style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                data-testid="card-table"
              >
                <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>詳細データ</span>
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>{items.length} 件</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent" style={{ borderBottom: "1px solid #F3F4F6" }}>
                        {["ラベル", "配信数", "開封数（率）", "クリック数（率）", "CV数（CVR）"].map((h) => (
                          <TableHead key={h} className="text-xs font-semibold" style={{ color: "#9CA3AF" }}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-10 text-sm" style={{ color: "#bbb" }}>データがありません</TableCell>
                        </TableRow>
                      ) : items.map((item, i) => (
                        <TableRow key={`${item.label}-${i}`} className="hover:bg-[#FAFAFA] transition-colors" style={{ borderBottom: "1px solid #F9FAFB" }} data-testid={`table-row-${i}`}>
                          <TableCell className="text-sm font-medium" style={{ color: "#6B7280" }}>{item.label}</TableCell>
                          <TableCell className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>{formatNumber(item.deliveryCount)}</TableCell>
                          <TableCell className="text-sm" style={{ color: "#374151" }}>
                            {formatNumber(item.openCount)}<span className="text-xs ml-1.5" style={{ color: "#9CA3AF" }}>({formatPercent(item.openRate)})</span>
                          </TableCell>
                          <TableCell className="text-sm" style={{ color: "#374151" }}>
                            {formatNumber(item.clickCount)}<span className="text-xs ml-1.5" style={{ color: "#9CA3AF" }}>({formatPercent(item.clickRate)})</span>
                          </TableCell>
                          <TableCell className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                            {formatNumber(item.cvCount)}<span className="text-xs ml-1.5 font-normal" style={{ color: "#9CA3AF" }}>({formatPercent(item.cvr)})</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function KpiCard({
  label, value, sub, sub2, accent, testId,
}: {
  label: string; value: string; sub?: string; sub2?: string; accent?: boolean; testId: string;
}) {
  return (
    <div
      className="bg-white rounded-xl px-6 py-5"
      style={{
        border: accent ? `1.5px solid ${YELLOW}` : "1px solid #EBEBEB",
        boxShadow: accent ? `0 2px 12px ${YELLOW}33` : "0 1px 4px rgba(0,0,0,0.04)",
      }}
      data-testid={testId}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: "#9CA3AF" }}>{label}</span>
        {accent && (
          <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: YELLOW_LIGHT }}>
            <Mail size={12} color={YELLOW_DARK} />
          </span>
        )}
      </div>
      <div className="text-3xl font-bold tracking-tight" style={{ color: "#1A1A1A" }}>{value}</div>
      {sub && <div className="text-xs mt-1.5 font-medium" style={{ color: accent ? YELLOW_DARK : "#9CA3AF" }}>{sub}</div>}
      {sub2 && <div className="text-xs mt-1" style={{ color: "#6B7280" }}>{sub2}</div>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5" data-testid="loading-skeleton">
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" style={{ background: "#EBEBEB" }} />)}
      </div>
      <Skeleton className="h-72 rounded-xl" style={{ background: "#EBEBEB" }} />
      <Skeleton className="h-64 rounded-xl" style={{ background: "#EBEBEB" }} />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 rounded-xl"
      style={{ border: "1px solid #FEE2E2", background: "#FEF2F2" }} data-testid="error-state">
      <p className="text-sm font-medium mb-4" style={{ color: "#EF4444" }}>データの取得に失敗しました</p>
      <button onClick={onRetry} className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: "#1A1A1A" }}>再試行</button>
    </div>
  );
}
