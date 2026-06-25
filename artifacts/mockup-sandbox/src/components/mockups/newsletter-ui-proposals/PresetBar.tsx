import { useState } from "react";
import { BookmarkPlus, X, ChevronDown, RefreshCw, Mail, TrendingUp, TrendingDown, GitCommitHorizontal, ArrowRight } from "lucide-react";

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";
const BEFORE_COLOR = "#60A5FA";
const AFTER_COLOR = "#F472B6";

const PRESETS = [
  { id: "p1", name: "今月・全体", dates: "2026/06/01〜06/24", segments: [] },
  { id: "p2", name: "先月・新規", dates: "2026/05/01〜05/31", segments: ["新規"] },
  { id: "p3", name: "Q1比較", dates: "2026/01/01〜03/31", segments: [] },
];

// Template change events — the key comparison axis
const CHANGE_EVENTS = [
  { id: "c1", date: "2026/05/15", type: "件名変更", desc: "「お得情報」→「限定オファー」", icon: "✏️" },
  { id: "c2", date: "2026/04/03", type: "本文変更", desc: "CTA位置を上部に移動", icon: "📝" },
  { id: "c3", date: "2026/02/20", type: "件名変更", desc: "【緊急】プレフィックス追加", icon: "✏️" },
  { id: "c4", date: "2025/12/01", type: "本文変更", desc: "画像→テキスト主体に変更", icon: "📝" },
];

const BEFORE = { delivery: "12,400", open: "28.6%", click: "7.1%", cvr: "3.2%", cv: "397" };
const AFTER  = { delivery: "15,842", open: "31.2%", click: "8.4%", cvr: "2.8%", cv: "443" };

const DIFFS = [
  { label: "配信数", before: BEFORE.delivery, after: AFTER.delivery, diff: "+27.8%", up: true },
  { label: "開封率", before: BEFORE.open, after: AFTER.open, diff: "+2.6pt", up: true },
  { label: "クリック率", before: BEFORE.click, after: AFTER.click, diff: "+1.3pt", up: true },
  { label: "CVR", before: BEFORE.cvr, after: AFTER.cvr, diff: "−0.4pt", up: false },
  { label: "CV数", before: BEFORE.cv, after: AFTER.cv, diff: "+11.6%", up: true },
];

// Mock chart bars: before=blue, after=pink, split point in middle
const CHART_BARS = [
  { label: "4/25", val: 0.55, phase: "before" },
  { label: "5/1",  val: 0.60, phase: "before" },
  { label: "5/8",  val: 0.58, phase: "before" },
  { label: "5/15", val: null, phase: "change" },  // change point
  { label: "5/22", val: 0.72, phase: "after" },
  { label: "5/29", val: 0.78, phase: "after" },
  { label: "6/5",  val: 0.75, phase: "after" },
  { label: "6/12", val: 0.82, phase: "after" },
];

const OPEN_RATE_LINE = [28, 29, 28, null, 31, 31, 32, 31];

