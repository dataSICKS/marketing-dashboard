import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useGetNewsletterData,
  useSyncNewsletter,
  useGetNewsletterTemplates,
  useGetNewsletterMatrix,
  getGetNewsletterDataQueryKey,
  useListCampaigns,
} from "@workspace/api-client-react";
import type {
  GetNewsletterDataGroupBy,
  NewsletterMetrics,
  NewsletterSegmentGroup,
  MatrixResponse,
  Campaign,
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
  ReferenceLine,
  Cell,
} from "recharts";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import {
  RefreshCw,
  Mail,
  X,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  BookmarkPlus,
  Trash2,
  GitCommitHorizontal,
  ArrowRight,
} from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/DateRangePicker";

type GroupBy = GetNewsletterDataGroupBy;
type TabMode = GroupBy | "matrix";

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";
const BEFORE_COLOR = "#60A5FA";
const AFTER_COLOR = "#F472B6";
const CHANGE_COLOR = "#A855F7";
const CAMPAIGN_COLORS = ["#F97316", "#10B981", "#EC4899", "#3B82F6", "#8B5CF6", "#14B8A6"];
const SERIES_COLORS = ["#6366F1", "#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#8B5CF6", "#14B8A6", "#F97316", "#EF4444", "#84CC16"];

const MATRIX_METRICS = [
  { value: "deliveryCount", label: "配信数", isRate: false },
  { value: "openRate", label: "開封率", isRate: true },
  { value: "clickRate", label: "クリック率", isRate: true },
  { value: "cvr", label: "CVR", isRate: true },
  { value: "cvCount", label: "CV数", isRate: false },
] as const;

const GROUP_TABS: { value: TabMode; label: string }[] = [
  { value: "day", label: "日別" },
  { value: "week", label: "週別" },
  { value: "month", label: "月別" },
  { value: "scenario", label: "シナリオ別" },
  { value: "template", label: "テンプレ別" },
  { value: "matrix", label: "マトリクス" },
];

// ─── Preset helpers ───────────────────────────────────────────────
interface Preset {
  id: string;
  name: string;
  groupBy: TabMode;
  dateFrom?: string;
  dateTo?: string;
  segments: string[];
}

function loadPresets(): Preset[] {
  try {
    return JSON.parse(localStorage.getItem("nl_presets") ?? "[]");
  } catch {
    return [];
  }
}
function savePresetsToStorage(presets: Preset[]) {
  localStorage.setItem("nl_presets", JSON.stringify(presets));
}

// ─── Summary helper ────────────────────────────────────────────────
function sumItems(items: NewsletterMetrics[]) {
  const d = items.reduce((s, r) => s + r.deliveryCount, 0);
  const o = items.reduce((s, r) => s + r.openCount, 0);
  const c = items.reduce((s, r) => s + r.clickCount, 0);
  const cv = items.reduce((s, r) => s + r.cvCount, 0);
  return {
    deliveryCount: d, openCount: o, clickCount: c, cvCount: cv,
    openRate: d > 0 ? o / d : 0,
    clickRate: d > 0 ? c / d : 0,
    cvr: d > 0 ? cv / d : 0,
  };
}

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

function DiffBadgePt({ current, prev, isRate }: { current: number; prev: number; isRate?: boolean }) {
  const diff = current - prev;
  const isUp = diff >= 0;
  const label = isRate
    ? `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}pt`
    : `${diff >= 0 ? "+" : ""}${(((current - prev) / Math.abs(prev)) * 100).toFixed(1)}%`;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: isUp ? "#DCFCE7" : "#FEE2E2", color: isUp ? "#16A34A" : "#DC2626" }}
    >
      {label}
    </span>
  );
}

