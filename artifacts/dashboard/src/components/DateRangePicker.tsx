import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Calendar, X, Check } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────
export interface DateRange {
  from: string; // YYYY/MM/DD
  to: string;   // YYYY/MM/DD
}

interface Props {
  value: DateRange | null;
  compareValue: DateRange | null;
  compareEnabled: boolean;
  onApply: (range: DateRange | null, compare: DateRange | null, compareEnabled: boolean) => void;
}

// ─── Date utils ──────────────────────────────────────────────────
function toStr(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function fromStr(s: string): Date {
  const [y, m, d] = s.split("/").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s: string, n: number): string {
  const d = fromStr(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  return r;
}
function daysBetween(a: string, b: string): number {
  return Math.round((fromStr(b).getTime() - fromStr(a).getTime()) / 86400000);
}
function todayStr(): string { return toStr(new Date()); }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function daysInMonth(d: Date): number { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function firstDayOfWeek(d: Date): number { return new Date(d.getFullYear(), d.getMonth(), 1).getDay(); }
function formatRange(r: DateRange | null): string {
  if (!r) return "期間を選択";
  const fmt = (s: string) => {
    const [y, m, d] = s.split("/");
    return `${y}/${m}/${d}`;
  };
  return `${fmt(r.from)} 〜 ${fmt(r.to)}`;
}

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";

// ─── Presets ─────────────────────────────────────────────────────
type PresetKey = "7d" | "14d" | "28d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "custom";
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "7d", label: "直近7日間" },
  { key: "14d", label: "直近14日間" },
  { key: "28d", label: "直近28日間" },
  { key: "30d", label: "直近30日間" },
  { key: "90d", label: "直近90日間" },
  { key: "thisMonth", label: "今月" },
  { key: "lastMonth", label: "先月" },
  { key: "custom", label: "カスタム" },
];
function getPresetRange(key: PresetKey): DateRange | null {
  const today = todayStr();
  switch (key) {
    case "7d": return { from: addDays(today, -6), to: today };
    case "14d": return { from: addDays(today, -13), to: today };
    case "28d": return { from: addDays(today, -27), to: today };
    case "30d": return { from: addDays(today, -29), to: today };
    case "90d": return { from: addDays(today, -89), to: today };
    case "thisMonth": {
      const d = new Date();
      return { from: toStr(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
    }
    case "lastMonth": {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      return { from: toStr(first), to: toStr(last) };
    }
    default: return null;
  }
}
function detectPreset(r: DateRange | null): PresetKey {
  if (!r) return "custom";
  for (const p of PRESETS.filter((x) => x.key !== "custom")) {
    const pr = getPresetRange(p.key);
    if (pr && pr.from === r.from && pr.to === r.to) return p.key;
  }
  return "custom";
}

// ─── Calendar month ───────────────────────────────────────────────
function MonthCalendar({
  month,
  from, to, hoverDate,
  selecting,
  onDayClick,
  onDayHover,
  compareFrom, compareTo,
}: {
  month: Date;
  from: string | null; to: string | null; hoverDate: string | null;
  selecting: "from" | "to";
  onDayClick: (d: string) => void;
  onDayHover: (d: string) => void;
  compareFrom?: string | null; compareTo?: string | null;
}) {
  const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
  const first = firstDayOfWeek(month);
  const total = daysInMonth(month);
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const effectiveTo = selecting === "to" && hoverDate && from
    ? (hoverDate >= from ? hoverDate : from)
    : to;
  const effectiveFrom = selecting === "to" && hoverDate && from
    ? (hoverDate < from ? hoverDate : from)
    : from;

  function dayStr(day: number) {
    return `${month.getFullYear()}/${String(month.getMonth() + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
  }

  return (
    <div style={{ minWidth: 240 }}>
      <div className="text-center text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>
        {month.getFullYear()}年{month.getMonth() + 1}月
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div key={d} className="text-center text-[11px] font-medium py-1"
            style={{ color: i === 0 ? "#EF4444" : i === 6 ? "#60A5FA" : "#9CA3AF" }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} />;
          const ds = dayStr(day);
          const isFrom = ds === effectiveFrom;
          const isTo = ds === effectiveTo;
          const inRange = !!(effectiveFrom && effectiveTo && ds > effectiveFrom && ds < effectiveTo);
          const isStart = isFrom;
          const isEnd = isTo;
          const isCmpFrom = ds === compareFrom;
          const isCmpTo = ds === compareTo;
          const inCmpRange = !!(compareFrom && compareTo && ds > compareFrom && ds < compareTo);
          const isToday = ds === todayStr();
          const isSun = idx % 7 === 0;
          const isSat = idx % 7 === 6;

          let bg = "transparent";
          let color = isSun ? "#EF4444" : isSat ? "#60A5FA" : "#374151";
          let borderRadius = "50%";
          let fontWeight = isToday ? "700" : "400";

          if (isStart || isEnd) {
            bg = YELLOW;
            color = "#fff";
            fontWeight = "700";
          } else if (inRange) {
            bg = YELLOW_LIGHT;
            color = YELLOW_DARK;
            borderRadius = "0";
          }

          // range edge radius
          if (isStart && effectiveTo && effectiveTo !== effectiveFrom) borderRadius = "50% 0 0 50%";
          if (isEnd && effectiveFrom && effectiveTo !== effectiveFrom) borderRadius = "0 50% 50% 0";

          const cmpDot = isCmpFrom || isCmpTo || inCmpRange;

          return (
            <div
              key={idx}
              className="relative flex items-center justify-center cursor-pointer select-none"
              style={{ height: 32 }}
              onClick={() => onDayClick(ds)}
              onMouseEnter={() => onDayHover(ds)}
            >
              {/* compare underline */}
              {cmpDot && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: "#60A5FA" }} />
              )}
              <div
                className="flex items-center justify-center text-xs transition-all"
                style={{ width: 28, height: 28, background: bg, color, borderRadius, fontWeight, boxSizing: "border-box" }}
              >
                {day}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────
export default function DateRangePicker({ value, compareValue, compareEnabled, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // pending state inside panel
  const [pendingFrom, setPendingFrom] = useState<string | null>(value?.from ?? null);
  const [pendingTo, setPendingTo] = useState<string | null>(value?.to ?? null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<"from" | "to">("from");
  const [preset, setPreset] = useState<PresetKey>(() => detectPreset(value));

  // compare
  const [cmpEnabled, setCmpEnabled] = useState(compareEnabled);
  type CmpMode = "prev" | "year" | "custom";
  const [cmpMode, setCmpMode] = useState<CmpMode>("prev");
  const [cmpFrom, setCmpFrom] = useState<string | null>(compareValue?.from ?? null);
  const [cmpTo, setCmpTo] = useState<string | null>(compareValue?.to ?? null);

  // two-month display
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (value?.from) { const d = fromStr(value.from); d.setDate(1); return d; }
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d;
  });

  // computed compare range for "prev" / "year"
  const computedCmpRange: DateRange | null = (() => {
    if (!cmpEnabled || !pendingFrom || !pendingTo) return null;
    if (cmpMode === "prev") {
      const len = daysBetween(pendingFrom, pendingTo) + 1;
      const cf = addDays(pendingFrom, -len);
      const ct = addDays(pendingFrom, -1);
      return { from: cf, to: ct };
    }
    if (cmpMode === "year") {
      return {
        from: addDays(pendingFrom, -365),
        to: addDays(pendingTo, -365),
      };
    }
    if (cmpMode === "custom" && cmpFrom && cmpTo) return { from: cmpFrom, to: cmpTo };
    return null;
  })();

  // outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // sync when opening
  const handleOpen = () => {
    setPendingFrom(value?.from ?? null);
    setPendingTo(value?.to ?? null);
    setPreset(detectPreset(value));
    setCmpEnabled(compareEnabled);
    setCmpFrom(compareValue?.from ?? null);
    setCmpTo(compareValue?.to ?? null);
    if (value?.from) {
      const d = fromStr(value.from); d.setDate(1);
      // show the month containing `from` as the left month
      setViewMonth(d);
    }
    setSelecting("from");
    setOpen(true);
  };

  const handlePreset = (key: PresetKey) => {
    setPreset(key);
    if (key === "custom") return;
    const r = getPresetRange(key);
    if (r) { setPendingFrom(r.from); setPendingTo(r.to); setSelecting("from"); }
  };

  const handleDayClick = useCallback((ds: string) => {
    if (selecting === "from") {
      setPendingFrom(ds);
      setPendingTo(null);
      setSelecting("to");
      setPreset("custom");
    } else {
      if (pendingFrom && ds < pendingFrom) {
        setPendingFrom(ds);
        setPendingTo(pendingFrom);
      } else {
        setPendingTo(ds);
      }
      setSelecting("from");
    }
  }, [selecting, pendingFrom]);

  const handleApply = () => {
    const range = pendingFrom && pendingTo ? { from: pendingFrom, to: pendingTo } : null;
    const cmpRange = cmpEnabled ? computedCmpRange : null;
    onApply(range, cmpRange, cmpEnabled);
    setOpen(false);
  };

  const handleCancel = () => setOpen(false);

  const month2 = addMonths(viewMonth, 1);

  const effectiveCmpFrom = computedCmpRange?.from ?? null;
  const effectiveCmpTo = computedCmpRange?.to ?? null;

  // button label
  const btnLabel = value ? formatRange(value) : "期間を選択";
  const hasCompare = compareEnabled && compareValue;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all"
        style={{
          border: `1px solid ${open ? YELLOW : "#EBEBEB"}`,
          background: open ? YELLOW_LIGHT : "#fff",
          color: "#374151",
          boxShadow: open ? `0 0 0 3px ${YELLOW}22` : "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <Calendar size={14} color={open ? YELLOW_DARK : "#9CA3AF"} />
        <span style={{ color: value ? "#1A1A1A" : "#9CA3AF" }}>{btnLabel}</span>
        {hasCompare && (
          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
            比較中
          </span>
        )}
        <ChevronRight size={12} color="#9CA3AF" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute top-full mt-2 left-0 z-50 bg-white rounded-2xl shadow-2xl"
          style={{ border: "1px solid #EBEBEB", minWidth: 600, maxWidth: "calc(100vw - 32px)" }}
        >
          <div className="flex">
            {/* ── Presets ── */}
            <div className="py-4 pr-0 pl-4 shrink-0" style={{ borderRight: "1px solid #F3F4F6", width: 152 }}>
              <div className="text-[10px] font-semibold px-2 mb-2" style={{ color: "#BBBBBB", letterSpacing: "0.08em" }}>期間プリセット</div>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p.key)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                  style={preset === p.key
                    ? { background: YELLOW_LIGHT, color: YELLOW_DARK, fontWeight: 600 }
                    : { color: "#374151" }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* ── Calendar ── */}
            <div className="flex-1 p-4 flex flex-col">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft size={16} color="#9CA3AF" />
                </button>
                <div className="flex gap-6">
                  <MonthCalendar
                    month={viewMonth}
                    from={pendingFrom} to={pendingTo}
                    hoverDate={hoverDate}
                    selecting={selecting}
                    onDayClick={handleDayClick}
                    onDayHover={(d) => setHoverDate(d)}
                    compareFrom={effectiveCmpFrom}
                    compareTo={effectiveCmpTo}
                  />
                  <MonthCalendar
                    month={month2}
                    from={pendingFrom} to={pendingTo}
                    hoverDate={hoverDate}
                    selecting={selecting}
                    onDayClick={handleDayClick}
                    onDayHover={(d) => setHoverDate(d)}
                    compareFrom={effectiveCmpFrom}
                    compareTo={effectiveCmpTo}
                  />
                </div>
                <button
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronRight size={16} color="#9CA3AF" />
                </button>
              </div>

              {/* Selected range display */}
              <div className="flex items-center gap-2 mb-3 text-xs" style={{ color: "#6B7280" }}>
                <span className="px-2 py-1 rounded-lg font-medium" style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                  {pendingFrom ?? "開始日"}
                </span>
                <span style={{ color: "#BBBBBB" }}>→</span>
                <span className="px-2 py-1 rounded-lg font-medium" style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                  {pendingTo ?? (selecting === "to" ? "終了日を選択..." : "終了日")}
                </span>
                {pendingFrom && pendingTo && (
                  <span style={{ color: "#9CA3AF" }}>（{daysBetween(pendingFrom, pendingTo) + 1}日間）</span>
                )}
                {(pendingFrom || pendingTo) && (
                  <button onClick={() => { setPendingFrom(null); setPendingTo(null); setPreset("custom"); setSelecting("from"); }}>
                    <X size={13} color="#BBBBBB" />
                  </button>
                )}
              </div>

              {/* ── Compare section ── */}
              <div className="pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <div
                    onClick={() => setCmpEnabled((v) => !v)}
                    className="w-8 h-4 rounded-full relative transition-all"
                    style={{ background: cmpEnabled ? YELLOW : "#D1D5DB" }}
                  >
                    <div
                      className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all"
                      style={{ left: cmpEnabled ? "calc(100% - 14px)" : 2 }}
                    />
                  </div>
                  <span className="text-sm font-medium" style={{ color: "#374151" }}>期間を比較</span>
                </label>

                {cmpEnabled && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {([
                        { key: "prev" as CmpMode, label: "前の期間" },
                        { key: "year" as CmpMode, label: "前年同期" },
                        { key: "custom" as CmpMode, label: "カスタム" },
                      ]).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setCmpMode(opt.key)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={cmpMode === opt.key
                            ? { background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" }
                            : { background: "#F9FAFB", color: "#6B7280", border: "1px solid #F3F4F6" }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Show computed or custom range */}
                    {cmpMode !== "custom" && computedCmpRange && (
                      <div className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#EFF6FF", color: "#1D4ED8" }}>
                        比較期間: {computedCmpRange.from} 〜 {computedCmpRange.to}（{daysBetween(computedCmpRange.from, computedCmpRange.to) + 1}日間）
                      </div>
                    )}
                    {cmpMode !== "custom" && !computedCmpRange && (
                      <div className="text-xs" style={{ color: "#9CA3AF" }}>期間を選択してください</div>
                    )}

                    {cmpMode === "custom" && (
                      <div className="flex items-center gap-2 text-xs">
                        <input
                          type="date"
                          value={(cmpFrom ?? "").replace(/\//g, "-")}
                          onChange={(e) => setCmpFrom(e.target.value.replace(/-/g, "/"))}
                          className="rounded-lg px-2 py-1.5 outline-none"
                          style={{ border: "1px solid #EBEBEB", color: "#374151" }}
                        />
                        <span style={{ color: "#BBBBBB" }}>〜</span>
                        <input
                          type="date"
                          value={(cmpTo ?? "").replace(/\//g, "-")}
                          onChange={(e) => setCmpTo(e.target.value.replace(/-/g, "/"))}
                          className="rounded-lg px-2 py-1.5 outline-none"
                          style={{ border: "1px solid #EBEBEB", color: "#374151" }}
                        />
                        {cmpFrom && cmpTo && (
                          <span style={{ color: "#9CA3AF" }}>{daysBetween(cmpFrom, cmpTo) + 1}日間</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 mt-4 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{ background: "#F9FAFB", color: "#374151", border: "1px solid #F3F4F6" }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleApply}
                  disabled={!pendingFrom || !pendingTo}
                  className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-all"
                  style={{ background: YELLOW, color: "#fff", boxShadow: `0 2px 8px ${YELLOW}55` }}
                >
                  <Check size={14} />
                  適用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
