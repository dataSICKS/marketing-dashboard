import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

export interface EfoDateRange { from: string; to: string }

// ─── Date utils ───────────────────────────────────────────────────
function toStr(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function fromStr(s: string): Date {
  const [y, m, d] = s.split("/").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s: string, n: number): string {
  const d = fromStr(s); d.setDate(d.getDate() + n); return toStr(d);
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(1); r.setMonth(r.getMonth() + n); return r;
}
function daysBetween(a: string, b: string): number {
  return Math.round((fromStr(b).getTime() - fromStr(a).getTime()) / 86400000);
}
function todayStr(): string { return toStr(new Date()); }
function daysInMonth(d: Date): number { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function firstDayOfWeek(d: Date): number { return new Date(d.getFullYear(), d.getMonth(), 1).getDay(); }

// ─── Presets ─────────────────────────────────────────────────────
type PresetKey = "today" | "7d" | "14d" | "30d" | "thisMonth" | "lastMonth" | "3m" | "6m" | "thisYear" | "lastYear" | "1y";
const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today",     label: "今日" },
  { key: "7d",        label: "過去7日" },
  { key: "14d",       label: "過去14日" },
  { key: "30d",       label: "過去30日" },
  { key: "thisMonth", label: "今月" },
  { key: "lastMonth", label: "先月" },
  { key: "3m",        label: "過去3ヶ月" },
  { key: "6m",        label: "過去6ヶ月" },
  { key: "thisYear",  label: "今年" },
  { key: "lastYear",  label: "昨年" },
  { key: "1y",        label: "過去1年" },
];

function getPresetRange(key: PresetKey): EfoDateRange {
  const today = todayStr();
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  switch (key) {
    case "today":     return { from: today, to: today };
    case "7d":        return { from: addDays(today, -6), to: today };
    case "14d":       return { from: addDays(today, -13), to: today };
    case "30d":       return { from: addDays(today, -29), to: today };
    case "thisMonth": return { from: toStr(new Date(y, m, 1)), to: today };
    case "lastMonth": return { from: toStr(new Date(y, m - 1, 1)), to: toStr(new Date(y, m, 0)) };
    case "3m":        return { from: toStr(new Date(y, m - 3, now.getDate())), to: today };
    case "6m":        return { from: toStr(new Date(y, m - 6, now.getDate())), to: today };
    case "thisYear":  return { from: toStr(new Date(y, 0, 1)), to: today };
    case "lastYear":  return { from: toStr(new Date(y - 1, 0, 1)), to: toStr(new Date(y - 1, 11, 31)) };
    case "1y":        return { from: addDays(today, -364), to: today };
  }
}

function detectPreset(r: EfoDateRange | null): PresetKey | null {
  if (!r) return null;
  for (const p of PRESETS) {
    const pr = getPresetRange(p.key);
    if (pr.from === r.from && pr.to === r.to) return p.key;
  }
  return null;
}

// ─── MonthCalendar ────────────────────────────────────────────────
function MonthCalendar({
  month, from, to, hoverDate, selecting, onDayClick, onDayHover, accentColor,
}: {
  month: Date;
  from: string | null; to: string | null; hoverDate: string | null;
  selecting: "from" | "to";
  onDayClick: (d: string) => void;
  onDayHover: (d: string) => void;
  accentColor: string;
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

  const accentLight = `${accentColor}20`;

  return (
    <div style={{ minWidth: 210 }}>
      <div className="text-center text-sm font-semibold mb-3" style={{ color: "#1A1A1A" }}>
        {month.getFullYear()}年{month.getMonth() + 1}月
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map((d, i) => (
          <div key={d} className="text-center text-[11px] font-medium py-1"
            style={{ color: i === 0 ? "#EF4444" : i === 6 ? "#6366F1" : "#9CA3AF" }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} />;
          const ds = dayStr(day);
          const isFrom = ds === effectiveFrom;
          const isTo = ds === effectiveTo;
          const inRange = !!(effectiveFrom && effectiveTo && ds > effectiveFrom && ds < effectiveTo);
          const isEdge = isFrom || isTo;
          const isSingle = isFrom && isTo;
          const isSun = idx % 7 === 0;

          let cellBg = "transparent";
          let cellRadius = "";
          if (inRange) { cellBg = accentLight; cellRadius = "0"; }
          if (isFrom && effectiveTo && effectiveTo !== effectiveFrom) { cellBg = accentLight; cellRadius = "50% 0 0 50%"; }
          if (isTo && effectiveFrom && effectiveTo !== effectiveFrom) { cellBg = accentLight; cellRadius = "0 50% 50% 0"; }
          if (isSingle) { cellBg = "transparent"; cellRadius = "50%"; }

          return (
            <div
              key={idx}
              className="flex items-center justify-center cursor-pointer select-none"
              style={{ height: 34, background: cellBg, borderRadius: cellRadius || undefined }}
              onClick={() => onDayClick(ds)}
              onMouseEnter={() => onDayHover(ds)}
            >
              <div
                className="flex items-center justify-center text-xs transition-colors"
                style={{
                  width: 30, height: 30,
                  borderRadius: "50%",
                  background: isEdge ? accentColor : "transparent",
                  color: isEdge ? "#fff" : isSun ? "#EF4444" : "#374151",
                  fontWeight: isEdge ? 700 : 400,
                }}
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
interface Props {
  value: EfoDateRange | null;
  onChange: (r: EfoDateRange | null) => void;
  accentColor?: string;
}

export default function EfoDateRangePicker({ value, onChange, accentColor = "#6366F1" }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const [pendingFrom, setPendingFrom] = useState<string | null>(value?.from ?? null);
  const [pendingTo, setPendingTo] = useState<string | null>(value?.to ?? null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<"from" | "to">("from");

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (value?.from) {
      const d = fromStr(value.from); d.setDate(1);
      return addMonths(d, -1);
    }
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d;
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 6, left: rect.left });
    }
    setPendingFrom(value?.from ?? null);
    setPendingTo(value?.to ?? null);
    setSelecting("from");
    if (value?.from) {
      const d = fromStr(value.from); d.setDate(1);
      setViewMonth(addMonths(d, -1));
    }
    setOpen(true);
  };

  const handlePreset = (key: PresetKey) => {
    const r = getPresetRange(key);
    setPendingFrom(r.from);
    setPendingTo(r.to);
    setSelecting("from");
    const d = fromStr(r.from); d.setDate(1);
    setViewMonth(addMonths(d, -1));
  };

  const handleDayClick = useCallback((ds: string) => {
    if (selecting === "from") {
      setPendingFrom(ds);
      setPendingTo(null);
      setSelecting("to");
    } else {
      if (pendingFrom && ds < pendingFrom) {
        setPendingFrom(ds); setPendingTo(pendingFrom);
      } else {
        setPendingTo(ds);
      }
      setSelecting("from");
    }
  }, [selecting, pendingFrom]);

  const handleApply = () => {
    if (pendingFrom && pendingTo) onChange({ from: pendingFrom, to: pendingTo });
    setOpen(false);
  };

  const handleCancel = () => setOpen(false);

  const handleClear = () => { onChange(null); setOpen(false); };

  const month2 = addMonths(viewMonth, 1);

  const activePreset = detectPreset(value);
  const btnLabel = value ? `${value.from} 〜 ${value.to}` : "期間を選択";
  const presetLabel = activePreset ? PRESETS.find((p) => p.key === activePreset)?.label : null;
  const accentLight = `${accentColor}18`;

  return (
    <div className="relative w-full">
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={handleOpen}
        className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg w-full"
        style={{
          border: `1px solid ${open ? accentColor : "#E5E7EB"}`,
          background: open ? accentLight : "#F9FAFB",
          color: value ? "#374151" : "#9CA3AF",
          textAlign: "left",
        }}
      >
        <Calendar size={13} color={value ? accentColor : "#9CA3AF"} />
        <span className="flex-1 truncate">{btnLabel}</span>
        {presetLabel && (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: accentLight, color: accentColor }}>
            {presetLabel}
          </span>
        )}
        <ChevronRight size={13} color="#9CA3AF" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>

      {/* Popover — rendered in body via portal to escape overflow:hidden */}
      {open && createPortal(
        <div
          ref={popoverRef}
          className="bg-white rounded-2xl shadow-2xl"
          style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left, zIndex: 9999, border: "1px solid #E5E7EB", minWidth: 580 }}
        >
          <div className="flex">
            {/* Quick presets */}
            <div className="py-4 px-2 shrink-0" style={{ borderRight: "1px solid #F3F4F6", width: 136 }}>
              <div className="text-[10px] font-semibold px-3 pb-2" style={{ color: "#BBBBBB", letterSpacing: "0.08em" }}>クイック選択</div>
              {PRESETS.map((p) => {
                const pr = getPresetRange(p.key);
                const active = pendingFrom === pr.from && pendingTo === pr.to;
                return (
                  <button
                    key={p.key}
                    onClick={() => handlePreset(p.key)}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all"
                    style={active
                      ? { background: accentColor, color: "#fff", fontWeight: 600 }
                      : { color: "#374151" }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Calendar */}
            <div className="flex-1 p-4 flex flex-col">
              {/* Start / End display */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setSelecting("from")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                  style={{
                    border: `2px solid ${selecting === "from" ? accentColor : "#E5E7EB"}`,
                    background: selecting === "from" ? accentLight : "#fff",
                    color: pendingFrom ? "#1A1A1A" : "#9CA3AF",
                    fontWeight: selecting === "from" ? 600 : 400,
                  }}
                >
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>開始</span>
                  <span>{pendingFrom ?? "----/--/--"}</span>
                </button>
                <span style={{ color: "#9CA3AF", fontSize: 16 }}>→</span>
                <button
                  onClick={() => setSelecting("to")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                  style={{
                    border: `2px solid ${selecting === "to" ? accentColor : "#E5E7EB"}`,
                    background: selecting === "to" ? accentLight : "#fff",
                    color: pendingTo ? "#1A1A1A" : "#9CA3AF",
                    fontWeight: selecting === "to" ? 600 : 400,
                  }}
                >
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>終了</span>
                  <span>{pendingTo ?? "----/--/--"}</span>
                </button>
                {pendingFrom && pendingTo && (
                  <span className="text-xs ml-1" style={{ color: "#9CA3AF" }}>
                    {daysBetween(pendingFrom, pendingTo) + 1}日間
                  </span>
                )}
              </div>

              {/* Month navigation + calendars */}
              <div className="flex items-start gap-1">
                <button
                  onClick={() => setViewMonth((m) => addMonths(m, -1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 mt-6 shrink-0"
                >
                  <ChevronLeft size={16} color="#9CA3AF" />
                </button>
                <div className="flex flex-1 gap-4 justify-between">
                  <MonthCalendar
                    month={viewMonth}
                    from={pendingFrom} to={pendingTo} hoverDate={hoverDate}
                    selecting={selecting}
                    onDayClick={handleDayClick}
                    onDayHover={(d) => setHoverDate(d)}
                    accentColor={accentColor}
                  />
                  <MonthCalendar
                    month={month2}
                    from={pendingFrom} to={pendingTo} hoverDate={hoverDate}
                    selecting={selecting}
                    onDayClick={handleDayClick}
                    onDayHover={(d) => setHoverDate(d)}
                    accentColor={accentColor}
                  />
                </div>
                <button
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  className="p-1.5 rounded-lg hover:bg-gray-100 mt-6 shrink-0"
                >
                  <ChevronRight size={16} color="#9CA3AF" />
                </button>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 mt-4 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
                {value && (
                  <button
                    onClick={handleClear}
                    className="mr-auto text-xs px-3 py-1.5 rounded-lg"
                    style={{ color: "#9CA3AF", background: "#F3F4F6" }}
                  >
                    クリア
                  </button>
                )}
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "#F9FAFB", color: "#374151", border: "1px solid #F3F4F6" }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleApply}
                  disabled={!pendingFrom || !pendingTo}
                  className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ background: accentColor, color: "#fff" }}
                >
                  適用
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