// ─── Before/After KPI row ─────────────────────────────────────────
function BeforeAfterKpiRow({
  campaign,
  before,
  after,
}: {
  campaign: Campaign;
  before: ReturnType<typeof sumItems>;
  after: ReturnType<typeof sumItems>;
}) {
  const kpis = [
    { label: "配信数", bVal: formatNumber(before.deliveryCount), aVal: formatNumber(after.deliveryCount), b: before.deliveryCount, a: after.deliveryCount, isRate: false },
    { label: "開封率", bVal: formatPercent(before.openRate), aVal: formatPercent(after.openRate), b: before.openRate, a: after.openRate, isRate: true },
    { label: "クリック率", bVal: formatPercent(before.clickRate), aVal: formatPercent(after.clickRate), b: before.clickRate, a: after.clickRate, isRate: true },
    { label: "CVR", bVal: formatPercent(before.cvr), aVal: formatPercent(after.cvr), b: before.cvr, a: after.cvr, isRate: true },
    { label: "CV数", bVal: formatNumber(before.cvCount), aVal: formatNumber(after.cvCount), b: before.cvCount, a: after.cvCount, isRate: false },
  ];

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: `1.5px solid ${CHANGE_COLOR}` }}>
      <div className="px-4 md:px-6 py-2.5 flex items-center gap-2 flex-wrap" style={{ background: "#FDF4FF", borderBottom: "1px solid #F3E8FF" }}>
        <GitCommitHorizontal size={13} color={CHANGE_COLOR} />
        <span className="text-xs font-bold" style={{ color: CHANGE_COLOR }}>
          施策「{campaign.title}」開始前後比較（{campaign.startDate}〜）
        </span>
        {campaign.memo && (
          <span className="text-[10px] truncate max-w-[240px]" style={{ color: "#9CA3AF" }}>{campaign.memo}</span>
        )}
        <div className="flex items-center gap-3 ml-auto text-[10px]" style={{ color: "#9CA3AF" }}>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: BEFORE_COLOR }} /> 施策前
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: AFTER_COLOR }} /> 施策後
          </span>
        </div>
      </div>
      <div className="grid grid-cols-5">
        {kpis.map((k, i) => (
          <div key={k.label} className="px-3 md:px-4 py-3 flex flex-col gap-1.5" style={{ borderRight: i < 4 ? "1px solid #F3F4F6" : "none" }}>
            <div className="text-[10px] font-medium" style={{ color: "#9CA3AF" }}>{k.label}</div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BEFORE_COLOR }} />
              <span className="text-sm font-semibold" style={{ color: "#6B7280" }}>{k.bVal}</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <ArrowRight size={9} color="#D1D5DB" />
              <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>{k.aVal}</span>
              {k.b > 0 && <DiffBadgePt current={k.a} prev={k.b} isRate={k.isRate} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Campaign picker ───────────────────────────────────────────────
function CampaignPicker({
  campaigns,
  selectedId,
  onSelect,
}: {
  campaigns: Campaign[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (campaigns.length === 0) {
    return (
      <div className="bg-white rounded-xl px-4 py-3 text-xs" style={{ border: `1.5px solid ${CHANGE_COLOR}`, color: "#9CA3AF" }}>
        施策カレンダーに施策が登録されていません。先に施策を追加してください。
      </div>
    );
  }
  return (
    <div className="bg-white rounded-xl px-4 py-3" style={{ border: `1.5px solid ${CHANGE_COLOR}` }}>
      <div className="flex items-center gap-2 mb-2.5">
        <GitCommitHorizontal size={13} color={CHANGE_COLOR} />
        <span className="text-xs font-semibold" style={{ color: CHANGE_COLOR }}>施策を選択</span>
        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>施策の開始日を起点に前後を比較します</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {campaigns.map((c) => {
          const isSelected = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="flex items-start gap-2 px-3 py-2 rounded-xl text-left transition-all"
              style={isSelected
                ? { background: "#FDF4FF", border: `1.5px solid ${CHANGE_COLOR}` }
                : { background: "#F9FAFB", border: "1px solid #E5E7EB" }}
            >
              <span className="text-base leading-none mt-0.5">📌</span>
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-bold" style={{ color: isSelected ? CHANGE_COLOR : "#374151" }}>{c.startDate}</span>
                  <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ background: "#F3E8FF", color: CHANGE_COLOR }}>施策開始</span>
                </div>
                <div className="text-[10px] max-w-[200px] truncate font-medium" style={{ color: "#374151" }}>{c.title}</div>
                {c.memo && <div className="text-[9px] mt-0.5 max-w-[200px] truncate" style={{ color: "#9CA3AF" }}>{c.memo}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Metrics table ────────────────────────────────────────────────
function MetricsTable({
  items, groupBy, showComparison, getRowPhase,
}: {
  items: NewsletterMetrics[];
  groupBy: GroupBy;
  showComparison: boolean;
  getRowPhase?: (label: string) => "before" | "after" | null;
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
          ) : items.map((item, i) => {
            const phase = getRowPhase ? getRowPhase(item.label) : null;
            return (
              <TableRow
                key={`${item.label}-${i}`}
                className="hover:bg-[#FAFAFA] transition-colors"
                style={{
                  borderBottom: "1px solid #F9FAFB",
                  background: phase === "before" ? "#EFF6FF" : phase === "after" ? "#FDF2F8" : undefined,
                }}
              >
                <TableCell className="text-sm font-medium whitespace-nowrap" style={{ color: phase === "before" ? "#1D4ED8" : phase === "after" ? "#9D174D" : "#6B7280" }}>
                  {phase && (
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0 align-middle" style={{ background: phase === "before" ? BEFORE_COLOR : AFTER_COLOR }} />
                  )}
                  {item.label}
                </TableCell>
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
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Preset Bar ───────────────────────────────────────────────────
function PresetBar({
  presets,
  activeId,
  onSelect,
  onSave,
  onDelete,
}: {
  presets: Preset[];
  activeId: string | null;
  onSelect: (p: Preset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName("");
    setSaving(false);
  };

  if (presets.length === 0 && !saving) {
    return (
      <div className="bg-white px-4 md:px-8 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
        <span className="text-[10px] font-semibold shrink-0" style={{ color: "#9CA3AF" }}>保存済みビュー</span>
        <button
          onClick={() => setSaving(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ border: `1.5px dashed ${YELLOW}`, color: YELLOW_DARK, background: YELLOW_LIGHT }}
        >
          <BookmarkPlus size={11} /> 現在の設定を保存
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white px-4 md:px-8 py-2 flex items-center gap-2 overflow-x-auto" style={{ borderBottom: "1px solid #F3F4F6" }}>
      <span className="text-[10px] font-semibold shrink-0" style={{ color: "#9CA3AF" }}>保存済み</span>
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
        {presets.map((p) => (
          <div key={p.id} className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => onSelect(p)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-l-full text-xs font-medium whitespace-nowrap"
              style={activeId === p.id
                ? { background: YELLOW, color: "#fff" }
                : { background: "#F3F4F6", color: "#6B7280" }}
            >
              {p.name}
            </button>
            <button
              onClick={() => onDelete(p.id)}
              className="px-1.5 py-1 rounded-r-full flex items-center"
              style={activeId === p.id
                ? { background: YELLOW_DARK, color: "#fff" }
                : { background: "#E5E7EB", color: "#9CA3AF" }}
              title="削除"
            >
              <Trash2 size={9} />
            </button>
          </div>
        ))}
      </div>
      {saving ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            className="text-xs px-2 py-1 rounded-lg outline-none"
            style={{ border: `1.5px solid ${YELLOW}`, width: 120 }}
            placeholder="ビュー名を入力…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            autoFocus
          />
          <button className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{ background: YELLOW, color: "#fff" }} onClick={handleSave}>保存</button>
          <button className="text-xs px-2 py-1 rounded-lg" style={{ color: "#9CA3AF" }} onClick={() => setSaving(false)}>×</button>
        </div>
      ) : (
        <button
          onClick={() => setSaving(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
          style={{ border: `1.5px dashed ${YELLOW}`, color: YELLOW_DARK, background: YELLOW_LIGHT }}
        >
          <BookmarkPlus size={11} /> 保存
        </button>
      )}
    </div>
  );
}

// ─── Matrix View ─────────────────────────────────────────────────
function MatrixView({
  availableScenarios,
  availableTemplates,
  dateRange,
}: {
  availableScenarios: string[];
  availableTemplates: string[];
  dateRange: DateRange | null;
}) {
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>("deliveryCount");
  const [timeGroupBy, setTimeGroupBy] = useState<"day" | "week" | "month">("month");

  const toggleScenario = (s: string) =>
    setSelectedScenarios((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const toggleTemplate = (t: string) =>
    setSelectedTemplates((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const hasSelections = selectedScenarios.length > 0 || selectedTemplates.length > 0;

  const matrixParams = {
    timeGroupBy,
    metric,
    scenarios: selectedScenarios.join(","),
    templates: selectedTemplates.join(","),
    dateFrom: dateRange?.from,
    dateTo: dateRange?.to,
  };
  const { data, isLoading } = useGetNewsletterMatrix(matrixParams, {
    query: { enabled: hasSelections },
  });

  const metricDef = MATRIX_METRICS.find((m) => m.value === metric) ?? MATRIX_METRICS[0];
  const formatVal = (v: number) => (metricDef.isRate ? formatPercent(v) : formatNumber(v));

  const series: MatrixResponse["series"] = data?.series ?? [];
  const timePeriods: string[] = data?.timePeriods ?? [];

  const chartData = timePeriods.map((period) => {
    const point: Record<string, string | number> = { period };
    for (const s of series) point[s.key] = s.values[period] ?? 0;
    return point;
  });

  const allVals = series.flatMap((s) => Object.values(s.values)).filter((v) => v > 0);
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 1;
  const minVal = allVals.length > 0 ? Math.min(...allVals) : 0;
  const heatBg = (val: number | undefined) => {
    if (val == null || maxVal === minVal) return "transparent";
    const ratio = (val - minVal) / (maxVal - minVal);
    return `rgba(251,191,36,${(ratio * 0.45).toFixed(2)})`;
  };

  const chipColor = (idx: number, selected: boolean) =>
    selected ? SERIES_COLORS[idx % SERIES_COLORS.length] : "#9CA3AF";

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* ── Controls ── */}
      <div className="bg-white rounded-xl p-4 md:p-5 flex flex-col gap-3" style={{ border: "1px solid #EBEBEB" }}>
        {availableScenarios.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: "#6B7280" }}>シナリオ（行に追加）</div>
            <div className="flex flex-wrap gap-1.5">
              {availableScenarios.map((s) => {
                const idx = selectedScenarios.indexOf(s);
                const selected = idx >= 0;
                const color = chipColor(idx, selected);
                return (
                  <button key={s} onClick={() => toggleScenario(s)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={selected
                      ? { background: color + "22", color, border: `1.5px solid ${color}` }
                      : { background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {availableTemplates.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-2" style={{ color: "#6B7280" }}>テンプレ（行に追加）</div>
            <div className="flex flex-wrap gap-1.5">
              {availableTemplates.map((t) => {
                const idx = selectedTemplates.indexOf(t);
                const selected = idx >= 0;
                const color = chipColor(selectedScenarios.length + idx, selected);
                return (
                  <button key={t} onClick={() => toggleTemplate(t)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={selected
                      ? { background: color + "22", color, border: `1.5px solid ${color}` }
                      : { background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                    <span className="truncate max-w-[160px] inline-block align-bottom">{t}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap pt-1" style={{ borderTop: "1px solid #F3F4F6" }}>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: "#6B7280" }}>指標</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
              style={{ border: "1px solid #E5E7EB", color: "#1A1A1A", background: "#fff" }}
            >
              {MATRIX_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {(["day", "week", "month"] as const).map((tg) => (
              <button key={tg} onClick={() => setTimeGroupBy(tg)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={timeGroupBy === tg
                  ? { background: "#1A1A1A", color: "#fff" }
                  : { background: "#F3F4F6", color: "#6B7280" }}>
                {tg === "day" ? "日別" : tg === "week" ? "週別" : "月別"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasSelections ? (
        <div className="bg-white rounded-xl p-10 flex items-center justify-center text-sm"
          style={{ border: "1px solid #EBEBEB", color: "#9CA3AF" }}>
          上のシナリオまたはテンプレを選択してください
        </div>
      ) : isLoading ? (
        <LoadingSkeleton />
      ) : (
        <>
          {/* ── Multi-line chart ── */}
          <div className="bg-white rounded-xl p-4 md:p-6" style={{ border: "1px solid #EBEBEB" }}>
            <div className="text-sm font-bold mb-4" style={{ color: "#1A1A1A" }}>
              {metricDef.label} トレンド
            </div>
            {timePeriods.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm" style={{ color: "#bbb" }}>データなし</div>
            ) : (
              <>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="period" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
                      <YAxis stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                        tickFormatter={(v) => formatVal(v as number)} width={52} />
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #EBEBEB", borderRadius: 10, fontSize: 12 }}
                        formatter={(val: number, name: string) => [formatVal(val), name]}
                      />
                      {series.map((s, i) => (
                        <Line key={s.key} type="monotone" dataKey={s.key}
                          stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                          strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                  {series.map((s, i) => (
                    <div key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: "#374151" }}>
                      <svg width="14" height="2" viewBox="0 0 14 2"><line x1="0" y1="1" x2="14" y2="1" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth="2" /></svg>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                        {s.type === "scenario" ? "シナリオ" : "テンプレ"}
                      </span>
                      <span>{s.key}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Matrix table ── */}
          {timePeriods.length > 0 && (
            <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #EBEBEB" }}>
              <div className="px-4 md:px-6 py-3 md:py-4 flex items-center gap-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
                <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>マトリクス表</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: YELLOW_LIGHT, color: YELLOW_DARK }}>{metricDef.label}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                      <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap"
                        style={{ color: "#6B7280", minWidth: 160, position: "sticky", left: 0, background: "#F9FAFB" }}>行</th>
                      {timePeriods.map((period) => (
                        <th key={period} className="px-3 py-2.5 text-right font-medium whitespace-nowrap" style={{ color: "#6B7280" }}>{period}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((s, i) => (
                      <tr key={s.key} style={{ borderTop: "1px solid #F3F4F6" }}>
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap"
                          style={{ position: "sticky", left: 0, background: "#fff", color: "#1A1A1A" }}>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0"
                              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                              {s.type === "scenario" ? "シナリオ" : "テンプレ"}
                            </span>
                            <span className="truncate" style={{ maxWidth: 100 }}>{s.key}</span>
                          </div>
                        </td>
                        {timePeriods.map((period) => {
                          const val = s.values[period];
                          return (
                            <td key={period} className="px-3 py-2.5 text-right tabular-nums"
                              style={{ background: heatBg(val), color: "#1A1A1A" }}>
                              {val != null ? formatVal(val) : <span style={{ color: "#D1D5DB" }}>—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────
export default function Dashboard() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<TabMode>("day");

  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [compareRange, setCompareRange] = useState<DateRange | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(false);

  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [segmentDropdownOpen, setSegmentDropdownOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  // Compare mode: "none" | "date" | "change"
  const [compareMode, setCompareMode] = useState<"none" | "date" | "change">("none");
  const [selectedChangeId, setSelectedChangeId] = useState<number | null>(null);

  // Preset state
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // When compareMode changes
  useEffect(() => {
    if (compareMode === "date") {
      setCompareEnabled(true);
    } else {
      setCompareEnabled(false);
    }
  }, [compareMode]);

  // Force day grouping when in change compare mode; treat matrix as day for data queries
  const effectiveGroupBy: GroupBy = compareMode === "change" || groupBy === "matrix" ? "day" : groupBy;
  const activeTabValue: TabMode = groupBy === "matrix" ? "matrix" : (compareMode === "change" ? "day" : groupBy);

  const params = {
    groupBy: effectiveGroupBy,
    dateFrom: dateRange?.from,
    dateTo: dateRange?.to,
    segment: selectedSegments.length > 0 ? selectedSegments.join(",") : undefined,
    templateName: selectedTemplates.length > 0 ? selectedTemplates.join(",") : undefined,
    compareFrom: compareMode === "date" && compareEnabled && compareRange ? compareRange.from : undefined,
    compareTo: compareMode === "date" && compareEnabled && compareRange ? compareRange.to : undefined,
  };

  const { data, isLoading, isError } = useGetNewsletterData(params, {
    query: { queryKey: getGetNewsletterDataQueryKey(params) },
  });

  const { data: campaignsData } = useListCampaigns();
  const { data: templatesData } = useGetNewsletterTemplates();

  // Auto-select first campaign when entering change mode
  useEffect(() => {
    const camps = campaignsData?.campaigns ?? [];
    if (camps.length > 0 && selectedChangeId === null) {
      setSelectedChangeId(camps[0].id);
    }
  }, [campaignsData, selectedChangeId]);

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
  const showComparison = compareMode === "date" && compareEnabled && !!compareRange;

  // Resolve selected campaign for change compare mode
  const allCampaigns = campaignsData?.campaigns ?? [];
  const selectedCampaign = allCampaigns.find((c) => c.id === selectedChangeId) ?? null;
  const splitDate = selectedCampaign ? selectedCampaign.startDate.replace(/-/g, "/") : null;

  // Before/after splits for change compare mode
  const beforeItems = compareMode === "change" && splitDate
    ? items.filter((item) => item.label < splitDate)
    : [];
  const afterItems = compareMode === "change" && splitDate
    ? items.filter((item) => item.label >= splitDate)
    : [];
  const beforeSummary = sumItems(beforeItems);
  const afterSummary = sumItems(afterItems);

  // Campaigns that overlap with current item labels
  const campaignLines = useMemo<Campaign[]>(() => {
    const camps = campaignsData?.campaigns ?? [];
    if (camps.length === 0 || items.length === 0) return [];
    // labels are "YYYY/MM/DD", convert to "YYYY-MM-DD" for ISO comparison
    const toIso = (s: string) => s.replace(/\//g, "-");
    const minIso = toIso(items[0].label);
    const maxIso = toIso(items[items.length - 1].label);
    return camps.filter((c) => c.startDate <= maxIso && c.endDate >= minIso);
  }, [campaignsData, items]);

  // Row phase for table coloring
  const getRowPhase = useCallback((label: string): "before" | "after" | null => {
    if (compareMode !== "change" || !splitDate) return null;
    return label < splitDate ? "before" : "after";
  }, [compareMode, splitDate]);

  const handleDateApply = (range: DateRange | null, cmp: DateRange | null, cmpEnabled: boolean) => {
    setDateRange(range);
    setCompareRange(cmp);
    setCompareEnabled(cmpEnabled);
    if (cmpEnabled) setCompareMode("date");
  };

  const toggleSegment = (seg: string) => {
    setSelectedSegments((prev) =>
      prev.includes(seg) ? prev.filter((s) => s !== seg) : [...prev, seg]
    );
  };

  // Preset operations
  const applyPreset = (p: Preset) => {
    setGroupBy(p.groupBy);
    setDateRange(p.dateFrom && p.dateTo ? { from: p.dateFrom, to: p.dateTo } : null);
    setSelectedSegments(p.segments);
    setActivePresetId(p.id);
    setCompareMode("none");
  };

  const saveCurrentAsPreset = (name: string) => {
    const newPreset: Preset = {
      id: Date.now().toString(),
      name,
      groupBy,
      dateFrom: dateRange?.from,
      dateTo: dateRange?.to,
      segments: selectedSegments,
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    savePresetsToStorage(updated);
    setActivePresetId(newPreset.id);
  };

  const deletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    savePresetsToStorage(updated);
    if (activePresetId === id) setActivePresetId(null);
  };

  // Chart bar fill by phase
  const getBarFill = (label: string) => {
    if (compareMode !== "change" || !splitDate) return YELLOW;
    return label < splitDate ? BEFORE_COLOR : AFTER_COLOR;
  };

  return (
    <>
      <main className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div
          className="bg-white px-4 md:px-8 h-14 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid #EBEBEB" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 md:hidden" />
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

        {/* ── Preset Bar ── */}
        <PresetBar
          presets={presets}
          activeId={activePresetId}
          onSelect={applyPreset}
          onSave={saveCurrentAsPreset}
          onDelete={deletePreset}
        />

        <div className="flex-1 px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-5">

          {/* ── Tabs ── */}
          <div className="overflow-x-auto" style={{ borderBottom: "1px solid #EBEBEB" }}>
            <div className="flex items-center gap-0 min-w-max">
              {GROUP_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => { setGroupBy(tab.value); if (compareMode === "change" && tab.value !== "matrix") setCompareMode("none"); }}
                  className="px-4 py-2.5 text-sm font-medium transition-all relative whitespace-nowrap"
                  style={{ color: activeTabValue === tab.value ? YELLOW_DARK : "#9CA3AF" }}
                  data-testid={`tab-${tab.value}`}
                >
                  {tab.label}
                  {compareMode === "change" && tab.value === "day" && groupBy !== "matrix" && (
                    <span className="text-[9px] ml-1" style={{ color: CHANGE_COLOR }}>(強制)</span>
                  )}
                  {activeTabValue === tab.value && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ background: YELLOW }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {/* Date picker */}
            <DateRangePicker
              value={dateRange}
              compareValue={compareRange}
              compareEnabled={compareEnabled}
              onApply={handleDateApply}
            />

            {/* Segment dropdown — hidden in matrix mode */}
            {groupBy !== "matrix" && <div className="relative">
              <button
                onClick={() => setSegmentDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                style={selectedSegments.length > 0
                  ? { background: YELLOW_LIGHT, color: YELLOW_DARK, border: `1px solid ${YELLOW}` }
                  : { background: "#fff", color: "#6B7280", border: "1px solid #EBEBEB", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
              >
                {selectedSegments.length > 0 ? `シナリオ (${selectedSegments.length})` : "シナリオ"}
                <ChevronDown size={13} />
              </button>
              {segmentDropdownOpen && (
                <div className="absolute top-full mt-1 left-0 z-20 bg-white rounded-xl shadow-lg overflow-hidden" style={{ border: "1px solid #EBEBEB", minWidth: 180 }}>
                  {availableSegments.length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "#9CA3AF" }}>シナリオなし</div>
                  ) : availableSegments.map((seg) => (
                    <label key={seg} className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#FAFAFA] text-xs" style={{ color: "#374151" }}>
                      <input type="checkbox" checked={selectedSegments.includes(seg)} onChange={() => toggleSegment(seg)} style={{ accentColor: YELLOW }} />
                      {seg}
                    </label>
                  ))}
                  {selectedSegments.length > 0 && (
                    <div style={{ borderTop: "1px solid #F3F4F6" }}>
                      <button onClick={() => { setSelectedSegments([]); setSegmentDropdownOpen(false); }} className="w-full px-4 py-2.5 text-xs text-left" style={{ color: "#9CA3AF" }}>クリア</button>
                    </div>
                  )}
                </div>
              )}
            </div>}

            {/* Template dropdown — hidden in matrix mode */}
            {groupBy !== "matrix" && <div className="relative">
              <button
                onClick={() => setTemplateDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                style={selectedTemplates.length > 0
                  ? { background: YELLOW_LIGHT, color: YELLOW_DARK, border: `1px solid ${YELLOW}` }
                  : { background: "#fff", color: "#6B7280", border: "1px solid #EBEBEB", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
              >
                {selectedTemplates.length > 0 ? `テンプレ (${selectedTemplates.length})` : "テンプレ"}
                <ChevronDown size={13} />
              </button>
              {templateDropdownOpen && (
                <div className="absolute top-full mt-1 left-0 z-20 bg-white rounded-xl shadow-lg overflow-y-auto" style={{ border: "1px solid #EBEBEB", minWidth: 240, maxHeight: 320 }}>
                  {(templatesData?.templates ?? []).length === 0 ? (
                    <div className="px-4 py-3 text-xs" style={{ color: "#9CA3AF" }}>テンプレートなし</div>
                  ) : (templatesData?.templates ?? []).map((tmpl) => (
                    <label key={tmpl} className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#FAFAFA] text-xs" style={{ color: "#374151" }}>
                      <input
                        type="checkbox"
                        checked={selectedTemplates.includes(tmpl)}
                        onChange={() => setSelectedTemplates((prev) => prev.includes(tmpl) ? prev.filter((t) => t !== tmpl) : [...prev, tmpl])}
                        style={{ accentColor: YELLOW }}
                      />
                      <span className="truncate" style={{ maxWidth: 190 }}>{tmpl}</span>
                    </label>
                  ))}
                  {selectedTemplates.length > 0 && (
                    <div style={{ borderTop: "1px solid #F3F4F6" }}>
                      <button onClick={() => { setSelectedTemplates([]); setTemplateDropdownOpen(false); }} className="w-full px-4 py-2.5 text-xs text-left" style={{ color: "#9CA3AF" }}>クリア</button>
                    </div>
                  )}
                </div>
              )}
            </div>}

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

            {/* ── Compare mode toggle — hidden in matrix mode ── */}
            {groupBy !== "matrix" && <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-semibold shrink-0" style={{ color: "#9CA3AF" }}>比較軸</span>
              <button
                onClick={() => setCompareMode("none")}
                className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-all"
                style={compareMode === "none"
                  ? { background: "#F3F4F6", color: "#374151", border: "1.5px solid #D1D5DB" }
                  : { background: "#fff", color: "#9CA3AF", border: "1px solid #EBEBEB" }}
              >
                なし
              </button>
              <button
                onClick={() => setCompareMode("change")}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg font-medium transition-all whitespace-nowrap"
                style={compareMode === "change"
                  ? { background: "#FDF4FF", color: CHANGE_COLOR, border: `1.5px solid ${CHANGE_COLOR}` }
                  : { background: "#fff", color: "#9CA3AF", border: "1px solid #EBEBEB" }}
              >
                <GitCommitHorizontal size={11} /> 施策タイミング
              </button>
            </div>}
          </div>

          {/* ── Campaign picker ── */}
          {compareMode === "change" && groupBy !== "matrix" && (
            <CampaignPicker
              campaigns={allCampaigns}
              selectedId={selectedChangeId}
              onSelect={setSelectedChangeId}
            />
          )}

          {/* ── Matrix view ── */}
          {groupBy === "matrix" ? (
            <MatrixView
              availableScenarios={availableSegments}
              availableTemplates={templatesData?.templates ?? []}
              dateRange={dateRange}
            />
          ) : isLoading ? (
            <LoadingSkeleton />
          ) : isError ? (
            <ErrorState onRetry={() => queryClient.invalidateQueries()} />
          ) : (
            <>
              {/* ── Before/After KPI row (change compare mode) ── */}
              {compareMode === "change" && selectedCampaign ? (
                <BeforeAfterKpiRow
                  campaign={selectedCampaign}
                  before={beforeSummary}
                  after={afterSummary}
                />
              ) : (
                /* Normal KPI cards */
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
              )}

              {/* ── Chart ── */}
              <div
                className="bg-white rounded-xl p-4 md:p-6"
                style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                data-testid="card-chart"
              >
                <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-bold" style={{ color: "#1A1A1A" }}>
                      {compareMode === "change" ? "前後トレンド" : "配信トレンド"}
                    </div>
                    <div className="text-xs mt-0.5 hidden sm:block" style={{ color: "#9CA3AF" }}>
                      {compareMode === "change"
                        ? `破線 = 施策開始（${selectedCampaign?.startDate ?? ""}）　青 = 施策前 / ピンク = 施策後`
                        : "棒：配信数　折れ線：開封率 / クリック率"}
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
                          {/* Campaign split reference line */}
                          {compareMode === "change" && splitDate && (
                            <ReferenceLine
                              yAxisId="left"
                              x={splitDate}
                              stroke={CHANGE_COLOR}
                              strokeDasharray="5 4"
                              strokeWidth={2}
                              label={{ value: "施策開始", fill: CHANGE_COLOR, fontSize: 9, position: "insideTopRight" }}
                            />
                          )}
                          {/* Campaign reference lines */}
                          {campaignLines.map((c, i) => (
                            <ReferenceLine
                              key={c.id}
                              yAxisId="left"
                              x={c.startDate.replace(/-/g, "/")}
                              stroke={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]}
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                              label={{ value: c.title.slice(0, 8), fill: CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length], fontSize: 8, position: "insideTopLeft" }}
                            />
                          ))}
                          <Bar yAxisId="left" dataKey="deliveryCount" name="配信数" radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.9}>
                            {items.map((item, index) => (
                              <Cell key={index} fill={getBarFill(item.label)} />
                            ))}
                          </Bar>
                          <Line
                            yAxisId="right" type="monotone" dataKey="openRate" name="開封率"
                            stroke={compareMode === "change" ? "#94A3B8" : "#60A5FA"}
                            strokeWidth={2} dot={false} activeDot={{ r: 4 }}
                            strokeDasharray={compareMode === "change" ? "4 2" : undefined}
                          />
                          <Line yAxisId="right" type="monotone" dataKey="clickRate" name="クリック率" stroke="#34D399" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 md:gap-6 mt-3 pt-3 flex-wrap" style={{ borderTop: "1px solid #F3F4F6" }}>
                      {compareMode === "change" ? (
                        <>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: BEFORE_COLOR }} /> 施策前・配信数
                          </div>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: AFTER_COLOR }} /> 施策後・配信数
                          </div>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="4,2" /></svg>
                            開封率
                          </div>
                          <div className="flex items-center gap-1.5 text-xs ml-auto" style={{ color: CHANGE_COLOR }}>
                            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={CHANGE_COLOR} strokeWidth="1.5" strokeDasharray="5,4" /></svg>
                            施策開始
                          </div>
                        </>
                      ) : (
                        <>
                          {[{ color: YELLOW, label: "配信数" }, { color: "#60A5FA", label: "開封率" }, { color: "#34D399", label: "クリック率" }].map((l) => (
                            <div key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />{l.label}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* ── Tables ── */}
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
                    <MetricsTable items={group.items} groupBy={effectiveGroupBy} showComparison={showComparison} getRowPhase={getRowPhase} />
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
                  <MetricsTable items={items} groupBy={effectiveGroupBy} showComparison={showComparison} getRowPhase={getRowPhase} />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {segmentDropdownOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setSegmentDropdownOpen(false)} />
      )}
      {templateDropdownOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setTemplateDropdownOpen(false)} />
      )}
    </>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────
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
      style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
      <div className="text-sm font-medium mb-2" style={{ color: "#DC2626" }}>データの取得に失敗しました</div>
      <button
        onClick={onRetry}
        className="text-xs px-3 py-1.5 rounded-lg font-medium"
        style={{ background: "#DC2626", color: "#fff" }}
      >
        再試行
      </button>
    </div>
  );
}
