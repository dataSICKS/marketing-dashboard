import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from "react";
import {
  useGetNewsletterData,
  useSyncNewsletter,
  useGetNewsletterTemplates,
  useGetNewsletterMatrix,
  getGetNewsletterMatrixQueryKey,
  getGetNewsletterDataQueryKey,
  useListCampaigns,
} from "@workspace/api-client-react";
import type {
  GetNewsletterDataGroupBy,
  NewsletterMetrics,
  NewsletterScenarioGroup,
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
  LabelList,
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
  Pencil,
  Check,
} from "lucide-react";
import DateRangePicker, { type DateRange } from "@/components/DateRangePicker";
import NewsletterMatrixColumns from "@/components/NewsletterMatrixColumns";
import NewsletterRowSegment from "@/components/NewsletterRowSegment";
import { timePeriod, focusRange, formatChartRate, formatChartValueLabel, CHART_METRICS, type ChartMetric } from "@/lib/newsletter-chart";

type GroupBy = GetNewsletterDataGroupBy;
type TabMode = GroupBy | "matrix";
type TimeGroupBy = "day" | "week" | "month";
const TIME_LABELS = { day: "日別", week: "週別", month: "月別" } as const;

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";
const BEFORE_COLOR = "#60A5FA";
const AFTER_COLOR = "#F472B6";
const CHANGE_COLOR = "#A855F7";
const CAMPAIGN_COLORS = ["#F97316", "#10B981", "#EC4899", "#3B82F6", "#8B5CF6", "#14B8A6"];
const SERIES_COLORS = ["#6366F1", "#F59E0B", "#10B981", "#3B82F6", "#EC4899", "#8B5CF6", "#14B8A6", "#F97316", "#EF4444", "#84CC16"];

const MATRIX_METRICS = CHART_METRICS;

const GROUP_TABS: { value: TabMode; label: string }[] = [
  { value: "matrix", label: "マトリクス" },
  { value: "day", label: "配信数推移" },
  { value: "scenario", label: "シナリオ別" },
  { value: "template", label: "テンプレ別" },
];

// ─── Preset helpers ───────────────────────────────────────────────
interface Preset {
  id: string;
  name: string;
  groupBy: TabMode;
  timeGroupBy?: TimeGroupBy;
  chartMetric?: ChartMetric | "default";
  matrixMetrics?: string[];
  matrixMetricLayout?: "rows" | "columns";
  matrixShowChart?: boolean;
  focusPeriods?: number | "all";
  dateFrom?: string;
  dateTo?: string;
  /** Legacy field: old presets stored segment values here. */
  segments?: string[];
  scenarios?: string[];
  templates: string[];
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
  selectedId: string | null;
  onSelect: (id: string) => void;
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
type SortKey = "label" | "deliveryCount" | "openCount" | "openRate" | "clickCount" | "clickRate" | "cvCount" | "cvr";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col ml-1 leading-none" style={{ color: active ? "#1A1A1A" : "#D1D5DB" }}>
      <span style={{ lineHeight: 1, fontSize: 8, opacity: active && dir === "asc" ? 1 : 0.4 }}>▲</span>
      <span style={{ lineHeight: 1, fontSize: 8, opacity: active && dir === "desc" ? 1 : 0.4 }}>▼</span>
    </span>
  );
}

