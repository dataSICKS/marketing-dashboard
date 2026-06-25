import { useState } from "react";
import {
  useGetEfoData,
  useGetEfoFilters,
  useSyncEfo,
  useGetClarityFiles,
  useGetClarityScroll,
} from "@workspace/api-client-react";
import type {
  GetEfoDataGroupBy,
  EfoMetrics,
  EfoExitScenarioCount,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPercent } from "@/lib/format";
import { RefreshCw, MousePointerClick, CheckCircle, TrendingUp } from "lucide-react";
import EfoDateRangePicker, { type EfoDateRange } from "@/components/EfoDateRangePicker";
import MultiSelectCombobox from "@/components/MultiSelectCombobox";

type GroupBy = GetEfoDataGroupBy;

const YELLOW = "#FBBF24";
const BLUE = "#6366F1";
const CLARITY_DESKTOP = "#60A5FA";
const CLARITY_MOBILE = "#F472B6";

const SEG_COLORS = { A: YELLOW, B: BLUE } as const;
const SEG_TEXT_ON_COLOR = { A: "#1A1A1A", B: "#ffffff" } as const;

const GROUP_TABS: { value: GroupBy; label: string }[] = [
  { value: "day", label: "日別" },
  { value: "week", label: "週別" },
  { value: "month", label: "月別" },
];

const FUNNEL_ORDER = ["start", "greeting", "name", "contact", "address", "product", "payment", "confirm_preview", "submission"];
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

// ─── Segment Selector ─────────────────────────────────────────────
interface SegmentFilter {
  profileNames: string[];
  adCodes: string[];
  dateRange: EfoDateRange | null;
}

function SegmentSelector({
  seg, filter, profiles, adCodes, onChange,
}: {
  seg: "A" | "B";
  filter: SegmentFilter;
  profiles: string[];
  adCodes: string[];
  onChange: (f: SegmentFilter) => void;
}) {
  const color = SEG_COLORS[seg];
  const textOnColor = SEG_TEXT_ON_COLOR[seg];
  return (
    <div className="rounded-xl overflow-hidden flex-1" style={{ border: `2px solid ${color}` }}>
      <div className="px-4 py-3 flex items-center justify-between" style={{ background: color }}>
        <span className="text-sm font-bold" style={{ color: textOnColor }}>セグメント {seg}</span>
      </div>
      <div className="px-4 py-3 flex flex-col gap-2" style={{ background: "#fff" }}>
        <div>
          <div className="text-[10px] font-medium mb-1" style={{ color: "#9CA3AF" }}>プロファイル</div>
          <MultiSelectCombobox
            options={profiles}
            selected={filter.profileNames}
            onChange={(v) => onChange({ ...filter, profileNames: v })}
            placeholder="全体（複数選択可）"
            accentColor={color}
          />
        </div>
        <div>
          <div className="text-[10px] font-medium mb-1" style={{ color: "#9CA3AF" }}>広告コード</div>
          <MultiSelectCombobox
            options={adCodes}
            selected={filter.adCodes}
            onChange={(v) => onChange({ ...filter, adCodes: v })}
            placeholder="全体（複数選択可）"
            accentColor={color}
          />
        </div>
        <div>
          <div className="text-[10px] font-medium mb-1" style={{ color: "#9CA3AF" }}>期間</div>
          <EfoDateRangePicker
            value={filter.dateRange}
            onChange={(r) => onChange({ ...filter, dateRange: r })}
            accentColor={color}
          />
        </div>
      </div>
    </div>
  );
}

