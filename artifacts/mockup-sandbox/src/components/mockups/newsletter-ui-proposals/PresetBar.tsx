import { useState } from "react";
import { BookmarkPlus, X, SplitSquareHorizontal, ChevronDown, RefreshCw, Mail, TrendingUp, TrendingDown } from "lucide-react";

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";

const PRESETS = [
  { id: "p1", name: "今月・全体", dates: "2026/06/01〜06/24", segments: [] },
  { id: "p2", name: "先月・新規", dates: "2026/05/01〜05/31", segments: ["新規"] },
  { id: "p3", name: "Q1比較", dates: "2026/01/01〜03/31", segments: ["既存", "新規"] },
  { id: "p4", name: "セール期間", dates: "2025/12/20〜12/31", segments: ["既存"] },
];

const KPI_A = { delivery: "15,842", open: "31.2%", click: "8.4%", cv: "2.8%" };
const KPI_B = { delivery: "12,400", open: "28.6%", click: "7.1%", cv: "3.2%" };

function KpiCompare({ label, a, b, up }: { label: string; a: string; b: string; up: boolean }) {
  return (
    <div className="flex-1 bg-white rounded-xl p-4" style={{ border: "1px solid #EBEBEB" }}>
      <div className="text-[10px] font-medium mb-2" style={{ color: "#9CA3AF" }}>{label}</div>
      <div className="flex items-end gap-3">
        <div>
          <div className="text-[10px] mb-0.5 font-semibold" style={{ color: YELLOW_DARK }}>A: 今月</div>
          <div className="text-xl font-bold" style={{ color: "#1A1A1A" }}>{a}</div>
        </div>
        <div className="pb-1">
          {up
            ? <TrendingUp size={14} color="#22C55E" />
            : <TrendingDown size={14} color="#EF4444" />}
        </div>
        <div>
          <div className="text-[10px] mb-0.5 font-semibold" style={{ color: "#6366F1" }}>B: 先月</div>
          <div className="text-xl font-bold" style={{ color: "#6B7280" }}>{b}</div>
        </div>
      </div>
    </div>
  );
}

