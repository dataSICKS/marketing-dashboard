import { useState } from "react";
import { ChevronDown, RefreshCw, Mail, TrendingUp, TrendingDown, BookmarkPlus } from "lucide-react";

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";
const INDIGO = "#6366F1";
const INDIGO_LIGHT = "#EEF2FF";

const SEGMENTS = ["新規", "既存", "休眠", "VIP"];
const DATE_PRESETS = ["今月", "先月", "過去3ヶ月", "カスタム"];
const SAVED = ["今月・新規", "先月・既存", "Q1まとめ", "年末セール"];

const SEG: Record<"A" | "B", { color: string; light: string; textOn: string }> = {
  A: { color: YELLOW, light: YELLOW_LIGHT, textOn: "#1A1A1A" },
  B: { color: INDIGO, light: INDIGO_LIGHT, textOn: "#fff" },
};

interface Filter { date: string; segments: string[]; preset: string }

function SegPanel({ seg, filter, onChange }: {
  seg: "A" | "B";
  filter: Filter;
  onChange: (f: Filter) => void;
}) {
  const { color, light, textOn } = SEG[seg];
  const [open, setOpen] = useState<"date" | "seg" | "preset" | null>(null);

  return (
    <div className="rounded-xl overflow-visible flex-1 relative" style={{ border: `2px solid ${color}`, minWidth: 0 }}>
      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: color }}>
        <span className="text-sm font-bold" style={{ color: textOn }}>セグメント {seg}</span>
        <button className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all" style={{ background: `rgba(0,0,0,0.1)`, color: textOn, border: `1px solid rgba(255,255,255,0.3)` }}>
          <BookmarkPlus size={9} /> 保存
        </button>
      </div>

      {/* Saved preset loader */}
      <div className="px-4 pt-3 pb-0">
        <div className="text-[10px] font-medium mb-1" style={{ color: "#9CA3AF" }}>保存済みビューを読み込む</div>
        <div className="relative">
          <button
            onClick={() => setOpen(open === "preset" ? null : "preset")}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs"
            style={{ border: "1px solid #E5E7EB", background: "#fff", color: "#374151" }}
          >
            <span>{filter.preset || "選択…"}</span>
            <ChevronDown size={11} />
          </button>
          {open === "preset" && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white rounded-lg shadow-lg overflow-hidden" style={{ border: "1px solid #EBEBEB" }}>
              <div className="px-3 py-1.5 text-[10px] font-semibold" style={{ background: "#F9FAFB", color: "#9CA3AF" }}>保存済みビュー</div>
              {SAVED.map(s => (
                <button key={s} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50" style={{ color: "#374151" }}
                  onClick={() => { onChange({ ...filter, preset: s }); setOpen(null); }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 my-3" style={{ borderTop: "1px dashed #E5E7EB" }} />

      {/* Filter controls */}
      <div className="px-4 pb-3 flex flex-col gap-2">
        {/* Date */}
        <div>
          <div className="text-[10px] font-medium mb-1" style={{ color: "#9CA3AF" }}>期間</div>
          <div className="flex gap-1 flex-wrap">
            {DATE_PRESETS.map(d => (
              <button
                key={d}
                onClick={() => onChange({ ...filter, date: d })}
                className="px-2 py-1 text-[10px] font-medium rounded-lg transition-all"
                style={filter.date === d
                  ? { background: color, color: textOn }
                  : { background: "#F3F4F6", color: "#6B7280" }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Segments */}
        <div>
          <div className="text-[10px] font-medium mb-1" style={{ color: "#9CA3AF" }}>セグメント</div>
          <div className="flex gap-1 flex-wrap">
            {SEGMENTS.map(s => {
              const active = filter.segments.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => onChange({
                    ...filter,
                    segments: active ? filter.segments.filter(x => x !== s) : [...filter.segments, s]
                  })}
                  className="px-2 py-1 text-[10px] font-medium rounded-lg transition-all"
                  style={active
                    ? { background: light, color: color === YELLOW ? YELLOW_DARK : INDIGO, border: `1px solid ${color}` }
                    : { background: "#F3F4F6", color: "#6B7280" }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const up = diff.startsWith("+");
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ml-1"
      style={{ background: up ? "#DCFCE7" : "#FEE2E2", color: up ? "#16A34A" : "#DC2626" }}>
      {up ? <TrendingUp size={8} /> : <TrendingDown size={8} />}{diff}
    </span>
  );
}

export function ABPanel() {
  const [filterA, setFilterA] = useState<Filter>({ date: "今月", segments: ["新規"], preset: "" });
  const [filterB, setFilterB] = useState<Filter>({ date: "先月", segments: ["新規"], preset: "" });

  const kpis = [
    { label: "配信数", a: "15,842", b: "12,400", diff: "+27.8%", up: true },
    { label: "開封率", a: "31.2%", b: "28.6%", diff: "+2.6pt", up: true },
    { label: "クリック率", a: "8.4%", b: "7.1%", diff: "+1.3pt", up: true },
    { label: "CVR", a: "2.8%", b: "3.2%", diff: "−0.4pt", up: false },
    { label: "CV数", a: "443", b: "397", diff: "+11.6%", up: true },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#F8F8F8", fontFamily: "Inter, sans-serif" }}>
      {/* Top bar */}
      <div className="bg-white px-6 h-14 flex items-center justify-between" style={{ borderBottom: "1px solid #EBEBEB" }}>
        <div>
          <div className="text-[10px]" style={{ color: "#9CA3AF" }}>メルマガ · 配信分析</div>
          <div className="text-sm font-bold" style={{ color: "#1A1A1A" }}>メルマガレポート</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] px-2.5 py-1.5 rounded-lg" style={{ border: "1px solid #EBEBEB", color: "#9CA3AF", background: "#FAFAFA" }}>
            最終更新: 2026/06/24 21:00
          </span>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: YELLOW, color: "#fff" }}>
            <RefreshCw size={11} /> 更新
          </button>
        </div>
      </div>

      <div className="px-6 py-4 flex flex-col gap-4">
        {/* Segment panels side by side */}
        <div className="flex gap-3">
          <SegPanel seg="A" filter={filterA} onChange={setFilterA} />
          <SegPanel seg="B" filter={filterB} onChange={setFilterB} />
        </div>

        {/* KPI comparison */}
        <div className="grid grid-cols-5 gap-2">
          {kpis.map(k => (
            <div key={k.label} className="bg-white rounded-xl px-3 py-3" style={{ border: "1px solid #EBEBEB" }}>
              <div className="text-[10px] font-medium mb-2" style={{ color: "#9CA3AF" }}>{k.label}</div>
              <div className="flex items-baseline gap-0.5 mb-0.5">
                <span className="text-base font-bold" style={{ color: "#1A1A1A" }}>{k.a}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs" style={{ color: "#9CA3AF" }}>{k.b}</span>
                <DiffBadge diff={k.diff} />
              </div>
              <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: "1px solid #F3F4F6" }}>
                <span className="w-2 h-2 rounded-full" style={{ background: YELLOW }} />
                <span className="text-[9px]" style={{ color: "#9CA3AF" }}>A</span>
                <span className="w-2 h-2 rounded-full ml-1" style={{ background: INDIGO }} />
                <span className="text-[9px]" style={{ color: "#9CA3AF" }}>B</span>
              </div>
            </div>
          ))}
        </div>

        {/* Group tabs */}
        <div className="flex gap-1">
          {["日別", "週別", "月別", "テンプレ別"].map((t, i) => (
            <button key={t} className="px-3 py-1.5 text-xs font-medium rounded-lg"
              style={{ background: i === 2 ? YELLOW_LIGHT : "#fff", color: i === 2 ? YELLOW_DARK : "#9CA3AF", border: `1px solid ${i === 2 ? YELLOW : "#EBEBEB"}` }}>
              {t}
            </button>
          ))}
        </div>

        {/* Chart placeholder */}
        <div className="bg-white rounded-xl p-5" style={{ border: "1px solid #EBEBEB" }}>
          <div className="text-sm font-bold mb-1" style={{ color: "#1A1A1A" }}>配信トレンド比較</div>
          <div className="text-[11px] mb-3" style={{ color: "#9CA3AF" }}>A（黄）と B（藍）を2軸で重ねて表示</div>
          <div className="rounded-lg flex flex-col items-center justify-center gap-3" style={{ height: 150, background: "#FAFAFA", border: "1px dashed #E5E7EB" }}>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                <span className="w-3 h-3 rounded-full" style={{ background: YELLOW }} />
                A: {filterA.date}・{filterA.segments.join("・") || "全体"}
              </span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                <span className="w-3 h-3 rounded-full" style={{ background: INDIGO }} />
                B: {filterB.date}・{filterB.segments.join("・") || "全体"}
              </span>
            </div>
            <div className="text-[11px]" style={{ color: "#D1D5DB" }}>配信数（棒）＋ 開封率・クリック率（折れ線）</div>
          </div>
        </div>
      </div>
    </div>
  );
}