export function PresetBar() {
  const [activePreset, setActivePreset] = useState("p1");
  const [compareMode, setCompareMode] = useState<"none" | "change">("none");
  const [selectedChange, setSelectedChange] = useState("c1");
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [changeDropOpen, setChangeDropOpen] = useState(false);
  const [kpiMetric, setKpiMetric] = useState<"delivery" | "open" | "click" | "cvr">("delivery");

  const changeEvent = CHANGE_EVENTS.find(c => c.id === selectedChange)!;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F8F8F8", fontFamily: "Inter, sans-serif" }}>
      {/* Top bar */}
      <div className="bg-white px-6 h-14 flex items-center justify-between shrink-0" style={{ borderBottom: "1px solid #EBEBEB" }}>
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

      {/* ── Preset Bar ── */}
      <div className="bg-white px-6 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
        <span className="text-[10px] font-semibold shrink-0" style={{ color: "#9CA3AF" }}>保存済み</span>
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
          {PRESETS.map((p) => (
            <button key={p.id} onClick={() => setActivePreset(p.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0"
              style={activePreset === p.id ? { background: YELLOW, color: "#fff" } : { background: "#F3F4F6", color: "#6B7280" }}>
              {p.name}
            </button>
          ))}
        </div>
        {saving ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <input className="text-xs px-2 py-1 rounded-lg outline-none" style={{ border: `1.5px solid ${YELLOW}`, width: 120 }}
              placeholder="名前を入力…" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            <button className="text-xs px-2.5 py-1 rounded-lg font-semibold" style={{ background: YELLOW, color: "#fff" }} onClick={() => setSaving(false)}>保存</button>
            <button className="text-xs px-2 py-1 rounded-lg" style={{ color: "#9CA3AF" }} onClick={() => setSaving(false)}>×</button>
          </div>
        ) : (
          <button onClick={() => setSaving(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0"
            style={{ border: `1.5px dashed ${YELLOW}`, color: YELLOW_DARK, background: YELLOW_LIGHT }}>
            <BookmarkPlus size={11} /> 保存
          </button>
        )}
      </div>

      <div className="flex-1 px-6 py-4 flex flex-col gap-4 overflow-auto">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
            style={{ background: "#fff", border: "1px solid #EBEBEB", color: "#6B7280" }}>
            {PRESETS.find(p => p.id === activePreset)?.dates} <ChevronDown size={11} />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
            style={{ background: "#fff", border: "1px solid #EBEBEB", color: "#6B7280" }}>
            セグメント <ChevronDown size={11} />
          </button>

          {/* ── Comparison axis selector ── */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] font-semibold" style={{ color: "#9CA3AF" }}>比較軸</span>
            <button
              onClick={() => setCompareMode("none")}
              className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-all"
              style={compareMode === "none"
                ? { background: "#F3F4F6", color: "#374151", border: "1.5px solid #D1D5DB" }
                : { background: "#fff", color: "#9CA3AF", border: "1px solid #EBEBEB" }}>
              なし
            </button>
            <button
              onClick={() => setCompareMode("change")}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg font-medium transition-all"
              style={compareMode === "change"
                ? { background: "#FDF4FF", color: "#A855F7", border: "1.5px solid #A855F7" }
                : { background: "#fff", color: "#9CA3AF", border: "1px solid #EBEBEB" }}>
              <GitCommitHorizontal size={11} /> 変更タイミング
            </button>
          </div>

          {/* Group tabs */}
          <div className="flex gap-1">
            {["日別", "週別", "月別", "テンプレ別"].map((t, i) => (
              <button key={t} className="px-2.5 py-1.5 text-xs rounded-lg font-medium"
                style={{ background: i === 0 ? YELLOW_LIGHT : "#fff", color: i === 0 ? YELLOW_DARK : "#9CA3AF", border: `1px solid ${i === 0 ? YELLOW : "#EBEBEB"}` }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── Change point picker (only when compare=change) ── */}
        {compareMode === "change" && (
          <div className="bg-white rounded-xl px-4 py-3" style={{ border: "1.5px solid #A855F7" }}>
            <div className="flex items-center gap-2 mb-2">
              <GitCommitHorizontal size={13} color="#A855F7" />
              <span className="text-xs font-semibold" style={{ color: "#A855F7" }}>変更タイミングを選択</span>
              <span className="text-[10px] ml-1" style={{ color: "#9CA3AF" }}>このタイミングを起点に前後を比較します</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {CHANGE_EVENTS.map(ev => (
                <button key={ev.id} onClick={() => setSelectedChange(ev.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all"
                  style={selectedChange === ev.id
                    ? { background: "#FDF4FF", border: "1.5px solid #A855F7" }
                    : { background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                  <span className="text-base leading-none">{ev.icon}</span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold" style={{ color: selectedChange === ev.id ? "#A855F7" : "#374151" }}>{ev.date}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{ background: ev.type === "件名変更" ? "#DBEAFE" : "#D1FAE5", color: ev.type === "件名変更" ? "#1D4ED8" : "#065F46" }}>
                        {ev.type}
                      </span>
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>{ev.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* KPI cards */}
        {compareMode === "none" ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "配信数", val: "15,842", sub: "通", accent: true },
              { label: "開封率 / クリック率", val: "31.2%", sub2: "クリック 8.4%" },
              { label: "CV数 / CVR", val: "443", sub: "件", sub2: "CVR 2.8%" },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl px-5 py-4"
                style={{ border: k.accent ? `1.5px solid ${YELLOW}` : "1px solid #EBEBEB", boxShadow: k.accent ? `0 2px 12px ${YELLOW}33` : "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-medium" style={{ color: "#9CA3AF" }}>{k.label}</span>
                  {k.accent && <span className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: YELLOW_LIGHT }}><Mail size={10} color={YELLOW_DARK} /></span>}
                </div>
                <div className="text-2xl font-bold tracking-tight" style={{ color: "#1A1A1A" }}>{k.val}</div>
                {k.sub && <div className="text-xs mt-1" style={{ color: k.accent ? YELLOW_DARK : "#9CA3AF" }}>{k.sub}</div>}
                {k.sub2 && <div className="text-xs mt-0.5" style={{ color: "#6B7280" }}>{k.sub2}</div>}
              </div>
            ))}
          </div>
        ) : (
          /* Before/After KPI summary row */
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: "1px solid #EBEBEB" }}>
            <div className="px-4 py-2.5 flex items-center gap-3" style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
              <GitCommitHorizontal size={13} color="#A855F7" />
              <span className="text-xs font-bold" style={{ color: "#A855F7" }}>
                {changeEvent.date}「{changeEvent.desc}」前後比較
              </span>
              <span className="flex items-center gap-1 text-[10px] ml-auto" style={{ color: "#9CA3AF" }}>
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: BEFORE_COLOR }} /> 変更前
                <span className="w-2.5 h-2.5 rounded-full inline-block ml-2" style={{ background: AFTER_COLOR }} /> 変更後
              </span>
            </div>
            <div className="grid grid-cols-5">
              {DIFFS.map((d, i) => (
                <div key={d.label} className="px-4 py-3 flex flex-col gap-1.5"
                  style={{ borderRight: i < 4 ? "1px solid #F3F4F6" : "none" }}>
                  <div className="text-[10px] font-medium" style={{ color: "#9CA3AF" }}>{d.label}</div>
                  {/* Before */}
                  <div className="flex items-baseline gap-1">
                    <span className="w-2 h-2 rounded-full shrink-0 mt-0.5" style={{ background: BEFORE_COLOR }} />
                    <span className="text-sm font-semibold" style={{ color: "#6B7280" }}>{d.before}</span>
                  </div>
                  {/* Arrow + After */}
                  <div className="flex items-center gap-1">
                    <ArrowRight size={9} color="#D1D5DB" />
                    <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>{d.after}</span>
                    <span className="text-[10px] font-bold px-1 py-0.5 rounded ml-0.5"
                      style={{ background: d.up ? "#DCFCE7" : "#FEE2E2", color: d.up ? "#16A34A" : "#DC2626" }}>
                      {d.diff}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="bg-white rounded-xl p-5 flex-1" style={{ border: "1px solid #EBEBEB" }}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm font-bold" style={{ color: "#1A1A1A" }}>
                {compareMode === "change" ? "前後トレンド" : "配信トレンド"}
              </div>
              {compareMode === "change" && (
                <div className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                  破線 = 変更タイミング（{changeEvent.date}）
                </div>
              )}
            </div>
            {compareMode === "change" && (
              <div className="flex items-center gap-3">
                {[
                  { label: "配信数", key: "delivery" as const },
                  { label: "開封率", key: "open" as const },
                  { label: "クリック率", key: "click" as const },
                  { label: "CVR", key: "cvr" as const },
                ].map(m => (
                  <button key={m.key} onClick={() => setKpiMetric(m.key)}
                    className="text-[10px] font-medium px-2 py-1 rounded-lg transition-all"
                    style={kpiMetric === m.key
                      ? { background: "#FDF4FF", color: "#A855F7", border: "1px solid #A855F7" }
                      : { background: "#F3F4F6", color: "#9CA3AF" }}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chart visualization */}
          <div className="relative" style={{ height: 160 }}>
            <svg width="100%" height="100%" viewBox="0 0 560 160" preserveAspectRatio="none">
              {compareMode === "change" ? (
                <>
                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map((y, i) => (
                    <line key={i} x1="32" y1={160 - y * 140} x2="556" y2={160 - y * 140}
                      stroke="#F3F4F6" strokeWidth="1" />
                  ))}
                  {/* Before bars (blue) */}
                  {CHART_BARS.filter(b => b.phase === "before").map((b, i) => (
                    <rect key={i} x={32 + i * 70 + 8} y={160 - (b.val ?? 0) * 140}
                      width={40} height={(b.val ?? 0) * 140}
                      fill={BEFORE_COLOR} opacity="0.7" rx="3" />
                  ))}
                  {/* Change point line */}
                  <line x1="242" y1="0" x2="242" y2="155"
                    stroke="#A855F7" strokeWidth="2" strokeDasharray="5,4" />
                  {/* Change icon */}
                  <circle cx="242" cy="12" r="10" fill="#A855F7" opacity="0.15" />
                  <text x="242" y="16" textAnchor="middle" fontSize="9" fill="#A855F7" fontWeight="bold">✏</text>
                  {/* After bars (pink) */}
                  {CHART_BARS.filter(b => b.phase === "after").map((b, i) => (
                    <rect key={i} x={242 + 16 + i * 70 + 8} y={160 - (b.val ?? 0) * 140}
                      width={40} height={(b.val ?? 0) * 140}
                      fill={AFTER_COLOR} opacity="0.8" rx="3" />
                  ))}
                  {/* Open rate line — before */}
                  <polyline
                    points={CHART_BARS.filter(b => b.phase === "before").map((b, i) => `${32 + i * 70 + 28},${160 - (OPEN_RATE_LINE[i] ?? 0) / 35 * 140}`).join(" ")}
                    fill="none" stroke={BEFORE_COLOR} strokeWidth="2" strokeDasharray="4,2" opacity="0.5" />
                  {/* Open rate line — after */}
                  <polyline
                    points={CHART_BARS.filter(b => b.phase === "after").map((b, i) => `${242 + 16 + i * 70 + 28},${160 - (OPEN_RATE_LINE[i + 4] ?? 0) / 35 * 140}`).join(" ")}
                    fill="none" stroke={AFTER_COLOR} strokeWidth="2.5" opacity="0.9" />
                  {/* X labels */}
                  {CHART_BARS.map((b, i) => {
                    const x = b.phase === "before" ? 32 + i * 70 + 28
                      : b.phase === "after" ? 242 + 16 + (i - 4) * 70 + 28
                      : 242;
                    if (b.phase === "change") return null;
                    return <text key={i} x={x} y="158" textAnchor="middle" fontSize="8" fill="#D1D5DB">{b.label}</text>;
                  })}
                  {/* "変更前" / "変更後" labels */}
                  <text x="120" y="30" textAnchor="middle" fontSize="9" fill={BEFORE_COLOR} fontWeight="600">変更前</text>
                  <text x="400" y="30" textAnchor="middle" fontSize="9" fill={AFTER_COLOR} fontWeight="600">変更後</text>
                  {/* Shaded regions */}
                  <rect x="32" y="0" width="210" height="155" fill={BEFORE_COLOR} opacity="0.04" />
                  <rect x="258" y="0" width="298" height="155" fill={AFTER_COLOR} opacity="0.04" />
                </>
              ) : (
                <>
                  {/* Normal chart */}
                  {[0.25, 0.5, 0.75].map((y, i) => (
                    <line key={i} x1="0" y1={160 - y * 140} x2="560" y2={160 - y * 140}
                      stroke="#F3F4F6" strokeWidth="1" />
                  ))}
                  {CHART_BARS.map((b, i) => (
                    <rect key={i} x={8 + i * 68 + 4} y={160 - (b.val ?? 0.6) * 140}
                      width={44} height={(b.val ?? 0.6) * 140}
                      fill={YELLOW} opacity="0.8" rx="3" />
                  ))}
                  <polyline
                    points={CHART_BARS.map((b, i) => `${8 + i * 68 + 26},${160 - (OPEN_RATE_LINE[i] ?? 29) / 35 * 140}`).join(" ")}
                    fill="none" stroke="#60A5FA" strokeWidth="2" />
                  {CHART_BARS.map((b, i) => (
                    <text key={i} x={8 + i * 68 + 26} y="158" textAnchor="middle" fontSize="8" fill="#D1D5DB">{b.label}</text>
                  ))}
                </>
              )}
            </svg>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-3 pt-3 flex-wrap" style={{ borderTop: "1px solid #F3F4F6" }}>
            {compareMode === "change" ? (
              <>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: BEFORE_COLOR, opacity: 0.7 }} />変更前・配信数
                </span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: AFTER_COLOR, opacity: 0.8 }} />変更後・配信数
                </span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                  <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={BEFORE_COLOR} strokeWidth="1.5" strokeDasharray="3,2" /></svg>
                  変更前・開封率
                </span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}>
                  <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke={AFTER_COLOR} strokeWidth="2" /></svg>
                  変更後・開封率
                </span>
                <span className="flex items-center gap-1.5 text-xs ml-auto" style={{ color: "#A855F7" }}>
                  <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="#A855F7" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
                  変更タイミング
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: YELLOW }} /> 配信数</span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#60A5FA" }} /> 開封率</span>
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "#9CA3AF" }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#34D399" }} /> クリック率</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
