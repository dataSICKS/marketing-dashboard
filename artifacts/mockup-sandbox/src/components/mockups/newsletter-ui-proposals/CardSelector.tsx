import { useState } from "react";
import { Plus, Trash2, Check, BarChart3, ChevronDown, RefreshCw, Mail, Clock } from "lucide-react";

const YELLOW = "#FBBF24";
const YELLOW_LIGHT = "#FEF3C7";
const YELLOW_DARK = "#D97706";

interface Preset {
  id: string;
  name: string;
  dates: string;
  segments: string[];
  groupBy: string;
  lastUsed: string;
  color: string;
}

const PRESETS: Preset[] = [
  { id: "p1", name: "今月・全体", dates: "2026/06/01〜06/24", segments: [], groupBy: "日別", lastUsed: "たった今", color: YELLOW },
  { id: "p2", name: "先月・新規セグ", dates: "2026/05/01〜05/31", segments: ["新規"], groupBy: "週別", lastUsed: "2日前", color: "#6366F1" },
  { id: "p3", name: "Q1まとめ", dates: "2026/01/01〜03/31", segments: ["既存", "新規"], groupBy: "月別", lastUsed: "1週間前", color: "#10B981" },
  { id: "p4", name: "年末セール", dates: "2025/12/20〜12/31", segments: ["既存"], groupBy: "テンプレ別", lastUsed: "1ヶ月前", color: "#F59E0B" },
];

export function CardSelector() {
  const [selected, setSelected] = useState<string[]>(["p1"]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [comparing, setComparing] = useState(false);

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 2 ? [...prev, id] : [prev[1], id]
    );
  };

  const presetA = PRESETS.find(p => p.id === selected[0]);
  const presetB = PRESETS.find(p => p.id === selected[1]);

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
        {/* Preset cards section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-bold" style={{ color: "#1A1A1A" }}>保存済みビュー</div>
              <div className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>最大2件選択して比較できます</div>
            </div>
            <div className="flex items-center gap-2">
              {selected.length === 2 && (
                <button
                  onClick={() => setComparing(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={comparing
                    ? { background: "#6366F1", color: "#fff" }
                    : { background: "#EEF2FF", color: "#6366F1", border: "1.5px solid #6366F1" }}
                >
                  <BarChart3 size={11} />
                  {comparing ? "比較中" : "この2件を比較"}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {PRESETS.map(p => {
              const isSelected = selected.includes(p.id);
              const selIdx = selected.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className="relative bg-white rounded-xl p-4 text-left transition-all"
                  style={{
                    border: isSelected ? `2px solid ${p.color}` : "1.5px solid #EBEBEB",
                    boxShadow: isSelected ? `0 2px 12px ${p.color}22` : "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  {/* Selection badge */}
                  {isSelected && (
                    <span
                      className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: p.color, color: selIdx === 0 ? "#1A1A1A" : "#fff" }}
                    >
                      {selIdx === 0 ? "A" : "B"}
                    </span>
                  )}
                  <div className="flex items-start gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: p.color }} />
                    <div className="font-semibold text-sm leading-tight" style={{ color: "#1A1A1A" }}>{p.name}</div>
                  </div>
                  <div className="text-[11px] mb-2" style={{ color: "#6B7280" }}>{p.dates}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#F3F4F6", color: "#6B7280" }}>{p.groupBy}</span>
                    {p.segments.map(s => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: YELLOW_LIGHT, color: YELLOW_DARK }}>{s}</span>
                    ))}
                    {p.segments.length === 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>全体</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-2.5 pt-2" style={{ borderTop: "1px solid #F3F4F6" }}>
                    <Clock size={9} color="#D1D5DB" />
                    <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{p.lastUsed}</span>
                  </div>
                </button>
              );
            })}

            {/* Add new preset card */}
            {showSaveForm ? (
              <div className="bg-white rounded-xl p-4" style={{ border: `1.5px dashed ${YELLOW}` }}>
                <div className="text-[11px] font-semibold mb-2" style={{ color: YELLOW_DARK }}>現在の条件を保存</div>
                <input
                  className="w-full text-xs px-2.5 py-2 rounded-lg outline-none mb-2"
                  style={{ border: `1.5px solid ${YELLOW}`, color: "#374151" }}
                  placeholder="ビュー名…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                />
                <div className="text-[10px] mb-3" style={{ color: "#9CA3AF" }}>2026/06/01〜06/24 · 日別</div>
                <div className="flex gap-1.5">
                  <button className="flex-1 py-1.5 text-xs font-semibold rounded-lg" style={{ background: YELLOW, color: "#fff" }} onClick={() => setShowSaveForm(false)}>保存</button>
                  <button className="px-3 py-1.5 text-xs rounded-lg" style={{ color: "#9CA3AF", border: "1px solid #E5E7EB" }} onClick={() => setShowSaveForm(false)}>×</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveForm(true)}
                className="bg-white rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all"
                style={{ border: `1.5px dashed #D1D5DB`, minHeight: 120 }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: YELLOW_LIGHT }}>
                  <Plus size={16} color={YELLOW_DARK} />
                </div>
                <span className="text-xs font-medium" style={{ color: "#9CA3AF" }}>現在の条件を保存</span>
              </button>
            )}
          </div>
        </div>

        {/* Compare view */}
        {comparing && presetA && presetB && (
          <div>
            <div className="text-sm font-bold mb-3" style={{ color: "#1A1A1A" }}>比較レポート</div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { preset: presetA, kpis: [{ label: "配信数", val: "15,842", diff: "+27.8%" }, { label: "開封率", val: "31.2%", diff: "+2.6pt" }, { label: "CVR", val: "2.8%", diff: "−0.4pt" }] },
                { preset: presetB, kpis: [{ label: "配信数", val: "12,400", diff: "" }, { label: "開封率", val: "28.6%", diff: "" }, { label: "CVR", val: "3.2%", diff: "" }] },
              ].map(({ preset, kpis }, col) => (
                <div key={preset.id} className="bg-white rounded-xl overflow-hidden" style={{ border: `1.5px solid ${preset.color}` }}>
                  <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: preset.color }}>
                    <span className="text-xs font-bold" style={{ color: col === 0 ? "#1A1A1A" : "#fff" }}>{col === 0 ? "A" : "B"}: {preset.name}</span>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2">
                    {kpis.map(k => (
                      <div key={k.label} className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: "#6B7280" }}>{k.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>{k.val}</span>
                          {k.diff && (
                            <span className="text-[10px] font-semibold px-1 py-0.5 rounded" style={{ background: k.diff.startsWith("+") ? "#DCFCE7" : "#FEE2E2", color: k.diff.startsWith("+") ? "#16A34A" : "#DC2626" }}>
                              {k.diff}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="bg-white rounded-xl p-5" style={{ border: "1px solid #EBEBEB" }}>
          <div className="text-sm font-bold mb-3" style={{ color: "#1A1A1A" }}>
            配信トレンド {selected.length === 2 && comparing && `— ${presetA?.name} vs ${presetB?.name}`}
          </div>
          <div className="rounded-lg flex items-center justify-center" style={{ height: 140, background: "#FAFAFA", border: "1px dashed #E5E7EB" }}>
            <span className="text-xs" style={{ color: "#9CA3AF" }}>
              {comparing ? "2ビューのトレンドを重ね表示" : "選択中ビューのトレンドを表示"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
