import { useState } from "react";
import {
  useGetNewsletterData,
  useSyncNewsletter,
  getGetNewsletterDataQueryKey,
} from "@workspace/api-client-react";
import type {
  GetNewsletterDataGroupBy,
  NewsletterMetrics,
  NewsletterSegmentGroup,
} from "@workspace/api-client-react";
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
  Menu,
  X,
  TrendingUp,
  TrendingDown,
  ChevronDown,
} from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/DateRangePicker";

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
  { value: "template", label: "テンプレ別" },
];

// ─── Diff badge ──────────────────────────────────────────────────
function DiffBadge({ current, prev }: { current: number; prev: number | null | undefined }) {
  if (prev == null || prev === 0) return null;
  const diff = current - prev;
  const pct = diff / Math.abs(prev);
  const isUp = diff >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded ml-1.5"
      style={{ background: isUp ? "#DCFCE7" : "#FEE2E2", color: isUp ? "#16A34A" : "#DC2626" }}
    >
      {isUp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {isUp ? "+" : ""}{(pct * 100).toFixed(1)}%
    </span>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────
function SidebarContent({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-white" style={{ borderRight: "1px solid #EBEBEB" }}>
      <div className="px-5 h-14 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #EBEBEB" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: YELLOW }}>
            <BarChart2 size={14} color="#fff" />
          </div>
          <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>Mail Analytics</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-lg" style={{ color: "#9CA3AF" }}>
            <X size={18} />
          </button>
        )}
      </div>
      <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-semibold" style={{ color: "#BBBBBB", letterSpacing: "0.1em" }}>分析</div>
        {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm"
            style={active ? { background: YELLOW_LIGHT, color: YELLOW_DARK, fontWeight: 600 } : { color: "#6B7280" }}
            onClick={onClose}
          >
            <Icon size={16} color={active ? YELLOW_DARK : "#9CA3AF"} />
            {label}
          </div>
        ))}
      </nav>
      <div className="p-3 shrink-0" style={{ borderTop: "1px solid #EBEBEB" }}>
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer text-sm" style={{ color: "#9CA3AF" }}>
          <LogOut size={16} color="#9CA3AF" />
          ログアウト
        </div>
      </div>
    </div>
  );
}

