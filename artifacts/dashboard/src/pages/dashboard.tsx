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
import { RefreshCw } from "lucide-react";

type GroupBy = GetNewsletterDataGroupBy;
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
  const BAR_MAX = items.length > 0 ? Math.max(...items.map((d) => d.deliveryCount)) : 1;

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter','Noto Sans JP',sans-serif" }}>

      {/* ── Sidebar ── */}
      <aside
        className="w-52 shrink-0 flex flex-col"
        style={{ background: "#0a0a0a" }}
        data-testid="sidebar"
      >
        {/* Logo */}
        <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded" style={{ background: "#ffffff" }} />
            <span className="text-sm font-semibold text-white tracking-tight">Analytics</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 p-3 flex-1">
          <div
            className="text-[10px] font-medium px-2 py-2"
            style={{ color: "rgba(255,255,255,0.22)", letterSpacing: "0.12em" }}
          >
            MAIN MENU
          </div>
          {[
            { label: "レポート", active: true },
            { label: "シナリオ", active: false },
            { label: "設定", active: false },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer"
              style={
                item.active
                  ? { background: "rgba(255,255,255,0.1)", color: "#ffffff", fontWeight: 500 }
                  : { color: "rgba(255,255,255,0.38)" }
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: item.active ? "#ffffff" : "rgba(255,255,255,0.2)" }}
              />
              {item.label}
            </div>
          ))}
        </nav>

        {/* Sync */}
        <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button
            onClick={() => syncMutation.mutate(undefined)}
            disabled={syncMutation.isPending}
            className="w-full py-2.5 rounded-lg text-xs font-semibold tracking-wide flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-60"
            style={{ background: "#ffffff", color: "#0a0a0a" }}
            data-testid="button-sync"
          >
            <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            更新
          </button>
          <div
            className="text-[10px] text-center mt-2"
            style={{ color: "rgba(255,255,255,0.2)" }}
            data-testid="text-last-sync"
          >
            最終更新 {formatDate(lastSyncedAt)}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col overflow-auto" style={{ background: "#f8f8f8" }}>

        {/* Top bar */}
        <div
          className="px-8 py-5 flex items-center justify-between bg-white"
          style={{ borderBottom: "1px solid #ebebeb" }}
        >
          <div>
            <div
              className="text-xs font-medium mb-0.5"
              style={{ color: "#999", letterSpacing: "0.06em" }}
            >
              メルマガ ·{" "}
              {GROUP_TABS.find((t) => t.value === groupBy)?.label}表示
            </div>
            <h1
              className="text-xl font-bold tracking-tight"
              style={{ color: "#0a0a0a" }}
              data-testid="heading-title"
            >
              パフォーマンスレポート
            </h1>
          </div>

          {/* Tabs */}
          <div
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ background: "#f0f0f0" }}
            data-testid="tabs-groupby"
          >
            {GROUP_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setGroupBy(tab.value)}
                className="px-3.5 py-1.5 rounded-md text-xs font-medium transition-all"
                style={
                  groupBy === tab.value
                    ? { background: "#0a0a0a", color: "#fff" }
                    : { color: "#888" }
                }
                data-testid={`tab-${tab.value}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 flex flex-col gap-5">
          {isLoading ? (
            <LoadingSkeleton />
          ) : isError ? (
            <ErrorState onRetry={() => queryClient.invalidateQueries()} />
          ) : (
            <>
              {/* KPI strip */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: "配信数", value: formatNumber(summary?.deliveryCount), sub: "通", accent: true, testId: "kpi-delivery" },
                  { label: "開封率", value: formatPercent(summary?.openRate), sub: "平均", accent: false, testId: "kpi-open-rate" },
                  { label: "クリック率", value: formatPercent(summary?.clickRate), sub: "平均", accent: false, testId: "kpi-click-rate" },
                  { label: "CVR", value: formatPercent(summary?.cvr), sub: "平均", accent: false, testId: "kpi-cvr" },
                  { label: "CV数", value: formatNumber(summary?.cvCount), sub: "件", accent: false, testId: "kpi-cv-count" },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl p-5 bg-white"
                    style={{
                      border: kpi.accent ? "1.5px solid #0a0a0a" : "1px solid #ebebeb",
                      boxShadow: kpi.accent
                        ? "0 2px 8px rgba(0,0,0,0.08)"
                        : "0 1px 3px rgba(0,0,0,0.04)",
                    }}
                    data-testid={kpi.testId}
                  >
                    <div className="text-xs font-medium mb-3" style={{ color: "#999" }}>
                      {kpi.label}
                    </div>
                    <div className="text-2xl font-bold tracking-tight" style={{ color: "#0a0a0a" }}>
                      {kpi.value}
                    </div>
                    <div
                      className="text-xs mt-1.5 font-medium"
                      style={{ color: kpi.accent ? "#555" : "#bbb" }}
                    >
                      {kpi.sub}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div
                className="rounded-xl bg-white p-6"
                style={{ border: "1px solid #ebebeb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                data-testid="card-chart"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold" style={{ color: "#0a0a0a" }}>
                    配信トレンド
                  </span>
                  <div className="flex items-center gap-4">
                    {[
                      { label: "配信数", color: "#0a0a0a" },
                      { label: "開封率", color: "#888" },
                      { label: "クリック率", color: "#ccc" },
                    ].map((l) => (
                      <div
                        key={l.label}
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: "#999" }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: l.color }}
                        />
                        {l.label}
                      </div>
                    ))}
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm" style={{ color: "#bbb" }}>
                    データがありません
                  </div>
                ) : (
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={items} margin={{ top: 4, right: 8, left: 0, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#ccc"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#ccc"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => formatNumber(v)}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#ccc"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => formatPercent(v)}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#fff",
                            border: "1px solid #ebebeb",
                            borderRadius: "10px",
                            fontSize: 12,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                          }}
                          formatter={(value: number, name: string) =>
                            name === "配信数"
                              ? [formatNumber(value), name]
                              : [formatPercent(value), name]
                          }
                        />
                        <Bar
                          yAxisId="left"
                          dataKey="deliveryCount"
                          name="配信数"
                          fill="#0a0a0a"
                          radius={[3, 3, 0, 0]}
                          maxBarSize={40}
                          opacity={0.85}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="openRate"
                          name="開封率"
                          stroke="#888"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="clickRate"
                          name="クリック率"
                          stroke="#ccc"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Table */}
              <div
                className="rounded-xl bg-white overflow-hidden"
                style={{ border: "1px solid #ebebeb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
                data-testid="card-table"
              >
                <div
                  className="px-6 py-4 flex items-center justify-between"
                  style={{ borderBottom: "1px solid #f0f0f0" }}
                >
                  <span className="text-sm font-bold" style={{ color: "#0a0a0a" }}>
                    詳細データ
                  </span>
                  <span className="text-xs" style={{ color: "#bbb" }}>
                    {items.length} 件
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow style={{ borderBottom: "1px solid #f0f0f0" }} className="hover:bg-transparent">
                        {["ラベル", "配信数", "開封数（率）", "クリック数（率）", "CV数（CVR）"].map((h) => (
                          <TableHead
                            key={h}
                            className="text-xs font-semibold"
                            style={{ color: "#bbb", letterSpacing: "0.04em" }}
                          >
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-10 text-sm"
                            style={{ color: "#bbb" }}
                          >
                            データがありません
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((item, i) => (
                          <TableRow
                            key={`${item.label}-${i}`}
                            style={{ borderBottom: "1px solid #f8f8f8" }}
                            className="hover:bg-gray-50 transition-colors"
                            data-testid={`table-row-${i}`}
                          >
                            <TableCell className="font-medium text-sm" style={{ color: "#666" }}>
                              {item.label}
                            </TableCell>
                            <TableCell
                              className="text-sm font-semibold"
                              style={{ color: "#0a0a0a" }}
                            >
                              {formatNumber(item.deliveryCount)}
                            </TableCell>
                            <TableCell className="text-sm" style={{ color: "#444" }}>
                              {formatNumber(item.openCount)}{" "}
                              <span className="text-xs" style={{ color: "#bbb" }}>
                                ({formatPercent(item.openRate)})
                              </span>
                            </TableCell>
                            <TableCell className="text-sm" style={{ color: "#444" }}>
                              {formatNumber(item.clickCount)}{" "}
                              <span className="text-xs" style={{ color: "#bbb" }}>
                                ({formatPercent(item.clickRate)})
                              </span>
                            </TableCell>
                            <TableCell className="text-sm font-semibold" style={{ color: "#0a0a0a" }}>
                              {formatNumber(item.cvCount)}{" "}
                              <span className="text-xs font-normal" style={{ color: "#bbb" }}>
                                ({formatPercent(item.cvr)})
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
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

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5" data-testid="loading-skeleton">
      <div className="grid grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" style={{ background: "#ebebeb" }} />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" style={{ background: "#ebebeb" }} />
      <Skeleton className="h-64 rounded-xl" style={{ background: "#ebebeb" }} />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center p-12 rounded-xl"
      style={{ border: "1px solid #fee2e2", background: "#fef2f2" }}
      data-testid="error-state"
    >
      <p className="text-sm font-medium mb-4" style={{ color: "#ef4444" }}>
        データの取得に失敗しました
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
        style={{ background: "#0a0a0a", color: "#fff" }}
      >
        再試行
      </button>
    </div>
  );
}
