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

function fmt(v: number, isRate: boolean) {
  return isRate ? `${(v * 100).toFixed(1)}%` : v.toLocaleString();
}

function generateData(baseOffset: number) {
  const weeks = ["W1", "W2", "W3", "W4", "W5", "W6"];
  return weeks.map((w) => ({
    period: w,
    "シナリオA__openRate": 0.28 + Math.sin(baseOffset + weeks.indexOf(w) * 0.8) * 0.06,
    "シナリオA__clickRate": 0.08 + Math.cos(baseOffset + weeks.indexOf(w) * 0.7) * 0.02,
    "シナリオA__deliveryCount": 12000 + Math.floor(Math.random() * 2000),
    "シナリオB__openRate": 0.32 + Math.sin(baseOffset + weeks.indexOf(w) * 0.9 + 1) * 0.05,
    "シナリオB__clickRate": 0.1 + Math.cos(baseOffset + weeks.indexOf(w) * 0.6) * 0.025,
    "シナリオB__deliveryCount": 9500 + Math.floor(Math.random() * 1800),
    "テンプレX__openRate": 0.25 + Math.sin(baseOffset + weeks.indexOf(w)) * 0.04,
    "テンプレX__clickRate": 0.07 + Math.sin(baseOffset + weeks.indexOf(w) * 0.5) * 0.015,
    "テンプレX__deliveryCount": 7200 + Math.floor(Math.random() * 1500),
  }));
}

const BEFORE_DATA = generateData(0);
const AFTER_DATA = generateData(1.5);

function MatrixTable({
  label,
  accent,
  data,
}: {
  label: string;
  accent: string;
  data: ReturnType<typeof generateData>;
}) {
  const periods = data.map((d) => d.period);
  return (
    <div className="flex-1 min-w-0 rounded-xl overflow-hidden" style={{ border: "1px solid #EBEBEB" }}>
      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: accent, borderBottom: "1px solid #EBEBEB" }}>
        <span className="text-xs font-bold" style={{ color: "#fff" }}>{label}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse" style={{ background: "#fff" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "#6B7280", minWidth: 100, position: "sticky", left: 0, background: "#F9FAFB" }}>行</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "#6B7280", minWidth: 64, position: "sticky", left: 100, background: "#F9FAFB", borderRight: "1px solid #F3F4F6" }}>指標</th>
              {periods.map((p) => (
                <th key={p} className="px-2 py-2 text-right font-medium whitespace-nowrap" style={{ color: "#6B7280", minWidth: 60 }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_SERIES.flatMap((s, si) =>
              METRICS.map((m, mi) => (
                <tr key={`${s.key}__${m.value}`} style={{ borderBottom: "1px solid #F9FAFB", background: mi === 0 && si % 2 === 0 ? "#FAFAFA" : "#fff" }}>
                  {mi === 0 ? (
                    <td rowSpan={METRICS.length} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: SERIES_COLORS[si], position: "sticky", left: 0, background: "inherit", verticalAlign: "middle", borderRight: "1px solid #F3F4F6" }}>
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mr-1" style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                        {s.type === "scenario" ? "SC" : "TP"}
                      </span>
                      {s.key}
                    </td>
                  ) : null}
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#6B7280", position: "sticky", left: 100, background: "inherit", borderRight: "1px solid #F3F4F6" }}>{m.label}</td>
                  {periods.map((p, pi) => {
                    const v = data[pi][`${s.key}__${m.value}` as keyof (typeof data)[0]] as number;
                    return (
                      <td key={p} className="px-2 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "#374151" }}>
                        {fmt(v, m.isRate)}
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
  );
}

export function VariantA() {
  const [selectedCampaign, setSelectedCampaign] = useState(MOCK_CAMPAIGNS[0]);
  const [compareMode, setCompareMode] = useState<"none" | "change">("none");

  return (
    <div className="min-h-screen p-5" style={{ background: "#F8F8F8", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div className="mb-4 rounded-xl px-5 py-3 flex items-center gap-3 flex-wrap" style={{ background: "#fff", border: "1px solid #EBEBEB" }}>
        <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>マトリクス表</span>
        <div className="flex-1" />
        {/* GroupBy */}
        <div className="flex gap-1">
          {["日別", "週別", "月別"].map((t, i) => (
            <button key={t} className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={i === 1 ? { background: "#1A1A1A", color: "#fff" } : { background: "#F3F4F6", color: "#6B7280" }}>
              {t}
            </button>
          ))}
        </div>
        {/* Compare axis */}
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

      {/* Campaign selector (shown when compare mode = change) */}
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

      {compareMode === "none" ? (
        /* Normal single matrix */
        <MatrixTable label="全期間" accent="#6366F1" data={BEFORE_DATA} />
      ) : (
        /* Side-by-side before/after */
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: "#DBEAFE", color: "#1D4ED8" }}>
              施策「{selectedCampaign.title}」前後比較
            </span>
            <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{selectedCampaign.startDate} を境に分割</span>
          </div>
          <div className="flex gap-3">
            <MatrixTable label="▲ 施策前" accent="#94A3B8" data={BEFORE_DATA} />
            <MatrixTable label="▼ 施策後" accent="#10B981" data={AFTER_DATA} />
          </div>
        </div>
      )}
    </div>
  );
}
