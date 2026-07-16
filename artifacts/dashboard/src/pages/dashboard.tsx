import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from "react";
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
  Pencil,
  Check,
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
  { value: "matrix", label: "マトリクス" },
  { value: "scenario", label: "シナリオ別" },
  { value: "template", label: "テンプレ別" },
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

  const handleSave = () => {
    if (!newName.trim()) return;
    onSave(newName.trim());
    setNewName("");
    setSaving(false);
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

      {/* Preset chips — horizontal scroll (chips only, no save button inside) */}
      <div className="flex-1 flex items-center gap-1.5 overflow-x-auto min-w-0" style={{ scrollbarWidth: "none" }}>
        {presets.map((p) => (
          <div key={p.id} className="flex items-center shrink-0 rounded-full overflow-hidden"
            style={{ border: `1.5px solid ${activeId === p.id ? YELLOW : "#E5E7EB"}` }}>
            {renamingId === p.id ? (
              /* ── Inline rename input ── */
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
              /* ── Normal chip ── */
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

      {/* ── Save new preset — always visible, outside scroll area ── */}
      {saving ? (
        <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-full"
          style={{ border: `1.5px solid ${YELLOW}`, background: YELLOW_LIGHT }}>
          <input
            className="text-xs outline-none"
            style={{ width: 120, color: "#1A1A1A", background: "transparent" }}
            placeholder="ビュー名を入力…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setSaving(false); setNewName(""); }
            }}
            autoFocus
          />
          <button onClick={handleSave} className="flex items-center shrink-0" style={{ color: YELLOW_DARK }} title="保存">
            <Check size={13} />
          </button>
          <button onClick={() => { setSaving(false); setNewName(""); }}
            className="flex items-center shrink-0" style={{ color: "#9CA3AF" }} title="キャンセル">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSaving(true)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
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
  dateRange,
  compareMode,
  selectedCampaign,
  chartHeight,
  onChartHeightChange,
}: {
  availableScenarios: string[];
  availableTemplates: string[];
  dateRange: DateRange | null;
  compareMode: "none" | "date" | "change";
  selectedCampaign: Campaign | null;
  chartHeight: number;
  onChartHeightChange: (h: number) => void;
}) {
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["deliveryCount"]);
  const [timeGroupBy, setTimeGroupBy] = useState<"day" | "week" | "month">("month");

  const hasSelections = selectedScenarios.length > 0 || selectedTemplates.length > 0;
  const hasMetrics = selectedMetrics.length > 0;
  const isCompare = compareMode === "change" && !!selectedCampaign;
  const splitDate = selectedCampaign?.startDate ?? null;

  const baseParams = {
    timeGroupBy,
    metrics: selectedMetrics.join(","),
    scenarios: selectedScenarios.join(","),
    templates: selectedTemplates.join(","),
  };

  const matrixParams = { ...baseParams, dateFrom: dateRange?.from, dateTo: dateRange?.to };
  const beforeParams = { ...baseParams, dateFrom: dateRange?.from, dateTo: splitDate ?? undefined };
  const afterParams  = { ...baseParams, dateFrom: splitDate ?? undefined, dateTo: dateRange?.to };

  const { data, isLoading } = useGetNewsletterMatrix(matrixParams, {
    query: { enabled: !isCompare && hasSelections && hasMetrics },
  });
  const { data: beforeData, isLoading: beforeLoading } = useGetNewsletterMatrix(beforeParams, {
    query: { enabled: isCompare && hasSelections && hasMetrics },
  });
  const { data: afterData, isLoading: afterLoading } = useGetNewsletterMatrix(afterParams, {
    query: { enabled: isCompare && hasSelections && hasMetrics },
  });

  const series: MatrixResponse["series"] = isCompare
    ? (beforeData?.series ?? afterData?.series ?? [])
    : (data?.series ?? []);
  const timePeriods: string[] = isCompare ? [] : (data?.timePeriods ?? []);
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
          onChange={setSelectedScenarios}
        />
        <SearchableMultiSelect
          label="テンプレ"
          options={templateOpts}
          selected={selectedTemplates}
          onChange={setSelectedTemplates}
        />
        <SearchableMultiSelect
          label="指標"
          options={metricOpts}
          selected={selectedMetrics}
          onChange={setSelectedMetrics}
        />
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
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-1">
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
          </div>

          {/* ── Merged chart (all series × metrics) ── */}
          {(() => {
            const LINE_DASHES = ["", "5 5", "2 4", "8 3 2 3", "1 3"];
            const hasRate = selectedMetrics.some(
              (mk) => MATRIX_METRICS.find((m) => m.value === mk)?.isRate
            );
            const hasCount = selectedMetrics.some(
              (mk) => !MATRIX_METRICS.find((m) => m.value === mk)?.isRate
            );
            const isMixed = hasRate && hasCount;
            const leftFmt = !isMixed && hasRate ? formatPercent : formatNumber;
            const yAxisId = (mk: string) => {
              if (!isMixed) return "left";
              return MATRIX_METRICS.find((m) => m.value === mk)?.isRate ? "right" : "left";
            };
            const mergedChartData = timePeriods.map((period) => {
              const pt: Record<string, string | number> = { period };
              for (const s of series) {
                for (const mk of selectedMetrics) {
                  pt[`${s.key}__${mk}`] = s.metricValues[mk as keyof typeof s.metricValues]?.[period] ?? 0;
                }
              }
              return pt;
            });
            return (
              <div className="bg-white rounded-xl p-4 md:p-6" style={{ border: "1px solid #EBEBEB" }}>
                <div className="text-sm font-bold mb-4" style={{ color: "#1A1A1A" }}>トレンド</div>
                <div style={{ height: chartHeight }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={mergedChartData} margin={{ top: 8, right: isMixed ? 52 : 8, left: -16, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="period" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" />
                      <YAxis yAxisId="left" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                        tickFormatter={(v) => leftFmt(v as number)} width={52} />
                      {isMixed && (
                        <YAxis yAxisId="right" orientation="right" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                          tickFormatter={(v) => formatPercent(v as number)} width={48} />
                      )}
                      <Tooltip
                        contentStyle={{ background: "#fff", border: "1px solid #EBEBEB", borderRadius: 10, fontSize: 12 }}
                        formatter={(val: number, name: string) => {
                          const [, mk] = name.split("__");
                          const mDef = MATRIX_METRICS.find((m) => m.value === mk) ?? MATRIX_METRICS[0];
                          const seriesKey = name.replace(`__${mk}`, "");
                          return [mDef.isRate ? formatPercent(val) : formatNumber(val), `${seriesKey} / ${mDef.label}`];
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
                          />
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
                      style={{ color: "#6B7280", minWidth: 150, position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB" }}>行</th>
                    <th className="px-3 py-2.5 text-left font-medium whitespace-nowrap"
                      style={{ color: "#6B7280", minWidth: 72, position: "sticky", left: 150, zIndex: 3, background: "#F9FAFB", borderRight: isCompare ? "2px solid #E5E7EB" : "1px solid #F3F4F6" }}>指標</th>
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
                      const afterS = afterSeries.find((a) => a.key === s.key);
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
                              className="px-4 py-2 whitespace-nowrap font-medium"
                              style={{ position: "sticky", left: 0, zIndex: 2, background: rowBg, color: "#1A1A1A", verticalAlign: "middle" }}>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
                                  style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                                  {s.type === "scenario" ? "SC" : "TP"}
                                </span>
                                <span className="truncate" style={{ maxWidth: 80 }}>{s.key}</span>
                              </div>
                            </td>
                          ) : null}
                          <td className="px-3 py-2 whitespace-nowrap"
                            style={{ position: "sticky", left: 150, zIndex: 2, background: rowBg, color: "#6B7280", borderRight: isCompare ? "2px solid #E5E7EB" : "1px solid #F3F4F6" }}>
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

  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [compareRange, setCompareRange] = useState<DateRange | null>(null);
  const [compareEnabled, setCompareEnabled] = useState(false);

  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [segmentDropdownOpen, setSegmentDropdownOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);

  // Compare mode: "none" | "date" | "change"
  const [compareMode, setCompareMode] = useState<"none" | "date" | "change">("none");
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);

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

  // Force day grouping when in change compare mode; treat matrix as day for data queries
  const effectiveGroupBy: GroupBy = compareMode === "change" || groupBy === "matrix" ? "day" : groupBy;
  // Always follow groupBy for tab highlighting — never use "day" (which isn't a tab)
  const activeTabValue: TabMode = groupBy;

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
    setSelectedSegments(p.segments ?? []);
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

  const renamePreset = (id: string, newName: string) => {
    const updated = presets.map((p) => p.id === id ? { ...p, name: newName } : p);
    setPresets(updated);
    savePresetsToStorage(updated);
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
          onRename={renamePreset}
        />

        <div className="flex-1 px-4 md:px-8 py-4 md:py-6 flex flex-col gap-4 md:gap-5">

          {/* ── Tabs ── */}
          <div className="overflow-x-auto" style={{ borderBottom: "1px solid #EBEBEB" }}>
            <div className="flex items-center gap-0 min-w-max">
              {GROUP_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => { setGroupBy(tab.value); if (compareMode === "change" && tab.value === "matrix") setCompareMode("none"); }}
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
          {groupBy === "matrix" ? (
            <MatrixView
              availableScenarios={availableSegments}
              availableTemplates={templatesData?.templates ?? []}
              dateRange={dateRange}
              compareMode={compareMode}
              selectedCampaign={selectedCampaign}
              chartHeight={chartHeight}
              onChartHeightChange={setChartHeight}
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
                    <div style={{ height: chartHeight }}>
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
                    <ChartResizeHandle height={chartHeight} onHeightChange={setChartHeight} />
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