// ─── Metrics table ────────────────────────────────────────────────
function MetricsTable({
  items, groupBy, showComparison,
}: {
  items: NewsletterMetrics[];
  groupBy: GroupBy;
  showComparison: boolean;
}) {
  const showSubject = groupBy === "template" || groupBy === "day";
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <TableHead className="text-xs font-semibold whitespace-nowrap" style={{ color: "#9CA3AF" }}>ラベル</TableHead>
            {showSubject && <TableHead className="text-xs font-semibold whitespace-nowrap" style={{ color: "#9CA3AF" }}>件名</TableHead>}
            <TableHead className="text-xs font-semibold whitespace-nowrap" style={{ color: "#9CA3AF" }}>配信数</TableHead>
            <TableHead className="text-xs font-semibold whitespace-nowrap" style={{ color: "#9CA3AF" }}>開封数（率）</TableHead>
            <TableHead className="text-xs font-semibold whitespace-nowrap" style={{ color: "#9CA3AF" }}>クリック数（率）</TableHead>
            <TableHead className="text-xs font-semibold whitespace-nowrap" style={{ color: "#9CA3AF" }}>CV数（CVR）</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={showSubject ? 6 : 5} className="text-center py-10 text-sm" style={{ color: "#bbb" }}>
                データがありません
              </TableCell>
            </TableRow>
          ) : items.map((item, i) => (
            <TableRow
              key={`${item.label}-${i}`}
              className="hover:bg-[#FAFAFA] transition-colors"
              style={{ borderBottom: "1px solid #F9FAFB" }}
            >
              <TableCell className="text-sm font-medium whitespace-nowrap" style={{ color: "#6B7280" }}>{item.label}</TableCell>
              {showSubject && (
                <TableCell className="text-xs max-w-[220px] truncate" style={{ color: "#374151" }} title={item.subject ?? ""}>
                  {item.subject ?? "—"}
                </TableCell>
              )}
              <TableCell className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                {formatNumber(item.deliveryCount)}
                {showComparison && <DiffBadge current={item.deliveryCount} prev={item.prevDeliveryCount} />}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                {formatNumber(item.openCount)}
                <span className="text-xs ml-1" style={{ color: "#9CA3AF" }}>({formatPercent(item.openRate)})</span>
                {showComparison && <DiffBadge current={item.openRate} prev={item.prevOpenRate} />}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                {formatNumber(item.clickCount)}
                <span className="text-xs ml-1" style={{ color: "#9CA3AF" }}>({formatPercent(item.clickRate)})</span>
                {showComparison && <DiffBadge current={item.clickRate} prev={item.prevClickRate} />}
              </TableCell>
              <TableCell className="text-sm font-semibold whitespace-nowrap" style={{ color: "#1A1A1A" }}>
                {formatNumber(item.cvCount)}
                <span className="text-xs ml-1 font-normal" style={{ color: "#9CA3AF" }}>({formatPercent(item.cvr)})</span>
                {showComparison && <DiffBadge current={item.cvr} prev={item.prevCvr} />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────
export default function Dashboard() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // date range + comparison — managed by DateRangePicker
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [compareRange, setCompareRange] = useState<DateRange | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(false);

  // segment filter
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [segmentDropdownOpen, setSegmentDropdownOpen] = useState(false);

  const params = {
    groupBy,
    dateFrom: dateRange?.from,
    dateTo: dateRange?.to,
    segment: selectedSegments.length > 0 ? selectedSegments.join(",") : undefined,
    compareFrom: compareEnabled && compareRange ? compareRange.from : undefined,
    compareTo: compareEnabled && compareRange ? compareRange.to : undefined,
  };

  const { data, isLoading, isError } = useGetNewsletterData(params, {
    query: { queryKey: getGetNewsletterDataQueryKey(params) },
  });

  const syncMutation = useSyncNewsletter({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/newsletter/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/newsletter/segments"] });
      },
    },
  });

  const summary = data?.summary;
  const items = data?.items ?? [];
  const segmentGroups: NewsletterSegmentGroup[] = (data?.segmentGroups ?? []) as NewsletterSegmentGroup[];
  const lastSyncedAt = data?.lastSyncedAt;
  const availableSegments = data?.availableSegments ?? [];
  const showComparison = compareEnabled && !!compareRange;

  const handleDateApply = (range: DateRange | null, cmp: DateRange | null, cmpEnabled: boolean) => {
    setDateRange(range);
    setCompareRange(cmp);
    setCompareEnabled(cmpEnabled);
  };

  const toggleSegment = (seg: string) => {
    setSelectedSegments((prev) =>
      prev.includes(seg) ? prev.filter((s) => s !== seg) : [...prev, seg]
    );
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter','Noto Sans JP',sans-serif", background: "#F7F8FA" }}>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col" style={{ minHeight: "100vh" }}>
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setDrawerOpen(false)} />
          <div className="relative w-64 h-full z-10 shadow-xl">
            <SidebarContent onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div
          className="bg-white px-4 md:px-8 h-14 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid #EBEBEB" }}
        >
          <div className="flex items-center gap-3">
            <button className="md:hidden p-1.5 rounded-lg" style={{ color: "#6B7280" }} onClick={() => setDrawerOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <div className="hidden sm:block text-xs" style={{ color: "#9CA3AF" }}>メルマガ · 配信分析</div>
              <div className="text-sm md:text-base font-bold leading-tight" style={{ color: "#1A1A1A" }} data-testid="heading-title">
                メルマガレポート
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ border: "1px solid #EBEBEB", color: "#6B7280", background: "#FAFAFA" }}>
              <span data-testid="text-last-sync" style={{ color: "#9CA3AF", fontSize: 11 }}>
                最終更新: {formatDate(lastSyncedAt)}
              </span>
            </div>
            <button
              onClick={() => syncMutation.mutate(undefined)}
              disabled={syncMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 whitespace-nowrap"
              style={{ background: YELLOW, color: "#fff", boxShadow: `0 1px 4px ${YELLOW}66` }}
              data-testid="button-sync"
            >
              <RefreshCw size={12} className={syncMutation.isPending ? "animate-spin" : ""} />
              <span className="hidden sm:inline">スプレッドシートから更新</span>
              <span className="sm:hidden">更新</span>
            </button>
          </div>
        </div>

        <div className="flex-1 px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-5">

          {/* ── Tabs ── */}
          <div className="overflow-x-auto" style={{ borderBottom: "1px solid #EBEBEB" }}>
            <div className="flex items-center gap-0 min-w-max">
              {GROUP_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setGroupBy(tab.value)}
                  className="px-4 py-2.5 text-sm font-medium transition-all relative whitespace-nowrap"
                  style={{ color: groupBy === tab.value ? YELLOW_DARK : "#9CA3AF" }}
                  data-testid={`tab-${tab.value}`}
                >
                  {tab.label}
                  {groupBy === tab.value && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: YELLOW }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {/* GA4-style date range picker */}
            <DateRangePicker
              value={dateRange}
              compareValue={compareRange}
              compareEnabled={compareEnabled}
              onApply={handleDateApply}
            />

            {/* Segment dropdown */}
            <div className="relative">
              <button
                onClick={() => setSegmentDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                style={selectedSegments.length > 0
                  ? { background: YELLOW_LIGHT, color: YELLOW_DARK, border: `1px solid ${YELLOW}` }
                  : { background: "#fff", color: "#6B7280", border: "1px solid #EBEBEB", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
              >
                {selectedSegments.length > 0 ? `セグメント (${selectedSegments.length})` : "セグメント"}
                <ChevronDown size={13} />
              </button>
              {segmentDropdownOpen && (
                <div
                  className="absolute top-full mt-1 left-0 z-20 bg-white rounded-xl shadow-lg overflow-hidden"
                  style={{ border: "1px solid #EBEBEB", minWidth: 180 }}
                >
                  {availableSegments.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "#9CA3AF" }}>セグメントなし</div>
                  ) : availableSegments.map((seg) => (
                    <label
                      key={seg}
                      className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#FAFAFA] text-xs"
                      style={{ color: "#374151" }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSegments.includes(seg)}
                        onChange={() => toggleSegment(seg)}
                        style={{ accentColor: YELLOW }}
                      />
                      {seg}
                    </label>
                  ))}
                  {selectedSegments.length > 0 && (
                    <div style={{ borderTop: "1px solid #F3F4F6" }}>
                      <button
                        onClick={() => { setSelectedSegments([]); setSegmentDropdownOpen(false); }}
                        className="w-full px-4 py-2.5 text-xs text-left"
                        style={{ color: "#9CA3AF" }}
                      >
                        クリア
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Active filter chips */}
            {dateRange && (
              <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ background: "#F3F4F6", color: "#6B7280" }}>
                {dateRange.from} 〜 {dateRange.to}
                <button onClick={() => { setDateRange(null); setCompareRange(null); setCompareEnabled(false); }}>
                  <X size={11} color="#BBBBBB" />
                </button>
              </span>
            )}
            {showComparison && compareRange && (
              <span className="text-[11px] px-2 py-1 rounded-lg" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
                比較: {compareRange.from} 〜 {compareRange.to}
              </span>
            )}
          </div>

          {isLoading ? (
            <LoadingSkeleton />
          ) : isError ? (
            <ErrorState onRetry={() => queryClient.invalidateQueries()} />
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4" data-testid="kpi-grid">
                <KpiCard
                  label="配信数" value={formatNumber(summary?.deliveryCount)} sub="通"
                  testId="kpi-delivery" accent
                  current={summary?.deliveryCount} prev={showComparison ? summary?.prevDeliveryCount : undefined}
                />
                <KpiCard
                  label="開封率 / クリック率" value={formatPercent(summary?.openRate)}
                  sub2={`クリック ${formatPercent(summary?.clickRate)}`} testId="kpi-open-rate"
                  current={summary?.openRate} prev={showComparison ? summary?.prevOpenRate : undefined}
                />
                <KpiCard
                  label="CV数 / CVR" value={formatNumber(summary?.cvCount)} sub="件"
                  sub2={`CVR ${formatPercent(summary?.cvr)}`} testId="kpi-cv-count"
                  current={summary?.cvr} prev={showComparison ? summary?.prevCvr : undefined}
                />
              </div>

              {/* Chart */}
              <div
                className="bg-white rounded-xl p-4 md:p-6"
                style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                data-testid="card-chart"
              >
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div>
                    <div className="text-sm font-bold" style={{ color: "#1A1A1A" }}>配信トレンド</div>
                    <div className="text-xs mt-0.5 hidden sm:block" style={{ color: "#9CA3AF" }}>
                      棒：配信数　折れ線：開封率 / クリック率
                    </div>
                  </div>
                </div>
                {items.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm" style={{ color: "#bbb" }}>データがありません</div>
                ) : (
                  <>
                    <div style={{ height: 200 }} className="md:h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={items} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                          <XAxis dataKey="label" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
                          <YAxis yAxisId="left" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} tickFormatter={formatNumber} width={48} />
                          <YAxis yAxisId="right" orientation="right" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} tickFormatter={formatPercent} width={42} />
                          <Tooltip
                            contentStyle={{ background: "#fff", border: "1px solid #EBEBEB", borderRadius: "10px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                            formatter={(value: number, name: string) =>
                              name === "配信数" ? [formatNumber(value), name] : [formatPercent(value), name]
                            }
                          />
                          <Bar yAxisId="left" dataKey="deliveryCount" name="配信数" fill={YELLOW} radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.9} />
                          <Line yAxisId="right" type="monotone" dataKey="openRate" name="開封率" stroke="#60A5FA" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          <Line yAxisId="right" type="monotone" dataKey="clickRate" name="クリック率" stroke="#34D399" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 md:gap-6 mt-3 pt-3 flex-wrap" style={{ borderTop: "1px solid #F3F4F6" }}>
                      {[{ color: YELLOW, label: "配信数" }, { color: "#60A5FA", label: "開封率" }, { color: "#34D399", label: "クリック率" }].map((l) => (
                        <div key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                          {l.label}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Tables */}
              {segmentGroups.length > 0 ? (
                segmentGroups.map((group) => (
                  <div key={group.segment} className="bg-white rounded-xl overflow-hidden"
                    style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between"
                      style={{ borderBottom: "1px solid #F3F4F6", background: YELLOW_LIGHT }}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: YELLOW_DARK }}>セグメント：{group.segment}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: YELLOW, color: "#fff" }}>
                          配信数 {formatNumber(group.summary.deliveryCount)}
                        </span>
                      </div>
                      <span className="text-xs" style={{ color: "#9CA3AF" }}>{group.items.length} 件</span>
                    </div>
                    <MetricsTable items={group.items} groupBy={groupBy} showComparison={showComparison} />
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-xl overflow-hidden"
                  style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }} data-testid="card-table">
                  <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between"
                    style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>詳細データ</span>
                    <span className="text-xs" style={{ color: "#9CA3AF" }}>{items.length} 件</span>
                  </div>
                  <MetricsTable items={items} groupBy={groupBy} showComparison={showComparison} />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {segmentDropdownOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setSegmentDropdownOpen(false)} />
      )}
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, sub2, accent, testId, current, prev,
}: {
  label: string; value: string; sub?: string; sub2?: string; accent?: boolean; testId: string;
  current?: number; prev?: number | null;
}) {
  return (
    <div
      className="bg-white rounded-xl px-4 py-4 md:px-6 md:py-5"
      style={{
        border: accent ? `1.5px solid ${YELLOW}` : "1px solid #EBEBEB",
        boxShadow: accent ? `0 2px 12px ${YELLOW}33` : "0 1px 4px rgba(0,0,0,0.04)",
      }}
      data-testid={testId}
    >
      <div className="flex items-start justify-between mb-2 md:mb-3">
        <span className="text-xs font-medium" style={{ color: "#9CA3AF" }}>{label}</span>
        {accent && (
          <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: YELLOW_LIGHT }}>
            <Mail size={12} color={YELLOW_DARK} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 flex-wrap">
        <div className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: "#1A1A1A" }}>{value}</div>
        {current != null && prev != null && <DiffBadge current={current} prev={prev} />}
      </div>
      {sub && <div className="text-xs mt-1 md:mt-1.5 font-medium" style={{ color: accent ? YELLOW_DARK : "#9CA3AF" }}>{sub}</div>}
      {sub2 && <div className="text-xs mt-0.5 md:mt-1" style={{ color: "#6B7280" }}>{sub2}</div>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-5" data-testid="loading-skeleton">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 md:h-32 rounded-xl" style={{ background: "#EBEBEB" }} />)}
      </div>
      <Skeleton className="h-64 md:h-72 rounded-xl" style={{ background: "#EBEBEB" }} />
      <Skeleton className="h-56 md:h-64 rounded-xl" style={{ background: "#EBEBEB" }} />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 md:p-12 rounded-xl"
      style={{ border: "1px solid #FEE2E2", background: "#FEF2F2" }} data-testid="error-state">
      <p className="text-sm font-medium mb-4" style={{ color: "#EF4444" }}>データの取得に失敗しました</p>
      <button onClick={onRetry} className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: "#1A1A1A" }}>再試行</button>
    </div>
  );
}