function MetricsTable({
  items, groupBy, showComparison, getRowPhase, scenarioGroups,
}: {
  items: NewsletterMetrics[];
  groupBy: GroupBy;
  showComparison: boolean;
  getRowPhase?: (label: string) => "before" | "after" | null;
  scenarioGroups?: NewsletterScenarioGroup[];
}) {
  const showSubject = groupBy === "scenario" || groupBy === "template" || groupBy === "day";
  const showPeriod = items.some((item) => item.period);
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortItems = useCallback((source: NewsletterMetrics[]) => {
    const arr = [...source];
    arr.sort((a, b) => {
      const av = a[sortKey as keyof NewsletterMetrics] ?? 0;
      const bv = b[sortKey as keyof NewsletterMetrics] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv, "ja") : bv.localeCompare(av, "ja");
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [sortKey, sortDir]);

  const sorted = useMemo(() => sortItems(items), [items, sortItems]);
  const sortedGroups = useMemo(
    () => scenarioGroups?.map((group) => ({ ...group, items: sortItems(group.items) })),
    [scenarioGroups, sortItems],
  );

  const colSpan = (showSubject ? 9 : 8) + (showPeriod ? 1 : 0);

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead
      className="text-xs font-semibold whitespace-nowrap cursor-pointer select-none"
      style={{ color: sortKey === k ? "#374151" : "#9CA3AF" }}
      onClick={() => handleSort(k)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <SortIcon active={sortKey === k} dir={sortDir} />
      </span>
    </TableHead>
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <TableHead className="text-xs font-semibold cursor-pointer select-none min-w-[140px]" onClick={() => handleSort("label")} style={{ color: "#9CA3AF" }}>
              ラベル{sortKey === "label" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
            </TableHead>
            {showPeriod && <TableHead className="text-xs font-semibold whitespace-nowrap" style={{ color: "#9CA3AF" }}>期間</TableHead>}
            {showSubject && <TableHead className="text-xs font-semibold whitespace-nowrap min-w-[200px]" style={{ color: "#9CA3AF" }}>件名</TableHead>}
            <Th label="配信数" k="deliveryCount" />
            <Th label="開封数" k="openCount" />
            <Th label="開封率" k="openRate" />
            <Th label="クリック数" k="clickCount" />
            <Th label="クリック率" k="clickRate" />
            <Th label="CV数" k="cvCount" />
            <Th label="CVR" k="cvr" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedGroups ? (
            sortedGroups.map((group) => (
              <Fragment key={group.scenarioName}>
                {group.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="text-center py-6 text-sm" style={{ color: "#bbb" }}>
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : group.items.map((item, i) => {
                  const phase = getRowPhase ? getRowPhase(item.label) : null;
                  return (
                    <TableRow
                      key={`${group.scenarioName}-${item.label}-${i}`}
                      className="hover:bg-[#FAFAFA] transition-colors"
                      style={{
                        borderBottom: "1px solid #F9FAFB",
                        background: phase === "before" ? "#EFF6FF" : phase === "after" ? "#FDF2F8" : undefined,
                      }}
                    >
                      <TableCell className="text-sm font-medium break-words min-w-[140px]" style={{ color: phase === "before" ? "#1D4ED8" : phase === "after" ? "#9D174D" : "#6B7280" }}>
                        {phase && (
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0 align-middle" style={{ background: phase === "before" ? BEFORE_COLOR : AFTER_COLOR }} />
                        )}
                        {item.label}{item.periodEnd && ` 〜 ${item.periodEnd}`}
                      </TableCell>
                      {showPeriod && <TableCell className="text-xs whitespace-nowrap">{item.period}</TableCell>}
                      {showSubject && (
                        <TableCell className="text-xs min-w-[200px] break-words whitespace-pre-line" style={{ color: "#374151" }}>
                          {item.subject ?? "（件名未取得）"}
                        </TableCell>
                      )}
                      <TableCell className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                        {formatNumber(item.deliveryCount)}
                        {showComparison && <DiffBadge current={item.deliveryCount} prev={item.prevDeliveryCount} />}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                        {formatNumber(item.openCount)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                        {formatPercent(item.openRate)}
                        {showComparison && <DiffBadge current={item.openRate} prev={item.prevOpenRate} />}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                        {formatNumber(item.clickCount)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                        {formatPercent(item.clickRate)}
                        {showComparison && <DiffBadge current={item.clickRate} prev={item.prevClickRate} />}
                      </TableCell>
                      <TableCell className="text-sm font-semibold whitespace-nowrap" style={{ color: "#1A1A1A" }}>
                        {formatNumber(item.cvCount)}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                        {formatPercent(item.cvr)}
                        {showComparison && <DiffBadge current={item.cvr} prev={item.prevCvr} />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))
          ) : sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center py-10 text-sm" style={{ color: "#bbb" }}>
                データがありません
              </TableCell>
            </TableRow>
          ) : sorted.map((item, i) => {
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
                <TableCell className="text-sm font-medium break-words min-w-[140px]" style={{ color: phase === "before" ? "#1D4ED8" : phase === "after" ? "#9D174D" : "#6B7280" }}>
                  {phase && (
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0 align-middle" style={{ background: phase === "before" ? BEFORE_COLOR : AFTER_COLOR }} />
                  )}
                  {item.label}{item.periodEnd && ` 〜 ${item.periodEnd}`}
                </TableCell>
                {showPeriod && <TableCell className="text-xs whitespace-nowrap">{item.period}</TableCell>}
                {showSubject && (
                  <TableCell className="text-xs min-w-[200px] break-words whitespace-pre-line" style={{ color: "#374151" }}>
                    {item.subject ?? "（件名未取得）"}
                  </TableCell>
                )}
                <TableCell className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                  {formatNumber(item.deliveryCount)}
                  {showComparison && <DiffBadge current={item.deliveryCount} prev={item.prevDeliveryCount} />}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                  {formatNumber(item.openCount)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                  {formatPercent(item.openRate)}
                  {showComparison && <DiffBadge current={item.openRate} prev={item.prevOpenRate} />}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                  {formatNumber(item.clickCount)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                  {formatPercent(item.clickRate)}
                  {showComparison && <DiffBadge current={item.clickRate} prev={item.prevClickRate} />}
                </TableCell>
                <TableCell className="text-sm font-semibold whitespace-nowrap" style={{ color: "#1A1A1A" }}>
                  {formatNumber(item.cvCount)}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap" style={{ color: "#374151" }}>
                  {formatPercent(item.cvr)}
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
  onRename,
}: {
  presets: Preset[];
  activeId: string | null;
  onSelect: (p: Preset) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const suppressBlurRef = useRef(false); // 保存ボタンクリック時に blur 保存を抑制
  const cancelRef = useRef(false);       // キャンセル時に blur 保存を抑制

  // Focus the input as soon as the save form opens (autoFocus is unreliable in iframes)
  useEffect(() => {
    if (saving) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [saving]);

  const handleSave = () => {
    const name = newName.trim();
    console.log("[PresetBar] handleSave name=", JSON.stringify(name));
    if (!name) { setSaving(false); setNewName(""); return; }
    setSaving(false);
    setNewName("");
    onSave(name);
  };

  const handleBlur = () => {
    if (suppressBlurRef.current || cancelRef.current) {
      suppressBlurRef.current = false;
      cancelRef.current = false;
      return;
    }
    handleSave();
  };

  const handleCancel = () => {
    cancelRef.current = false;
    suppressBlurRef.current = false;
    setSaving(false);
    setNewName("");
  };

  const startRename = (p: Preset) => {
    setRenamingId(p.id);
    setRenameValue(p.name);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div
      className="bg-white px-4 md:px-8 py-2 flex items-center gap-3 min-w-0"
      style={{ borderBottom: "1px solid #F3F4F6" }}
    >
      <span className="text-[10px] font-semibold shrink-0" style={{ color: "#9CA3AF" }}>
        保存済みビュー
      </span>

      {/* Preset chips — horizontal scroll */}
      <div className="flex-1 flex items-center gap-1.5 overflow-x-auto min-w-0" style={{ scrollbarWidth: "none" }}>
        {presets.map((p) => (
          <div key={p.id} className="flex items-center shrink-0 rounded-full overflow-hidden"
            style={{ border: `1.5px solid ${activeId === p.id ? YELLOW : "#E5E7EB"}` }}>
            {renamingId === p.id ? (
              <div className="flex items-center gap-1 px-1.5 py-0.5">
                <input
                  className="text-xs outline-none bg-transparent"
                  style={{ width: 100, color: "#1A1A1A" }}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                  }}
                  onBlur={commitRename}
                  autoFocus
                />
                <button onClick={commitRename} className="flex items-center" style={{ color: YELLOW_DARK }}>
                  <Check size={11} />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onSelect(p)}
                  className="flex items-center px-2.5 py-1 text-xs font-medium whitespace-nowrap"
                  style={activeId === p.id ? { background: YELLOW, color: "#fff" } : { color: "#6B7280" }}
                >
                  {p.name}
                </button>
                <button
                  onClick={() => startRename(p)}
                  className="flex items-center px-1 py-1"
                  style={{ color: activeId === p.id ? "#fff9" : "#D1D5DB" }}
                  title="名前を変更"
                >
                  <Pencil size={9} />
                </button>
                <button
                  onClick={() => onDelete(p.id)}
                  className="flex items-center px-1.5 py-1"
                  style={{ color: activeId === p.id ? "#fff9" : "#D1D5DB" }}
                  title="削除"
                >
                  <Trash2 size={9} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Save button / inline form — always visible, outside scroll area ── */}
      {saving ? (
        <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg"
          style={{ border: `1.5px solid ${YELLOW}`, background: "#fff", boxShadow: "0 1px 6px rgba(0,0,0,0.10)" }}>
          <input
            ref={inputRef}
            className="text-xs"
            style={{ width: 130, color: "#1A1A1A", background: "transparent", outline: "none", border: "none" }}
            placeholder="ビュー名を入力…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleSave(); }
              if (e.key === "Escape") handleCancel();
            }}
            onBlur={handleBlur}
          />
          <button
            onMouseDown={() => { suppressBlurRef.current = true; }}
            onClick={handleSave}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium shrink-0"
            style={{ background: YELLOW, color: "#fff" }}
          >
            保存
          </button>
          <button
            onMouseDown={() => { cancelRef.current = true; }}
            onClick={handleCancel}
            className="flex items-center shrink-0"
            style={{ color: "#9CA3AF" }}
            title="キャンセル"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSaving(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium shrink-0"
          style={{ border: `1.5px dashed ${YELLOW}`, color: YELLOW_DARK, background: YELLOW_LIGHT }}
        >
          <BookmarkPlus size={11} /> 現在の設定を保存
        </button>
      )}
    </div>
  );
}

// ─── Searchable Multi-Select ──────────────────────────────────────
function SearchableMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase())
  );
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const close = () => { setOpen(false); setQuery(""); };

  return (
    <>
      {open && <div className="fixed inset-0 z-20" onClick={close} />}
      <div className="relative">
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
          style={selected.length > 0
            ? { background: YELLOW_LIGHT, color: YELLOW_DARK, border: `1px solid ${YELLOW}` }
            : { background: "#fff", color: "#6B7280", border: "1px solid #EBEBEB", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
        >
          {selected.length > 0 ? `${label} (${selected.length})` : label}
          <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
        </button>
        {open && (
          <div className="absolute top-full mt-1 left-0 z-30 bg-white rounded-xl shadow-lg overflow-hidden"
            style={{ border: "1px solid #EBEBEB", minWidth: 220 }}>
            <div className="p-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="検索..."
                autoFocus
                className="w-full text-xs px-2.5 py-1.5 rounded-lg outline-none"
                style={{ border: "1px solid #E5E7EB", color: "#374151", background: "#FAFAFA" }}
              />
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
              {filtered.length === 0 ? (
                <div className="px-4 py-3 text-xs" style={{ color: "#9CA3AF" }}>該当なし</div>
              ) : filtered.map((opt) => (
                <label key={opt.value}
                  className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#FAFAFA] text-xs"
                  style={{ color: "#374151" }}>
                  <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)}
                    style={{ accentColor: YELLOW }} />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))}
            </div>
            {selected.length > 0 && (
              <div style={{ borderTop: "1px solid #F3F4F6" }}>
                <button onClick={() => { onChange([]); close(); }}
                  className="w-full px-4 py-2.5 text-xs text-left" style={{ color: "#9CA3AF" }}>クリア</button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Matrix View ─────────────────────────────────────────────────
function MatrixView({
  availableScenarios,
  availableTemplates,
  selectedScenarios,
  onScenariosChange,
  selectedTemplates,
  onTemplatesChange,
  dateRange,
  compareMode,
  selectedCampaign,
  chartHeight,
  onChartHeightChange,
  timeGroupBy,
  selectedMetrics,
  setSelectedMetrics,
  metricLayout,
  setMetricLayout,
  showChart,
  setShowChart,
}: {
  availableScenarios: string[];
  availableTemplates: string[];
  selectedScenarios: string[];
  onScenariosChange: (values: string[]) => void;
  selectedTemplates: string[];
  onTemplatesChange: (values: string[]) => void;
  dateRange: DateRange | null;
  compareMode: "none" | "date" | "change";
  selectedCampaign: Campaign | null;
  chartHeight: number;
  onChartHeightChange: (h: number) => void;
  timeGroupBy: TimeGroupBy;
  selectedMetrics: string[];
  setSelectedMetrics: (metrics: string[]) => void;
  metricLayout: "rows" | "columns";
  setMetricLayout: (layout: "rows" | "columns") => void;
  showChart: boolean;
  setShowChart: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const hasSelections = selectedScenarios.length > 0 || selectedTemplates.length > 0;
  const hasMetrics = selectedMetrics.length > 0;
  const isCompare = compareMode === "change" && !!selectedCampaign;
  const splitDate = selectedCampaign?.startDate ?? null;

  const baseParams = {
    timeGroupBy,
    anchorDate: isCompare ? selectedCampaign?.startDate : undefined,
    metrics: selectedMetrics.join(","),
    scenarios: selectedScenarios.join("|"),
    templates: selectedTemplates.join("|"),
  };

  const toIso = (s: string | undefined) => s?.replace(/\//g, "-");
  const dayBeforeSplit = splitDate
    ? new Date(Date.parse(`${toIso(splitDate)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    : undefined;
  const matrixParams = { ...baseParams, dateFrom: toIso(dateRange?.from), dateTo: toIso(dateRange?.to) };
  const beforeParams = { ...baseParams, dateFrom: toIso(dateRange?.from),
    dateTo: [dayBeforeSplit, toIso(dateRange?.to)].filter((date): date is string => !!date).sort()[0] };
  const afterParams  = { ...baseParams,
    dateFrom: [toIso(splitDate ?? undefined), toIso(dateRange?.from)].filter((date): date is string => !!date).sort().at(-1),
    dateTo: toIso(dateRange?.to) };

  const { data, isLoading } = useGetNewsletterMatrix(matrixParams, {
    query: {
      enabled: !isCompare && hasSelections && hasMetrics,
      queryKey: getGetNewsletterMatrixQueryKey(matrixParams),
    },
  });
  const { data: beforeData, isLoading: beforeLoading } = useGetNewsletterMatrix(beforeParams, {
    query: {
      enabled: isCompare && hasSelections && hasMetrics,
      queryKey: getGetNewsletterMatrixQueryKey(beforeParams),
    },
  });
  const { data: afterData, isLoading: afterLoading } = useGetNewsletterMatrix(afterParams, {
    query: {
      enabled: isCompare && hasSelections && hasMetrics,
      queryKey: getGetNewsletterMatrixQueryKey(afterParams),
    },
  });

  const series: MatrixResponse["series"] = isCompare
    ? (beforeData?.series ?? afterData?.series ?? []).map((series) => {
        const after = afterData?.series.find((other) => other.key === series.key && other.type === series.type);
        const metricValues = { ...series.metricValues };
        for (const metric of MATRIX_METRICS) {
          metricValues[metric.value] = { ...series.metricValues[metric.value], ...after?.metricValues[metric.value] };
        }
        const latestSegment = after?.latestSegment && (!series.latestSegment || after.latestSegment.date >= series.latestSegment.date)
          ? after.latestSegment : series.latestSegment;
        return { ...series, latestSegment, metricValues };
      })
    : (data?.series ?? []);
  const timePeriods: string[] = isCompare
    ? [...new Set([...(beforeData?.timePeriods ?? []), ...(afterData?.timePeriods ?? []), ...(splitDate ? [timePeriod(splitDate, timeGroupBy, splitDate)] : [])])].sort()
    : (data?.timePeriods ?? []);
  const beforePeriods: string[] = isCompare ? (beforeData?.timePeriods ?? []) : [];
  const afterPeriods:  string[] = isCompare ? (afterData?.timePeriods  ?? []) : [];

  const seriesLegend = useMemo(() => series.map((s, i) => ({
    ...s,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  })), [series]);

  const scenarioOpts = availableScenarios.map((s) => ({ value: s, label: s }));
  const templateOpts = availableTemplates.map((t) => ({ value: t, label: t }));
  const metricOpts = MATRIX_METRICS.map((m) => ({ value: m.value, label: m.label }));

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* ── Controls ── */}
      <div className="bg-white rounded-xl px-4 md:px-5 py-3 md:py-4 flex flex-wrap items-center gap-2"
        style={{ border: "1px solid #EBEBEB" }}>
        <SearchableMultiSelect
          label="シナリオ"
          options={scenarioOpts}
          selected={selectedScenarios}
          onChange={onScenariosChange}
        />
        <SearchableMultiSelect
          label="テンプレ"
          options={templateOpts}
          selected={selectedTemplates}
          onChange={onTemplatesChange}
        />
        <SearchableMultiSelect
          label="指標"
          options={metricOpts}
          selected={selectedMetrics}
          onChange={setSelectedMetrics}
        />
        <button type="button" aria-expanded={showChart} aria-controls="matrix-trend-chart"
          onClick={() => setShowChart((visible) => !visible)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50">
          {showChart ? "グラフを非表示" : "グラフを表示"}
        </button>
        <div role="group" aria-label="指標の配置" className="ml-auto flex items-center gap-1 rounded-lg bg-gray-100 p-1 text-xs">
          {([{ value: "rows", label: "指標を行に表示" }, { value: "columns", label: "指標を列に表示" }] as const).map((layout) => (
            <button key={layout.value} type="button" aria-pressed={metricLayout === layout.value}
              onClick={() => setMetricLayout(layout.value)}
              className={`rounded-md px-3 py-2 transition-colors ${metricLayout === layout.value ? "bg-white text-gray-900 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-900"}`}>
              {layout.label}
            </button>
          ))}
        </div>
      </div>

      {!hasSelections ? (
        <div className="bg-white rounded-xl p-10 flex items-center justify-center text-sm"
          style={{ border: "1px solid #EBEBEB", color: "#9CA3AF" }}>
          シナリオまたはテンプレを選択してください
        </div>
      ) : !hasMetrics ? (
        <div className="bg-white rounded-xl p-10 flex items-center justify-center text-sm"
          style={{ border: "1px solid #EBEBEB", color: "#9CA3AF" }}>
          指標を選択してください
        </div>
      ) : (isCompare ? beforeLoading || afterLoading : isLoading) ? (
        <LoadingSkeleton />
      ) : (isCompare ? beforePeriods.length === 0 && afterPeriods.length === 0 : timePeriods.length === 0) ? (
        <div className="bg-white rounded-xl p-10 flex flex-col items-center justify-center gap-2 text-sm"
          style={{ border: "1px solid #EBEBEB", color: "#9CA3AF" }}>
          {dateRange
            ? <>
                <span>選択した期間（{dateRange.from}〜{dateRange.to}）にデータがありません</span>
                <span className="text-xs">スプレッドシートのデータ期間を確認するか、期間フィルタをリセットしてください</span>
              </>
            : <span>データなし</span>
          }
        </div>
      ) : (
        <>
          {/* ── Shared legend ── */}
          {showChart && <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
            {seriesLegend.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: "#374151" }}>
                <svg width="14" height="2" viewBox="0 0 14 2">
                  <line x1="0" y1="1" x2="14" y2="1" stroke={s.color} strokeWidth="2" />
                </svg>
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                  {s.type === "scenario" ? "シナリオ" : "テンプレ"}
                </span>
                <span>{s.key}</span>
              </div>
            ))}
          </div>}

          {/* ── Merged chart (all series × metrics) ── */}
          {showChart && (() => {
            const LINE_DASHES = ["", "5 5", "2 4", "8 3 2 3", "1 3"];
            const hasRate = selectedMetrics.some(
              (mk) => MATRIX_METRICS.find((m) => m.value === mk)?.isRate
            );
            const hasCount = selectedMetrics.some(
              (mk) => !MATRIX_METRICS.find((m) => m.value === mk)?.isRate
            );
            const isMixed = hasRate && hasCount;
            const leftFmt = !isMixed && hasRate ? formatChartRate : formatNumber;
            const yAxisId = (mk: string) => {
              if (!isMixed) return "left";
              return MATRIX_METRICS.find((m) => m.value === mk)?.isRate ? "right" : "left";
            };
            const mergedChartData = timePeriods.map((period) => {
              const pt: Record<string, string | number | null> = { period };
              for (const s of series) {
                for (const mk of selectedMetrics) {
                  pt[`${s.key}__${mk}`] = s.metricValues[mk as keyof typeof s.metricValues]?.[period] ?? null;
                }
              }
              return pt;
            });
            return (
              <div id="matrix-trend-chart" className="bg-white rounded-xl p-4 md:p-6" style={{ border: "1px solid #EBEBEB" }}>
                <div className="text-sm font-bold mb-4" style={{ color: "#1A1A1A" }}>トレンド</div>
                <div style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={mergedChartData} margin={{ top: 28, right: isMixed ? 52 : 28, left: 8, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="period" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
                      {isCompare && splitDate && <ReferenceLine yAxisId="left" x={timePeriod(splitDate, timeGroupBy, splitDate)}
                        stroke={CHANGE_COLOR} strokeDasharray="5 4" label={{ value: "施策開始", fill: CHANGE_COLOR, fontSize: 9 }} />}
                      <YAxis yAxisId="left" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                        domain={!isMixed && hasRate ? [0, (maximum: number) => maximum > 0 ? maximum * 1.15 : 0.01] : [0, "auto"]}
                        tickFormatter={(v) => leftFmt(v as number)} width={52} />
                      {isMixed && (
                        <YAxis yAxisId="right" orientation="right" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                          domain={[0, (maximum: number) => maximum > 0 ? maximum * 1.15 : 0.01]}
                          tickFormatter={(v) => formatChartRate(v as number)} width={58} />
                      )}
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #EBEBEB", borderRadius: 10, fontSize: 12 }}
                        formatter={(val: number, name: string) => {
                          const [, mk] = name.split("__");
                          const mDef = MATRIX_METRICS.find((m) => m.value === mk) ?? MATRIX_METRICS[0];
                          const seriesKey = name.replace(`__${mk}`, "");
                          return [mDef.isRate ? formatChartRate(val) : formatNumber(val), `${seriesKey} / ${mDef.label}`];
                        }}
                      />
                      {series.flatMap((s, si) =>
                        selectedMetrics.map((mk, mi) => (
                          <Line
                            key={`${s.key}__${mk}`}
                            type="monotone"
                            dataKey={`${s.key}__${mk}`}
                            yAxisId={yAxisId(mk)}
                            stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
                            strokeWidth={2}
                            strokeDasharray={LINE_DASHES[mi % LINE_DASHES.length]}
                            dot={false}
                            connectNulls
                          >
                            <LabelList dataKey={`${s.key}__${mk}`} position={(si + mi) % 2 === 0 ? "top" : "bottom"} offset={9}
                              formatter={(value: unknown) => formatChartValueLabel(value, MATRIX_METRICS.find((m) => m.value === mk)?.isRate ?? false)}
                              fill={SERIES_COLORS[si % SERIES_COLORS.length]} fontSize={10} fontWeight={600}
                              stroke="#fff" strokeWidth={3} paintOrder="stroke" />
                          </Line>
                        ))
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <ChartResizeHandle height={chartHeight} onHeightChange={onChartHeightChange} />
                {/* chart legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                  {series.flatMap((s, si) =>
                    selectedMetrics.map((mk, mi) => {
                      const mDef = MATRIX_METRICS.find((m) => m.value === mk) ?? MATRIX_METRICS[0];
                      return (
                        <div key={`${s.key}__${mk}`} className="flex items-center gap-1.5 text-xs" style={{ color: "#374151" }}>
                          <svg width="18" height="8" viewBox="0 0 18 8">
                            <line x1="0" y1="4" x2="18" y2="4"
                              stroke={SERIES_COLORS[si % SERIES_COLORS.length]}
                              strokeWidth="2"
                              strokeDasharray={["", "5 5", "2 4", "8 3 2 3", "1 3"][mi % 5]} />
                          </svg>
                          <span>{s.key} / {mDef.label}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Combined matrix table (series × metric rows) ── */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #EBEBEB" }}>
            <div className="px-4 md:px-6 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid #F3F4F6" }}>
              <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>マトリクス表</span>
              {isCompare && selectedCampaign && (
                <span className="text-[11px] px-2 py-0.5 rounded-md font-medium"
                  style={{ background: "#F0FDF4", color: "#059669" }}>
                  施策「{selectedCampaign.title}」前後比較（{selectedCampaign.startDate}）
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              {metricLayout === "columns" ? (
                <NewsletterMatrixColumns series={series} periods={timePeriods} metrics={selectedMetrics}
                  splitPeriod={isCompare && splitDate ? timePeriod(splitDate, timeGroupBy, splitDate) : undefined} />
              ) : (
              <table className="text-xs border-collapse" style={{ width: "max-content", minWidth: "100%" }}>
                <thead>
                  {/* ── Group header row (compare mode only) ── */}
                  {isCompare && (
                    <tr style={{ background: "#F9FAFB" }}>
                      <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB", minWidth: 150 }} />
                      <th style={{ position: "sticky", left: 150, zIndex: 3, background: "#F9FAFB", minWidth: 72, borderRight: "2px solid #E5E7EB" }} />
                      <th colSpan={beforePeriods.length}
                        className="px-3 py-1.5 text-center font-semibold whitespace-nowrap text-[10px]"
                        style={{ color: "#94A3B8", background: "#F1F5F9", borderRight: "2px solid #CBD5E1", letterSpacing: "0.04em" }}>
                        ▲ 施策前
                      </th>
                      <th colSpan={afterPeriods.length}
                        className="px-3 py-1.5 text-center font-semibold whitespace-nowrap text-[10px]"
                        style={{ color: "#059669", background: "#F0FDF4", letterSpacing: "0.04em" }}>
                        ▼ 施策後
                      </th>
                    </tr>
                  )}
                  {/* ── Period header row ── */}
                  <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                    <th className="px-4 py-2.5 text-left font-medium whitespace-nowrap"
                      style={{ color: "#6B7280", minWidth: 220, position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB" }}>行</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap"
                      style={{ color: "#6B7280", minWidth: 72, position: "sticky", left: 220, zIndex: 3, background: "#F9FAFB", borderRight: isCompare ? "2px solid #E5E7EB" : "1px solid #F3F4F6" }}>指標</th>
                    {isCompare ? (
                      <>
                        {beforePeriods.map((p) => (
                          <th key={`b-${p}`} className="px-3 py-2.5 text-right font-medium whitespace-nowrap"
                            style={{ color: "#94A3B8" }}>{p}</th>
                        ))}
                        {afterPeriods.map((p, i) => (
                          <th key={`a-${p}`} className="px-3 py-2.5 text-right font-medium whitespace-nowrap"
                            style={{ color: "#059669", borderLeft: i === 0 ? "2px solid #CBD5E1" : undefined }}>{p}</th>
                        ))}
                      </>
                    ) : (
                      timePeriods.map((period) => (
                        <th key={period} className="px-3 py-2.5 text-right font-medium whitespace-nowrap"
                          style={{ color: "#6B7280" }}>{period}</th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  {series.flatMap((s, si) =>
                    selectedMetrics.map((metricKey, mi) => {
                      const mDef = MATRIX_METRICS.find((m) => m.value === metricKey) ?? MATRIX_METRICS[0];
                      const afterSeries = afterData?.series ?? [];
                      const afterS = afterSeries.find((a) => a.key === s.key && a.type === s.type);
                      const vals      = s.metricValues[metricKey as keyof typeof s.metricValues] ?? {};
                      const afterVals = (afterS?.metricValues[metricKey as keyof typeof afterS.metricValues] ?? {}) as Record<string, number>;
                      const allVals = series.flatMap((sr) =>
                        Object.values(sr.metricValues[metricKey as keyof typeof sr.metricValues] ?? {})
                      ).filter((v) => v > 0);
                      const maxV = allVals.length > 0 ? Math.max(...allVals) : 1;
                      const minV = allVals.length > 0 ? Math.min(...allVals) : 0;
                      const hBg = (val: number | undefined) => {
                        if (isCompare || val == null || maxV === minV) return "transparent";
                        return `rgba(251,191,36,${((val - minV) / (maxV - minV) * 0.45).toFixed(2)})`;
                      };
                      const isFirstMetric = mi === 0;
                      const rowBg = si % 2 === 0 ? "#fff" : "#FAFAFA";
                      const rowBorderTop = isFirstMetric
                        ? (si === 0 ? "none" : "2px solid #E5E7EB")
                        : "1px solid #F9FAFB";
                      return (
                        <tr key={`${s.key}-${metricKey}`} style={{ borderTop: rowBorderTop, background: rowBg }}>
                          {isFirstMetric ? (
                            <td rowSpan={selectedMetrics.length}
                              className="px-4 py-2 font-medium"
                              style={{ position: "sticky", left: 0, zIndex: 2, background: rowBg, color: "#1A1A1A", verticalAlign: "middle", minWidth: 220 }}>
                              <div className="flex items-start gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0 mt-1"
                                  style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                  style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                                  {s.type === "scenario" ? "SC" : "TP"}
                                </span>
                                <div className="min-w-0">
                                  <span className="break-words" style={{ wordBreak: "break-all" }}>{s.key}</span>
                                  <NewsletterRowSegment series={s} />
                                </div>
                              </div>
                            </td>
                          ) : null}
                          <td className="px-3 py-2 whitespace-nowrap"
                            style={{ position: "sticky", left: 220, zIndex: 2, background: rowBg, color: "#6B7280", borderRight: isCompare ? "2px solid #E5E7EB" : "1px solid #F3F4F6" }}>
                            {mDef.label}
                          </td>
                          {isCompare ? (
                            <>
                              {beforePeriods.map((period) => {
                                const val = (vals as Record<string, number>)[period];
                                return (
                                  <td key={`b-${period}`} className="px-3 py-2 text-right tabular-nums"
                                    style={{ color: "#64748B" }}>
                                    {val != null ? (mDef.isRate ? formatPercent(val) : formatNumber(val)) : <span style={{ color: "#D1D5DB" }}>—</span>}
                                  </td>
                                );
                              })}
                              {afterPeriods.map((period, pi) => {
                                const val = afterVals[period];
                                return (
                                  <td key={`a-${period}`} className="px-3 py-2 text-right tabular-nums"
                                    style={{ color: "#1A1A1A", borderLeft: pi === 0 ? "2px solid #CBD5E1" : undefined }}>
                                    {val != null ? (mDef.isRate ? formatPercent(val) : formatNumber(val)) : <span style={{ color: "#D1D5DB" }}>—</span>}
                                  </td>
                                );
                              })}
                            </>
                          ) : (
                            timePeriods.map((period) => {
                              const val = (vals as Record<string, number>)[period];
                              return (
                                <td key={period} className="px-3 py-2 text-right tabular-nums"
                                  style={{ background: hBg(val), color: "#1A1A1A" }}>
                                  {val != null ? (mDef.isRate ? formatPercent(val) : formatNumber(val)) : <span style={{ color: "#D1D5DB" }}>—</span>}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────
export default function Dashboard() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<TabMode>("matrix");
  const [tabGranularities, setTabGranularities] = useState<Record<TabMode, TimeGroupBy>>({
    matrix: "month", day: "day", week: "week", month: "month", scenario: "day", template: "day",
  });
  const timeGroupBy = tabGranularities[groupBy];

  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [compareRange, setCompareRange] = useState<DateRange | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(false);

  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);

  // Compare mode: "none" | "date" | "change"
  const [compareMode, setCompareMode] = useState<"none" | "date" | "change">("none");
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [focusPeriods, setFocusPeriods] = useState<number | "all">(2);
  const [chartMetric, setChartMetric] = useState<ChartMetric | "default">("default");
  const [matrixMetrics, setMatrixMetrics] = useState<string[]>(["deliveryCount"]);
  const [matrixMetricLayout, setMatrixMetricLayout] = useState<"rows" | "columns">("rows");
  const [matrixShowChart, setMatrixShowChart] = useState(true);
  const { data: campaignsData } = useListCampaigns();
  const { data: templatesData } = useGetNewsletterTemplates();
  const allCampaigns = campaignsData?.campaigns ?? [];
  const selectedCampaign = allCampaigns.find((c) => c.id === selectedChangeId) ?? null;
  const splitDate = selectedCampaign ? selectedCampaign.startDate.replace(/-/g, "/") : null;
  const anchorDate = compareMode === "change" ? selectedCampaign?.startDate : undefined;
  const focusBounds = anchorDate && focusPeriods !== "all" ? focusRange(anchorDate, timeGroupBy, focusPeriods) : null;
  const requestFrom = [dateRange?.from.replace(/\//g, "-"), focusBounds?.from].filter((s): s is string => !!s).sort().at(-1);
  const requestTo = [dateRange?.to.replace(/\//g, "-"), focusBounds?.to].filter((s): s is string => !!s).sort()[0];
  const effectiveDateRange = requestFrom && requestTo ? { from: requestFrom, to: requestTo } : dateRange;
  const visibleMetrics = CHART_METRICS.filter((metric) => chartMetric === "default"
    ? (groupBy === "day" ? metric.value === "deliveryCount" : ["deliveryCount", "openRate", "clickRate"].includes(metric.value))
    : metric.value === chartMetric);
  const hasCountMetric = visibleMetrics.some((metric) => !metric.isRate);
  const hasRateMetric = visibleMetrics.some((metric) => metric.isRate);

  // Chart height
  const [chartHeight, setChartHeight] = useState(260);

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

  // Campaign mode is a timeline aligned to its start date, independent of category tabs.
  const effectiveGroupBy: GroupBy = compareMode === "change" || groupBy === "matrix" || ["day", "week", "month"].includes(groupBy) ? timeGroupBy : groupBy;
  // Follow the selected tab even when comparison forces daily aggregation.
  const activeTabValue: TabMode = groupBy;

  const slashToHyphen = (s: string | undefined) => s?.replace(/\//g, "-");
  const params = {
    groupBy: effectiveGroupBy,
    anchorDate,
    timeGroupBy: effectiveGroupBy === "scenario" || effectiveGroupBy === "template" ? timeGroupBy : undefined,
    dateFrom: requestFrom,
    dateTo: requestTo,
    scenarioName: selectedScenarios.length > 0 ? selectedScenarios.join("|") : undefined,
    templateName: selectedTemplates.length > 0 ? selectedTemplates.join("|") : undefined,
    compareFrom: compareMode === "date" && compareEnabled && compareRange ? slashToHyphen(compareRange.from) : undefined,
    compareTo: compareMode === "date" && compareEnabled && compareRange ? slashToHyphen(compareRange.to) : undefined,
  };

  const { data, isLoading, isError } = useGetNewsletterData(params, {
    query: { queryKey: getGetNewsletterDataQueryKey(params) },
  });
  // Keep campaign before/after KPI boundaries exact even when the chart uses weeks/months.
  const phaseParams = { ...params, groupBy: "day" as const, timeGroupBy: undefined, anchorDate: undefined };
  const { data: phaseData, isLoading: phaseLoading, isError: phaseError } = useGetNewsletterData(phaseParams, {
    query: { queryKey: getGetNewsletterDataQueryKey(phaseParams), enabled: compareMode === "change" },
  });


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
        queryClient.invalidateQueries({ queryKey: ["/api/newsletter/templates"] });
        queryClient.invalidateQueries({ queryKey: ["/api/newsletter/matrix"] });
      },
    },
  });

  const summary = data?.summary;
  const items = data?.items ?? [];
  const subjectChart = effectiveGroupBy === "scenario" || effectiveGroupBy === "template";
  const baseChartItems = items.map((item) => ({
    ...item,
    chartKey: subjectChart ? JSON.stringify([`${item.period ?? ""} / ${item.label}`, item.subject ?? "（件名未取得）"]) : item.label,
  }));
  // Keep the campaign marker visible even if its first bucket has no exports.
  const anchorKey = anchorDate ? timePeriod(anchorDate, timeGroupBy, anchorDate) : undefined;
  const chartItems = anchorKey && !baseChartItems.some((item) => item.chartKey === anchorKey)
    ? [...baseChartItems, { label: anchorKey, chartKey: anchorKey, deliveryCount: null, openCount: null, clickCount: null, openRate: null, clickRate: null, cvr: null, cvCount: null }]
      .sort((a, b) => a.chartKey.localeCompare(b.chartKey))
    : baseChartItems;
  const scenarioGroups: NewsletterScenarioGroup[] = (data?.scenarioGroups ?? []) as NewsletterScenarioGroup[];
  const lastSyncedAt = data?.lastSyncedAt;
  const availableScenarios = data?.availableScenarios ?? [];
  const availableTemplates = templatesData?.templates ?? [];
  const showComparison = compareMode === "date" && compareEnabled && !!compareRange;

  // Old presets can contain values from the former segment-based filter.
  // Keep only scenario names that are valid for the current dataset.
  useEffect(() => {
    if (!data) return;
    setSelectedScenarios((current) => {
      const valid = current.filter((scenario) => availableScenarios.includes(scenario));
      return valid.length === current.length ? current : valid;
    });
  }, [data, availableScenarios]);

  useEffect(() => {
    if (!templatesData) return;
    setSelectedTemplates((current) => {
      const valid = current.filter((template) => availableTemplates.includes(template));
      return valid.length === current.length ? current : valid;
    });
  }, [templatesData, availableTemplates]);


  // Before/after splits for change compare mode
  const beforeItems = compareMode === "change" && splitDate
    ? (phaseData?.items ?? []).filter((item) => item.label < splitDate)
    : [];
  const afterItems = compareMode === "change" && splitDate
    ? (phaseData?.items ?? []).filter((item) => item.label >= splitDate)
    : [];
  const beforeSummary = sumItems(beforeItems);
  const afterSummary = sumItems(afterItems);

  // Campaigns that overlap with current item labels
  const campaignLines = useMemo<Campaign[]>(() => {
    const camps = campaignsData?.campaigns ?? [];
    if (subjectChart || compareMode === "change") return [];
    return camps.filter((c) => items.some((item) => item.label === timePeriod(c.startDate, timeGroupBy)));
  }, [campaignsData, items, subjectChart, timeGroupBy, compareMode]);

  // Row phase for table coloring
  const getRowPhase = useCallback((label: string): "before" | "after" | null => {
    if (compareMode !== "change" || !splitDate) return null;
    return label < splitDate ? "before" : "after";
  }, [compareMode, splitDate, timeGroupBy]);

  const handleDateApply = (range: DateRange | null, cmp: DateRange | null, cmpEnabled: boolean) => {
    setDateRange(range);
    setCompareRange(cmp);
    setCompareEnabled(cmpEnabled);
    if (cmpEnabled) setCompareMode("date");
  };

  // Preset operations
  const applyPreset = (p: Preset) => {
    setGroupBy(p.groupBy);
    setTabGranularities((current) => ({ ...current, [p.groupBy]: p.timeGroupBy ?? (p.groupBy === "matrix" ? "month" : p.groupBy === "week" ? "week" : p.groupBy === "month" ? "month" : "day") }));
    setChartMetric(p.chartMetric ?? "default");
    setMatrixMetrics(p.matrixMetrics?.filter((key) => CHART_METRICS.some((metric) => metric.value === key)) ?? ["deliveryCount"]);
    setMatrixMetricLayout(p.matrixMetricLayout ?? "rows");
    setMatrixShowChart(p.matrixShowChart ?? true);
    setFocusPeriods(p.focusPeriods ?? 2);
    setDateRange(p.dateFrom && p.dateTo ? { from: p.dateFrom, to: p.dateTo } : null);
    setSelectedScenarios(p.scenarios ?? p.segments ?? []);
    setSelectedTemplates(p.templates ?? []);
    setActivePresetId(p.id);
    setCompareMode("none");
  };

  const saveCurrentAsPreset = (name: string) => {
    console.log("[Dashboard] saveCurrentAsPreset called, name=", name, "groupBy=", groupBy);
    const newPreset: Preset = {
      id: Date.now().toString(),
      name,
      groupBy,
      timeGroupBy,
      chartMetric,
      matrixMetrics,
      matrixMetricLayout,
      matrixShowChart,
      focusPeriods,
      dateFrom: dateRange?.from,
      dateTo: dateRange?.to,
      scenarios: selectedScenarios,
      templates: selectedTemplates,
    };
    const updated = [...presets, newPreset];
    try {
      savePresetsToStorage(updated);
    } catch (e) {
      console.error("[Dashboard] localStorage save failed:", e);
      window.alert("ビューを保存できませんでした。ブラウザーの保存領域や設定をご確認ください。");
      return;
    }
    setPresets(updated);
    setActivePresetId(newPreset.id);
  };

  const deletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    savePresetsToStorage(updated);
    if (activePresetId === id) setActivePresetId(null);
  };

  const renamePreset = (id: string, newName: string) => {
    const updated = presets.map((p) => p.id === id ? { ...p, name: newName } : p);
    setPresets(updated);
    savePresetsToStorage(updated);
  };

  // Chart bar fill by phase
  const getBarFill = (label: string) => {
    const phase = getRowPhase(label);
    return phase === "before" ? BEFORE_COLOR : phase === "after" ? AFTER_COLOR : YELLOW;
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
          onRename={renamePreset}
        />

        <div className="flex-1 px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-5">

          {/* ── Tabs ── */}
          <div className="overflow-x-auto" style={{ borderBottom: "1px solid #EBEBEB" }}>
            <div className="flex items-center gap-0 min-w-max">
              {GROUP_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setGroupBy(tab.value)}
                  className="px-4 py-2.5 text-sm font-medium transition-all relative whitespace-nowrap"
                  style={{ color: activeTabValue === tab.value ? YELLOW_DARK : "#9CA3AF" }}
                  data-testid={`tab-${tab.value}`}
                >
                  {tab.label}

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

            {groupBy !== "matrix" && (
              <SearchableMultiSelect
                label="シナリオ"
                options={availableScenarios.map((scenario) => ({ value: scenario, label: scenario }))}
                selected={selectedScenarios}
                onChange={setSelectedScenarios}
              />
            )}

            {groupBy !== "matrix" && (
              <SearchableMultiSelect
                label="テンプレ"
                options={availableTemplates.map((template) => ({ value: template, label: template }))}
                selected={selectedTemplates}
                onChange={setSelectedTemplates}
              />
            )}

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

            {/* ── Compare mode toggle ── */}
            <div className="flex items-center gap-1.5 ml-auto">
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
                onClick={() => {
                  setCompareMode("change");
                  if (groupBy === "matrix") setGroupBy("scenario");
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg font-medium transition-all whitespace-nowrap"
                style={compareMode === "change"
                  ? { background: "#FDF4FF", color: CHANGE_COLOR, border: `1.5px solid ${CHANGE_COLOR}` }
                  : { background: "#fff", color: "#9CA3AF", border: "1px solid #EBEBEB" }}
              >
                <GitCommitHorizontal size={11} /> 施策タイミング
              </button>
            </div>
          </div>

          {/* ── Campaign picker ── */}
          {compareMode === "change" && (
            <CampaignPicker
              campaigns={allCampaigns}
              selectedId={selectedChangeId}
              onSelect={setSelectedChangeId}
            />
          )}

          {/* ── Matrix view ── */}
          <div className="bg-white rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3"
            style={{ border: "1px solid #EBEBEB" }}>
            <span className="text-xs font-semibold text-gray-500">期間の粒度</span>
            <div className="flex items-center gap-1" role="group" aria-label="期間の粒度">
              {(["day", "week", "month"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={timeGroupBy === value}
                  data-testid={`granularity-${value}`}
                  onClick={() => {
                    setTabGranularities((current) => ({ ...current, [groupBy]: value }));
                    setActivePresetId(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={timeGroupBy === value ? { background: "#1A1A1A", color: "#fff" } : { background: "#F3F4F6", color: "#6B7280" }}>
                  {TIME_LABELS[value]}
                </button>
              ))}
            </div>
            {compareMode === "change" && (
              <label className="flex items-center gap-2 text-xs text-gray-500">
                表示範囲
                <select aria-label="施策前後の表示範囲" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                  value={focusPeriods} onChange={(event) => setFocusPeriods(event.target.value === "all" ? "all" : Number(event.target.value))}>
                  <option value={2}>前後2期間</option><option value={4}>前後4期間</option><option value={8}>前後8期間</option><option value="all">選択した全期間</option>
                </select>
              </label>
            )}
            <span className="text-[11px] text-gray-400">
              {anchorDate ? `施策日 ${anchorDate} 基準 · ${timeGroupBy === "week" ? "7日間ごと" : timeGroupBy === "month" ? "1か月ごと（末日調整）" : "1日ごと"}` : timeGroupBy === "week" ? "月曜〜日曜で集計（月曜の日付を表示）" : timeGroupBy === "month" ? "暦月ごとに集計" : "配信日ごとに集計"}
              {" · 選択した日付範囲内のデータのみ"}
              {focusBounds && ` · ${requestFrom} 〜 ${requestTo}`}
            </span>
          </div>
          {groupBy === "matrix" ? (
            <MatrixView
              availableScenarios={availableScenarios}
              availableTemplates={availableTemplates}
              selectedScenarios={selectedScenarios}
              onScenariosChange={setSelectedScenarios}
              selectedTemplates={selectedTemplates}
              onTemplatesChange={setSelectedTemplates}
              dateRange={effectiveDateRange}
              compareMode={compareMode}
              selectedCampaign={selectedCampaign}
              chartHeight={chartHeight}
              onChartHeightChange={setChartHeight}
              timeGroupBy={timeGroupBy}
              selectedMetrics={matrixMetrics}
              setSelectedMetrics={(metrics) => { setMatrixMetrics(metrics); setActivePresetId(null); }}
              metricLayout={matrixMetricLayout}
              setMetricLayout={(layout) => { setMatrixMetricLayout(layout); setActivePresetId(null); }}
              showChart={matrixShowChart}
              setShowChart={(visible) => { setMatrixShowChart(visible); setActivePresetId(null); }}
            />
          ) : isLoading || (compareMode === "change" && phaseLoading) ? (
            <LoadingSkeleton />
          ) : isError || (compareMode === "change" && phaseError) ? (
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
                      {subjectChart ? `${TIME_LABELS[timeGroupBy]}・件名別の実績` : `${TIME_LABELS[timeGroupBy]}・${chartMetric === "default" ? "配信トレンド" : visibleMetrics[0]?.label}の推移`}
                    </div>
                    <div className="text-xs mt-0.5 hidden sm:block" style={{ color: "#9CA3AF" }}>
                      {compareMode === "change"
                        ? `施策日（${selectedCampaign?.startDate ?? ""}）を境に集計${hasCountMetric ? " · 青 = 施策前 / ピンク = 施策後" : " · 破線 = 施策開始"}`
                        : subjectChart ? "棒：件名別の配信数　点：開封率 / クリック率"
                        : "棒：件数　折れ線：率 · 表示指標を選ぶと縦軸も切り替わります"}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    表示指標
                    <select aria-label="グラフの表示指標" data-testid="chart-metric" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                      value={chartMetric} onChange={(event) => { setChartMetric(event.target.value as ChartMetric | "default"); setActivePresetId(null); }}>
                      <option value="default">{groupBy === "day" ? "標準（配信数）" : "標準（配信数・開封率・クリック率）"}</option>
                      {CHART_METRICS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label}のみ</option>)}
                    </select>
                  </label>
                </div>
                {items.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm" style={{ color: "#bbb" }}>データがありません</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                    <div style={{ height: chartHeight, minWidth: subjectChart ? Math.min(chartItems.length, 6) * 230 : undefined }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartItems} margin={{ top: 28, right: 28, left: 8, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                          <XAxis dataKey="chartKey" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} tickMargin={6}
                            interval={subjectChart && chartItems.length <= 6 ? 0 : "preserveStartEnd"}
                            tickFormatter={(value) => subjectChart
                              ? (JSON.parse(String(value)) as [string, string])[1].slice(0, 26)
                              : String(value)}
                            height={subjectChart ? 52 : 30}
                            tick={subjectChart ? ({ x, y, payload }) => {
                              const [label, subject] = JSON.parse(String(payload.value)) as [string, string];
                              const shorten = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}…` : text;
                              return (
                                <text x={x} y={y} textAnchor="middle" fill="#6B7280" fontSize={10}>
                                  <tspan x={x} dy={12}>{shorten(label, 22)}</tspan>
                                  <tspan x={x} dy={15}>{shorten(subject, 26)}</tspan>
                                </text>
                              );
                            } : undefined}
                          />
                          <YAxis yAxisId="left" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                            tickFormatter={hasCountMetric ? formatNumber : formatChartRate}
                            domain={hasCountMetric ? [0, "auto"] : [0, (maximum: number) => maximum > 0 ? maximum * 1.15 : 0.01]} width={58} />
                          {hasCountMetric && hasRateMetric && <YAxis yAxisId="right" orientation="right" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                            tickFormatter={formatChartRate}
                            domain={[0, (maximum: number) => maximum > 0 ? maximum * 1.15 : 0.01]} width={58} />}
                          <Tooltip
                            contentStyle={{ background: "#fff", border: "1px solid #EBEBEB", borderRadius: "10px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                            labelFormatter={(label, payload) => subjectChart
                              ? `${payload[0]?.payload?.period ?? ""} / ${payload[0]?.payload?.label ?? ""} / 件名：${payload[0]?.payload?.subject ?? "（件名未取得）"}`
                              : payload[0]?.payload?.periodEnd ? `${label} 〜 ${payload[0].payload.periodEnd}` : String(label)}
                            formatter={(value: number, name: string) =>
                              CHART_METRICS.find((metric) => metric.label === name)?.isRate
                                ? [formatChartRate(value), name]
                                : [formatNumber(value), name]
                            }
                          />
                          {/* Campaign split reference line */}
                          {compareMode === "change" && splitDate && (
                            <ReferenceLine
                              yAxisId="left"
                              x={timePeriod(splitDate, timeGroupBy, anchorDate)}
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
                              x={timePeriod(c.startDate, timeGroupBy)}
                              stroke={CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length]}
                              strokeDasharray="4 3"
                              strokeWidth={1.5}
                              label={{ value: c.title.slice(0, 8), fill: CAMPAIGN_COLORS[i % CAMPAIGN_COLORS.length], fontSize: 8, position: "insideTopLeft" }}
                            />
                          ))}
                          {visibleMetrics.map((metric) => metric.isRate ? (
                            <Line key={metric.value} yAxisId={hasCountMetric ? "right" : "left"} type="monotone" dataKey={metric.value} name={metric.label}
                              stroke={metric.color} strokeWidth={subjectChart ? 0 : 2}
                              dot={subjectChart ? { r: 4, fill: metric.color, stroke: metric.color, strokeWidth: 1 } : { r: 3 }}
                              activeDot={{ r: 5 }} connectNulls={false}>
                              <LabelList dataKey={metric.value} position={metric.value === "clickRate" && visibleMetrics.length > 1 ? "bottom" : "top"} offset={9}
                                formatter={(value: unknown) => formatChartValueLabel(value, true)}
                                fill={metric.color} fontSize={10} fontWeight={600}
                                stroke="#fff" strokeWidth={3} paintOrder="stroke" />
                            </Line>
                          ) : (
                            <Bar key={metric.value} yAxisId="left" dataKey={metric.value} name={metric.label} radius={[3, 3, 0, 0]} maxBarSize={28} opacity={0.9}>
                              {chartItems.map((item, index) => <Cell key={index} fill={compareMode === "change" ? getBarFill(item.label) : metric.color} />)}
                              <LabelList dataKey={metric.value} position="top" offset={9}
                                formatter={(value: unknown) => formatChartValueLabel(value, false)}
                                fill="#374151" fontSize={10} fontWeight={600}
                                stroke="#fff" strokeWidth={3} paintOrder="stroke" />
                            </Bar>
                          ))}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    </div>
                    <ChartResizeHandle height={chartHeight} onHeightChange={setChartHeight} />
                    <div className="flex items-center gap-4 md:gap-6 mt-3 pt-3 flex-wrap" style={{ borderTop: "1px solid #F3F4F6" }}>
                      {compareMode === "change" ? (
                        <>
                          {hasCountMetric && <>
                            <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: BEFORE_COLOR }} /> 施策前・{visibleMetrics.find((metric) => !metric.isRate)?.label}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: AFTER_COLOR }} /> 施策後・{visibleMetrics.find((metric) => !metric.isRate)?.label}
                            </div>
                          </>}
                          {visibleMetrics.filter((metric) => metric.isRate).map((metric) => (
                            <div key={metric.value} className="flex items-center gap-1.5 text-xs text-gray-400">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: metric.color }} />{metric.label}
                            </div>
                          ))}
                          <div className="flex items-center gap-1.5 text-xs ml-auto" style={{ color: CHANGE_COLOR }}>
                            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={CHANGE_COLOR} strokeWidth="1.5" strokeDasharray="5,4" /></svg>
                            施策開始
                          </div>
                        </>
                      ) : (
                        <>
                          {visibleMetrics.map((l) => (
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
              <div className="bg-white rounded-xl overflow-hidden"
                style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }} data-testid="card-table">
                <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between"
                  style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>詳細データ</span>
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>{items.length} 件</span>
                </div>
                <MetricsTable
                  items={items}
                  scenarioGroups={scenarioGroups.length > 0 ? scenarioGroups : undefined}
                  groupBy={effectiveGroupBy}
                  showComparison={showComparison}
                  getRowPhase={getRowPhase}
                />
              </div>
            </>
          )}
        </div>
      </main>

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

// ─── Chart Resize Handle ──────────────────────────────────────────
function ChartResizeHandle({
  height,
  onHeightChange,
  min = 160,
  max = 600,
}: {
  height: number;
  onHeightChange: (h: number) => void;
  min?: number;
  max?: number;
}) {
  const startRef = useRef<{ y: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = { y: e.clientY, h: height };
    setDragging(true);

    const onMove = (ev: MouseEvent) => {
      if (!startRef.current) return;
      const delta = ev.clientY - startRef.current.y;
      onHeightChange(Math.min(max, Math.max(min, startRef.current.h + delta)));
    };
    const onUp = () => {
      startRef.current = null;
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [height, onHeightChange, min, max]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startRef.current = { y: touch.clientY, h: height };
    setDragging(true);

    const onMove = (ev: TouchEvent) => {
      if (!startRef.current) return;
      const delta = ev.touches[0].clientY - startRef.current.y;
      onHeightChange(Math.min(max, Math.max(min, startRef.current.h + delta)));
    };
    const onEnd = () => {
      startRef.current = null;
      setDragging(false);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
  }, [height, onHeightChange, min, max]);

  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className="flex items-center justify-center mt-2 rounded-lg select-none transition-colors"
      style={{
        height: 20,
        cursor: "ns-resize",
        background: dragging ? "#E5E7EB" : "transparent",
      }}
      title="ドラッグしてグラフの高さを調整"
    >
      <div
        className="rounded-full transition-colors"
        style={{
          width: 40,
          height: 4,
          background: dragging ? "#9CA3AF" : "#D1D5DB",
        }}
      />
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