export function PresetBar() {
  const [activePreset, setActivePreset] = useState("p1");
  const [compareMode, setCompareMode] = useState(false);
  const [comparePreset, setComparePreset] = useState("p2");
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");

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

      {/* ── Preset Bar ── */}
      <div className="bg-white px-6 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
        <span className="text-[10px] font-semibold shrink-0" style={{ color: "#9CA3AF" }}>保存済み</span>

        {/* Preset chips */}
        <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePreset(p.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0"
              style={activePreset === p.id
                ? { background: YELLOW, color: "#fff" }
                : { background: "#F3F4F6", color: "#6B7280" }}
            >
              {p.name}
              {activePreset === p.id && (
                <span className="ml-0.5 opacity-70 hover:opacity-100">
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Save current */}
        {saving ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              className="text-xs px-2 py-1 rounded-lg outline-none"
              style={{ border: `1.5px solid ${YELLOW}`, width: 120 }}
              placeholder="名前を入力…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              autoFocus
            />
            <button
              className="text-xs px-2.5 py-1 rounded-lg font-semibold"
              style={{ background: YELLOW, color: "#fff" }}
              onClick={() => setSaving(false)}
            >保存</button>
            <button className="text-xs px-2 py-1 rounded-lg" style={{ color: "#9CA3AF" }} onClick={() => setSaving(false)}>
              キャンセル
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSaving(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-all"
            style={{ border: `1.5px dashed ${YELLOW}`, color: YELLOW_DARK, background: YELLOW_LIGHT }}
          >
            <BookmarkPlus size={11} /> 保存
          </button>
        )}

        {/* Compare toggle */}
        <button
          onClick={() => setCompareMode(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 transition-all"
          style={compareMode
            ? { background: "#EEF2FF", color: "#6366F1", border: "1.5px solid #6366F1" }
            : { background: "#F3F4F6", color: "#6B7280", border: "1.5px solid transparent" }}
        >
          <SplitSquareHorizontal size={11} /> 比較
        </button>
      </div>

      <div className="px-6 py-4 flex flex-col gap-4">
        {/* Compare mode: preset selector */}
        {compareMode && (
          <div className="bg-white rounded-xl px-4 py-3 flex items-center gap-3" style={{ border: "1.5px solid #6366F1" }}>
            <SplitSquareHorizontal size={14} color="#6366F1" />
            <span className="text-xs font-semibold" style={{ color: "#6366F1" }}>比較モード</span>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: YELLOW, color: "#fff" }}>A</span>
              <span className="text-xs font-medium" style={{ color: "#1A1A1A" }}>
                {PRESETS.find(p => p.id === activePreset)?.name}
              </span>
            </div>
            <span className="text-xs" style={{ color: "#D1D5DB" }}>vs</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#6366F1", color: "#fff" }}>B</span>
              <select
                className="text-xs rounded-lg px-2 py-0.5 outline-none"
                style={{ border: "1px solid #E5E7EB", color: "#374151" }}
                value={comparePreset}
                onChange={e => setComparePreset(e.target.value)}
              >
                {PRESETS.filter(p => p.id !== activePreset).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium" style={{ background: "#fff", border: "1px solid #EBEBEB", color: "#6B7280" }}>
            {PRESETS.find(p => p.id === activePreset)?.dates} <ChevronDown size={11} />
          </button>
          {PRESETS.find(p => p.id === activePreset)?.segments.map(s => (
            <span key={s} className="text-xs px-2 py-1 rounded-lg font-medium" style={{ background: YELLOW_LIGHT, color: YELLOW_DARK, border: `1px solid ${YELLOW}` }}>
              {s}
            </span>
          ))}
          <div className="flex gap-1 ml-auto">
            {["日別", "週別", "月別", "テンプレ別"].map(t => (
              <button key={t} className="px-3 py-1.5 text-xs rounded-lg font-medium" style={{ background: t === "月別" ? YELLOW_LIGHT : "#fff", color: t === "月別" ? YELLOW_DARK : "#9CA3AF", border: `1px solid ${t === "月別" ? YELLOW : "#EBEBEB"}` }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* KPI area */}
        {compareMode ? (
          <div className="grid grid-cols-4 gap-3">
            <KpiCompare label="配信数" a="15,842" b="12,400" up={true} />
            <KpiCompare label="開封率" a="31.2%" b="28.6%" up={true} />
            <KpiCompare label="クリック率" a="8.4%" b="7.1%" up={true} />
            <KpiCompare label="CVR" a="2.8%" b="3.2%" up={false} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "配信数", val: "15,842", sub: "通", accent: true },
              { label: "開封率 / クリック率", val: "31.2%", sub2: "クリック 8.4%" },
              { label: "CV数 / CVR", val: "428", sub: "件", sub2: "CVR 2.8%" },
            ].map(k => (
              <div key={k.label} className="bg-white rounded-xl px-5 py-4" style={{ border: k.accent ? `1.5px solid ${YELLOW}` : "1px solid #EBEBEB", boxShadow: k.accent ? `0 2px 12px ${YELLOW}33` : "0 1px 4px rgba(0,0,0,0.04)" }}>
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
        )}

        {/* Chart placeholder */}
        <div className="bg-white rounded-xl p-5" style={{ border: "1px solid #EBEBEB" }}>
          <div className="text-sm font-bold mb-3" style={{ color: "#1A1A1A" }}>配信トレンド{compareMode ? "（A vs B 重ね表示）" : ""}</div>
          <div className="rounded-lg flex items-center justify-center" style={{ height: 160, background: "#FAFAFA", border: "1px dashed #E5E7EB" }}>
            <div className="text-center">
              <div className="text-xs font-medium mb-1" style={{ color: "#9CA3AF" }}>
                {compareMode ? "A（黄）・B（藍）2系列を重ねて表示" : "配信数（棒）＋ 開封率／クリック率（折れ線）"}
              </div>
              <div className="flex items-center gap-4 justify-center mt-2">
                {compareMode ? (
                  <>
                    <span className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}><span className="w-3 h-3 rounded-full inline-block" style={{ background: YELLOW }} /> A: 今月</span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}><span className="w-3 h-3 rounded-full inline-block" style={{ background: "#6366F1" }} /> B: 先月</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}><span className="w-3 h-3 rounded-full inline-block" style={{ background: YELLOW }} /> 配信数</span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}><span className="w-3 h-3 rounded-full inline-block" style={{ background: "#60A5FA" }} /> 開封率</span>
                    <span className="flex items-center gap-1 text-xs" style={{ color: "#9CA3AF" }}><span className="w-3 h-3 rounded-full inline-block" style={{ background: "#34D399" }} /> クリック率</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