// ─── KPI Row ───────────────────────────────────────────────────────
function KpiRow({ summary, isLoading, color }: { summary: EfoMetrics | undefined; isLoading: boolean; color: string }) {
  const items = [
    { label: "起動数", value: formatNumber(summary?.accessCount ?? 0), icon: MousePointerClick },
    { label: "CV数",   value: formatNumber(summary?.cvCount ?? 0), icon: CheckCircle },
    { label: "CVR",    value: formatPercent(summary?.cvr ?? 0), icon: TrendingUp },
  ];
  return (
    <div className="flex" style={{ borderBottom: "1px solid #F0F0F0" }}>
      {items.map((k, i) => (
        <div
          key={k.label}
          className="flex-1 px-4 py-3 text-center"
          style={{ borderRight: i < 2 ? "1px solid #F0F0F0" : "none" }}
        >
          <div className="text-xs mb-1" style={{ color: "#9CA3AF" }}>{k.label}</div>
          {isLoading
            ? <Skeleton className="h-7 w-20 mx-auto" />
            : <div className="text-xl font-bold" style={{ color: "#111" }}>{k.value}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── CVR Trend Line Chart ──────────────────────────────────────────
function CvrTrendChart({ items, color }: { items: EfoMetrics[]; color: string }) {
  const data = items.map((item) => ({
    label: item.label,
    accessCount: item.accessCount,
    cvCount: item.cvCount,
    cvr: parseFloat((item.cvr * 100).toFixed(2)),
  }));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} margin={{ top: 16, right: 20, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="count" orientation="left" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={40} />
        <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} unit="%" width={36} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }}
          formatter={(value: number, name: string) => {
            if (name === "cvr") return [`${value}%`, "CVR"];
            if (name === "accessCount") return [formatNumber(value), "起動数"];
            if (name === "cvCount") return [formatNumber(value), "CV数"];
            return [value, name];
          }}
        />
        <Bar yAxisId="count" dataKey="accessCount" fill="#E5E7EB" radius={[3, 3, 0, 0]} maxBarSize={32} name="accessCount" />
        <Bar yAxisId="count" dataKey="cvCount" fill={color} radius={[3, 3, 0, 0]} maxBarSize={32} name="cvCount" opacity={0.85} />
        <Line yAxisId="rate" type="monotone" dataKey="cvr" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} name="cvr" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ─── Arrival Funnel ────────────────────────────────────────────────
function ArrivalFunnel({ scenarios, color }: { scenarios: EfoExitScenarioCount[]; color: string }) {
  if (scenarios.length === 0) {
    return <div className="h-28 flex items-center justify-center text-xs" style={{ color: "#bbb" }}>データなし</div>;
  }
  const exitMap = new Map<string, number>(scenarios.map((s) => [s.scenario, s.count]));
  const orderedSteps = FUNNEL_ORDER.filter((s) => exitMap.has(s));
  let cumulative = 0;
  const arrivals: { raw: string; name: string; arrival: number }[] = [];
  for (let i = orderedSteps.length - 1; i >= 0; i--) {
    const step = orderedSteps[i];
    cumulative += exitMap.get(step) ?? 0;
    arrivals.unshift({ raw: step, name: FUNNEL_LABELS[step] ?? step, arrival: cumulative });
  }
  const total = arrivals[0]?.arrival ?? 1;
  return (
    <div className="space-y-1.5">
      {arrivals.map((d) => {
        const pct = total > 0 ? (d.arrival / total) * 100 : 0;
        const isGoal = d.raw === "submission";
        return (
          <div key={d.raw} className="flex items-center gap-2">
            <span className="text-xs w-16 text-right shrink-0" style={{ color: "#6B7280" }}>{d.name}</span>
            <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: isGoal ? "#10B981" : color, opacity: isGoal ? 1 : 0.5 + pct / 200 }}
              />
            </div>
            <span className="text-xs w-16 text-right shrink-0 font-medium" style={{ color: "#374151" }}>
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Segment Panel ─────────────────────────────────────────────────
function SegmentPanel({
  seg, groupBy, filter,
}: {
  seg: "A" | "B";
  groupBy: GroupBy;
  filter: SegmentFilter;
}) {
  const color = SEG_COLORS[seg];
  const params = {
    groupBy,
    ...(filter.profileNames.length ? { profileName: filter.profileNames.join(",") } : {}),
    ...(filter.adCodes.length ? { adCode: filter.adCodes.join(",") } : {}),
    ...(filter.dateRange?.from ? { dateFrom: filter.dateRange.from.replace(/\//g, "-") } : {}),
    ...(filter.dateRange?.to ? { dateTo: filter.dateRange.to.replace(/\//g, "-") } : {}),
  };
  const { data, isLoading, error } = useGetEfoData(params);

  const summary = data?.summary;
  const items = data?.items ?? [];
  const exitScenarios = data?.exitScenarios ?? [];

  return (
    <div className="flex-1 rounded-xl overflow-hidden" style={{ border: "1px solid #E5E7EB" }}>
      {/* KPIs */}
      <KpiRow summary={summary} isLoading={isLoading} color={color} />

      {/* CVR Trend */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #F0F0F0", background: "#fff" }}>
        <div className="text-xs font-semibold mb-2" style={{ color: "#6B7280" }}>CVR推移</div>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <div className="h-40 flex items-center justify-center text-xs" style={{ color: "#EF4444" }}>取得失敗</div>
        ) : items.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-xs" style={{ color: "#bbb" }}>データなし</div>
        ) : (
          <CvrTrendChart items={items} color={color} />
        )}
      </div>

      {/* Arrival Funnel */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid #F0F0F0", background: "#fff" }}>
        <div className="text-xs font-semibold mb-3" style={{ color: "#6B7280" }}>ステップ別到達率</div>
        {isLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 rounded-full" />)}
          </div>
        ) : (
          <ArrivalFunnel scenarios={exitScenarios} color={color} />
        )}
      </div>

      {/* Table */}
      {!isLoading && items.length > 0 && (
        <div style={{ background: "#FAFAFA" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: "1px solid #F0F0F0" }}>
                {["ラベル", "起動数", "CV数", "CVR"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-semibold" style={{ color: "#9CA3AF" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={`${item.label}-${i}`} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                  <td className="px-4 py-2 font-medium" style={{ color: "#6B7280" }}>{item.label}</td>
                  <td className="px-4 py-2" style={{ color: "#374151" }}>{formatNumber(item.accessCount)}</td>
                  <td className="px-4 py-2" style={{ color: "#374151" }}>{formatNumber(item.cvCount)}</td>
                  <td className="px-4 py-2 font-semibold" style={{ color: item.cvr > 0.1 ? "#10B981" : "#374151" }}>
                    {formatPercent(item.cvr)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Clarity Scroll Depth Chart ────────────────────────────────────
function ClarityScrollSection() {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedAdCode, setSelectedAdCode] = useState<string>("");

  const { data: datesData, isLoading: datesLoading } = useGetClarityFiles();
  const dates = datesData?.dates ?? [];

  // selectedDateが未設定の場合は最新日付を使用
  const activeDate = selectedDate || (dates[0] ?? "");

  const { data: filesData, isLoading: filesLoading } = useGetClarityFiles(
    activeDate ? { date: activeDate } : undefined,
    { query: { enabled: !!activeDate } },
  );
  const adCodeOptions = filesData?.adCodes ?? [];

  const effectiveAdCode = selectedAdCode || (adCodeOptions[0]?.adCode ?? "");
  const effectiveDate = activeDate;

  const { data: scrollData, isLoading: scrollLoading } = useGetClarityScroll(
    { date: effectiveDate, adCode: effectiveAdCode },
    { query: { enabled: !!(effectiveDate && effectiveAdCode) } },
  );

  const points = scrollData?.points ?? [];
  const pageViews = scrollData?.pageViews ?? {};

  const chartData = points.map((p) => ({
    depth: `${p.depth}%`,
    Desktop: p.desktop,
    Mobile: p.mobile,
  }));

  const isChartLoading = scrollLoading || (!!effectiveDate && filesLoading);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5E7EB", background: "#fff" }}>
      {/* Section header */}
      <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: "1px solid #F0F0F0" }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>スクロール深度分析</div>
          <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>Microsoft Clarity — 広告コード別スクロール到達率</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "#6B7280" }}>日付</span>
            {datesLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <select
                value={selectedDate || (dates[0] ?? "")}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedAdCode("");
                }}
                className="text-xs rounded-lg px-3 py-1.5 outline-none cursor-pointer"
                style={{ border: "1px solid #E5E7EB", color: "#374151", background: "#FAFAFA" }}
              >
                {dates.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          {/* Ad code selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "#6B7280" }}>広告コード</span>
            {filesLoading && selectedDate ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <select
                value={selectedAdCode || (adCodeOptions[0]?.adCode ?? "")}
                onChange={(e) => setSelectedAdCode(e.target.value)}
                className="text-xs rounded-lg px-3 py-1.5 outline-none cursor-pointer"
                style={{ border: "1px solid #E5E7EB", color: "#374151", background: "#FAFAFA" }}
                disabled={adCodeOptions.length === 0}
              >
                {adCodeOptions.map((a) => (
                  <option key={a.adCode} value={a.adCode}>
                    {a.adCode}（{a.devices.join(" / ")}）
                  </option>
                ))}
                {adCodeOptions.length === 0 && <option value="">—</option>}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Page views summary */}
      {!isChartLoading && (Object.keys(pageViews).length > 0) && (
        <div className="px-5 py-2 flex items-center gap-4" style={{ borderBottom: "1px solid #F5F5F5", background: "#FAFAFA" }}>
          {pageViews.Desktop != null && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CLARITY_DESKTOP }} />
              <span className="text-xs" style={{ color: "#6B7280" }}>Desktop PV:</span>
              <span className="text-xs font-semibold" style={{ color: "#374151" }}>{formatNumber(pageViews.Desktop)}</span>
            </div>
          )}
          {pageViews.Mobile != null && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CLARITY_MOBILE }} />
              <span className="text-xs" style={{ color: "#6B7280" }}>Mobile PV:</span>
              <span className="text-xs font-semibold" style={{ color: "#374151" }}>{formatNumber(pageViews.Mobile)}</span>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="px-5 py-4">
        {isChartLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !effectiveDate || !effectiveAdCode ? (
          <div className="h-56 flex items-center justify-center text-xs" style={{ color: "#bbb" }}>
            日付と広告コードを選択してください
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-xs" style={{ color: "#bbb" }}>
            データなし
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="clarityDesktop" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CLARITY_DESKTOP} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CLARITY_DESKTOP} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="clarityMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CLARITY_MOBILE} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CLARITY_MOBILE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis
                dataKey="depth"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                tickLine={false}
                axisLine={false}
                interval={4}
                label={{ value: "スクロール深度", position: "insideBottomRight", offset: -4, fontSize: 10, fill: "#9CA3AF" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                tickLine={false}
                axisLine={false}
                width={44}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }}
                formatter={(value, name: string) => {
                  const num = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : null;
                  if (num == null || isNaN(num)) return ["—", name];
                  return [formatNumber(num), name === "Desktop" ? "Desktop 訪問者数" : "Mobile 訪問者数"];
                }}
                labelFormatter={(label) => `スクロール深度: ${label}`}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => value === "Desktop" ? "Desktop" : "Mobile"}
              />
              <Area
                type="monotone"
                dataKey="Desktop"
                stroke={CLARITY_DESKTOP}
                strokeWidth={2}
                fill="url(#clarityDesktop)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="Mobile"
                stroke={CLARITY_MOBILE}
                strokeWidth={2}
                fill="url(#clarityMobile)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function EfoPage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("week");
  const defaultDateRange = (() => {
    const toD = new Date();
    const fromD = new Date(toD);
    fromD.setDate(fromD.getDate() - 29);
    const fmt = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    return { from: fmt(fromD), to: fmt(toD) };
  })();
  const [filterA, setFilterA] = useState<SegmentFilter>({ profileNames: [], adCodes: [], dateRange: defaultDateRange });
  const [filterB, setFilterB] = useState<SegmentFilter>({ profileNames: [], adCodes: [], dateRange: defaultDateRange });
  const queryClient = useQueryClient();

  const { data: filtersData } = useGetEfoFilters();
  const profiles = filtersData?.profileNames ?? [];
  const adCodes = filtersData?.adCodes ?? [];

  const { data: anyData } = useGetEfoData({ groupBy });
  const lastSyncedAt = anyData?.lastSyncedAt;

  const { mutate: syncEfo, isPending: isSyncing } = useSyncEfo({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["/api/efo/data"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/efo/filters"] });
      },
    },
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto" style={{ background: "#F8F8F8" }}>
      {/* Header */}
      <div className="px-6 py-4 shrink-0" style={{ borderBottom: "1px solid #EBEBEB", background: "#fff" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold" style={{ color: "#1A1A1A" }}>EFO CVRレポート</h1>
            <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
              セグメント比較
              {lastSyncedAt && <> ・最終更新: {new Date(lastSyncedAt).toLocaleString("ja-JP")}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* GroupBy tabs */}
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
      </div>

      <div className="flex-1 p-6 space-y-4">
        {/* Segment Selectors */}
        <div className="flex gap-4">
          <SegmentSelector seg="A" filter={filterA} profiles={profiles} adCodes={adCodes} onChange={setFilterA} />
          <SegmentSelector seg="B" filter={filterB} profiles={profiles} adCodes={adCodes} onChange={setFilterB} />
        </div>

        {/* Side-by-side Panels */}
        <div className="flex gap-4 items-start">
          <SegmentPanel seg="A" groupBy={groupBy} filter={filterA} />
          <SegmentPanel seg="B" groupBy={groupBy} filter={filterB} />
        </div>

        {/* Clarity Scroll Depth */}
        <ClarityScrollSection />
      </div>
    </div>
  );
}
