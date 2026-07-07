import { useState } from "react";

const SERIES_COLORS = ["#6366F1", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6"];

const MOCK_CAMPAIGNS = [
  { id: 1, title: "5月GW施策", startDate: "2025-05-01" },
  { id: 2, title: "6月リテンション", startDate: "2025-06-10" },
];

const MOCK_SERIES = [
  { key: "シナリオA", type: "scenario" },
  { key: "シナリオB", type: "scenario" },
  { key: "テンプレX", type: "template" },
];

const METRICS = [
  { value: "openRate", label: "開封率", isRate: true },
  { value: "clickRate", label: "CTR", isRate: true },
  { value: "deliveryCount", label: "配信数", isRate: false },
];

const PERIODS = ["W1", "W2", "W3", "W4", "W5", "W6"];

function seedVal(si: number, mi: number, pi: number, offset: number) {
  const base = [0.28, 0.08, 12000];
  const amp = [0.06, 0.025, 2000];
  return base[mi] + amp[mi] * Math.sin(si * 1.3 + mi * 0.7 + pi * 0.9 + offset);
}

function fmt(v: number, isRate: boolean) {
  return isRate ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString();
}

function diffColor(diff: number, isRate: boolean) {
  const threshold = isRate ? 0.005 : 100;
  if (diff > threshold) return { bg: "#D1FAE5", text: "#059669" };
  if (diff < -threshold) return { bg: "#FEE2E2", text: "#DC2626" };
  return { bg: "#F3F4F6", text: "#6B7280" };
}

function diffLabel(diff: number, isRate: boolean) {
  if (isRate) {
    const ppt = diff * 100;
    return `${ppt >= 0 ? "+" : ""}${ppt.toFixed(1)}pt`;
  }
  return `${diff >= 0 ? "+" : ""}${Math.round(diff).toLocaleString()}`;
}

export function VariantB() {
  const [selectedCampaign, setSelectedCampaign] = useState(MOCK_CAMPAIGNS[0]);
  const [compareMode, setCompareMode] = useState<"none" | "change">("none");

  return (
    <div className="min-h-screen p-5" style={{ background: "#F8F8F8", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div className="mb-4 rounded-xl px-5 py-3 flex items-center gap-3 flex-wrap" style={{ background: "#fff", border: "1px solid #EBEBEB" }}>
        <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>マトリクス表</span>
        <div className="flex-1" />
        <div className="flex gap-1">
          {["日別", "週別", "月別"].map((t, i) => (
            <button key={t} className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={i === 1 ? { background: "#1A1A1A", color: "#fff" } : { background: "#F3F4F6", color: "#6B7280" }}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-[10px] font-semibold" style={{ color: "#9CA3AF" }}>比較軸</span>
          <button
            onClick={() => setCompareMode(compareMode === "none" ? "change" : "none")}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
            style={compareMode === "change"
              ? { background: "#1A1A1A", color: "#fff" }
              : { background: "#F3F4F6", color: "#6B7280" }}>
            ⚡ 施策タイミング
          </button>
        </div>
      </div>

      {compareMode === "change" && (
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: "#fff", border: "1px solid #EBEBEB" }}>
          <span className="text-[10px] font-semibold" style={{ color: "#9CA3AF" }}>施策の開始日を起点に前後を比較します</span>
          <div className="flex gap-2">
            {MOCK_CAMPAIGNS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCampaign(c)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
                style={selectedCampaign.id === c.id
                  ? { background: "#1A1A1A", color: "#fff" }
                  : { background: "#F3F4F6", color: "#6B7280" }}>
                ⚡ {c.title}
                <span className="text-[10px] opacity-70">{c.startDate}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matrix table */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #EBEBEB", background: "#fff" }}>
        {compareMode === "change" && (
          <div className="px-4 py-2 flex items-center gap-2" style={{ background: "#F0FDF4", borderBottom: "1px solid #EBEBEB" }}>
            <span className="text-xs font-semibold" style={{ color: "#059669" }}>施策「{selectedCampaign.title}」前後比較</span>
            <span className="text-[10px]" style={{ color: "#9CA3AF" }}>— 各セルに前後差分（▲増 / ▼減）を重ねて表示</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "#6B7280", minWidth: 110, position: "sticky", left: 0, background: "#F9FAFB" }}>行</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "#6B7280", minWidth: 64, position: "sticky", left: 110, background: "#F9FAFB", borderRight: "1px solid #F3F4F6" }}>指標</th>
                {PERIODS.map((p) => (
                  <th key={p} className="px-2 py-2 text-right font-medium whitespace-nowrap" style={{ color: "#6B7280", minWidth: compareMode === "change" ? 90 : 64 }}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_SERIES.flatMap((s, si) =>
                METRICS.map((m, mi) => (
                  <tr key={`${s.key}__${m.value}`} style={{ borderBottom: "1px solid #F9FAFB" }}>
                    {mi === 0 ? (
                      <td rowSpan={METRICS.length} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: SERIES_COLORS[si], position: "sticky", left: 0, background: "#fff", verticalAlign: "middle", borderRight: "1px solid #F3F4F6" }}>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mr-1" style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                          {s.type === "scenario" ? "SC" : "TP"}
                        </span>
                        {s.key}
                      </td>
                    ) : null}
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#6B7280", position: "sticky", left: 110, background: "#fff", borderRight: "1px solid #F3F4F6" }}>{m.label}</td>
                    {PERIODS.map((_, pi) => {
                      const v = seedVal(si, mi, pi, 0);
                      const vAfter = seedVal(si, mi, pi, 1.5);
                      const diff = vAfter - v;
                      const dc = diffColor(diff, m.isRate);
                      return (
                        <td key={pi} className="px-2 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "#374151" }}>
                          <div>{fmt(compareMode === "change" ? vAfter : v, m.isRate)}</div>
                          {compareMode === "change" && (
                            <div className="mt-0.5 rounded text-[9px] font-semibold px-1 inline-block" style={{ background: dc.bg, color: dc.text }}>
                              {diffLabel(diff, m.isRate)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {compareMode === "change" && (
        <div className="mt-3 flex items-center gap-4 text-[10px]" style={{ color: "#6B7280" }}>
          <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: "#D1FAE5", color: "#059669" }}>+0.0pt</span> 施策後に改善</span>
          <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: "#FEE2E2", color: "#DC2626" }}>-0.0pt</span> 施策後に悪化</span>
          <span className="flex items-center gap-1"><span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: "#F3F4F6", color: "#6B7280" }}>±0</span> 変化なし</span>
        </div>
      )}
    </div>
  );
}
