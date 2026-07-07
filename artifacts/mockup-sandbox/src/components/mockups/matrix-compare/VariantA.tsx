import { useState } from "react";

const SERIES_COLORS = ["#6366F1", "#F59E0B", "#10B981"];

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

function seed(si: number, mi: number, pi: number, offset: number) {
  const base = [0.28, 0.08, 12000];
  const amp = [0.06, 0.025, 2000];
  return base[mi] + amp[mi] * Math.sin(si * 1.3 + mi * 0.7 + pi * 0.9 + offset);
}

function fmt(v: number, isRate: boolean) {
  return isRate ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString();
}

export function VariantA() {
  const [selectedCampaign, setSelectedCampaign] = useState(MOCK_CAMPAIGNS[0]);
  const [compareMode, setCompareMode] = useState<"none" | "change">("none");

  return (
    <div className="min-h-screen p-5" style={{ background: "#F8F8F8", fontFamily: "system-ui, sans-serif" }}>

      {/* ── Controls bar ── */}
      <div className="mb-3 rounded-xl px-5 py-3 flex items-center gap-3 flex-wrap"
        style={{ background: "#fff", border: "1px solid #EBEBEB" }}>
        <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>マトリクス表</span>
        <div className="flex-1" />
        {/* GroupBy */}
        <div className="flex gap-1">
          {(["日別", "週別", "月別"] as const).map((t, i) => (
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

      {/* ── Campaign selector ── */}
      {compareMode === "change" && (
        <div className="mb-3 rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap"
          style={{ background: "#fff", border: "1px solid #EBEBEB" }}>
          <span className="text-[10px]" style={{ color: "#9CA3AF" }}>施策の開始日を起点に前後を比較します</span>
          <div className="flex gap-2">
            {MOCK_CAMPAIGNS.map((c) => (
              <button key={c.id} onClick={() => setSelectedCampaign(c)}
                className="px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5"
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

      {/* ── Matrix table ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #EBEBEB", background: "#fff" }}>

        {compareMode === "change" && (
          <div className="px-4 py-2 flex items-center gap-2"
            style={{ background: "#F8FAFC", borderBottom: "1px solid #F3F4F6" }}>
            <span className="text-xs font-semibold" style={{ color: "#1A1A1A" }}>
              施策「{selectedCampaign.title}」前後比較
            </span>
            <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
              {selectedCampaign.startDate} 前後
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="text-[11px] border-collapse" style={{ width: "max-content", minWidth: "100%" }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                {/* Sticky: series */}
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap"
                  style={{ color: "#6B7280", minWidth: 110, position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB" }}>
                  シリーズ
                </th>
                {/* Sticky: metric */}
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap"
                  style={{ color: "#6B7280", minWidth: 56, position: "sticky", left: 110, zIndex: 3, background: "#F9FAFB", borderRight: "2px solid #E5E7EB" }}>
                  指標
                </th>

                {compareMode === "none" ? (
                  /* Normal: one set of period columns */
                  PERIODS.map((p) => (
                    <th key={p} className="px-2 py-2 text-right font-medium whitespace-nowrap"
                      style={{ color: "#6B7280", minWidth: 62 }}>
                      {p}
                    </th>
                  ))
                ) : (
                  /* Compare: "前" group + divider + "後" group */
                  <>
                    <th colSpan={PERIODS.length} className="px-3 py-1.5 text-center font-semibold text-[10px] whitespace-nowrap"
                      style={{ color: "#94A3B8", background: "#F1F5F9", borderRight: "2px solid #CBD5E1", letterSpacing: "0.04em" }}>
                      ▲ 施策前
                    </th>
                    <th colSpan={PERIODS.length} className="px-3 py-1.5 text-center font-semibold text-[10px] whitespace-nowrap"
                      style={{ color: "#10B981", background: "#F0FDF4", letterSpacing: "0.04em" }}>
                      ▼ 施策後
                    </th>
                  </>
                )}
              </tr>

              {/* Sub-header row for period labels in compare mode */}
              {compareMode === "change" && (
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                  <th style={{ position: "sticky", left: 0, zIndex: 3, background: "#F9FAFB" }} />
                  <th style={{ position: "sticky", left: 110, zIndex: 3, background: "#F9FAFB", borderRight: "2px solid #E5E7EB" }} />
                  {PERIODS.map((p) => (
                    <th key={`b-${p}`} className="px-2 py-1 text-right font-medium whitespace-nowrap"
                      style={{ color: "#94A3B8", minWidth: 62, fontSize: 10 }}>
                      {p}
                    </th>
                  ))}
                  {PERIODS.map((p, i) => (
                    <th key={`a-${p}`} className="px-2 py-1 text-right font-medium whitespace-nowrap"
                      style={{ color: "#10B981", minWidth: 62, fontSize: 10, borderLeft: i === 0 ? "2px solid #CBD5E1" : undefined }}>
                      {p}
                    </th>
                  ))}
                </tr>
              )}
            </thead>

            <tbody>
              {MOCK_SERIES.flatMap((s, si) =>
                METRICS.map((m, mi) => {
                  const isFirstMetric = mi === 0;
                  const rowBg = si % 2 === 0 ? "#fff" : "#FAFAFA";
                  return (
                    <tr key={`${s.key}__${m.value}`}
                      style={{ borderBottom: mi === METRICS.length - 1 ? "1px solid #E5E7EB" : "1px solid #F3F4F6", background: rowBg }}>

                      {/* Series cell — only on first metric row, spans all metrics */}
                      {isFirstMetric ? (
                        <td rowSpan={METRICS.length}
                          className="px-3 py-2 font-medium whitespace-nowrap"
                          style={{ color: SERIES_COLORS[si], position: "sticky", left: 0, zIndex: 2, background: rowBg, verticalAlign: "middle" }}>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold mr-1"
                            style={{ background: s.type === "scenario" ? "#EDE9FE" : "#FEF3C7", color: s.type === "scenario" ? "#7C3AED" : "#D97706" }}>
                            {s.type === "scenario" ? "SC" : "TP"}
                          </span>
                          {s.key}
                        </td>
                      ) : null}

                      {/* Metric label */}
                      <td className="px-3 py-1.5 whitespace-nowrap"
                        style={{ color: "#6B7280", position: "sticky", left: 110, zIndex: 2, background: rowBg, borderRight: "2px solid #E5E7EB" }}>
                        {m.label}
                      </td>

                      {/* Data cells */}
                      {compareMode === "none" ? (
                        PERIODS.map((_, pi) => (
                          <td key={pi} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                            style={{ color: "#374151" }}>
                            {fmt(seed(si, mi, pi, 0), m.isRate)}
                          </td>
                        ))
                      ) : (
                        <>
                          {/* Before columns */}
                          {PERIODS.map((_, pi) => (
                            <td key={`b${pi}`} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                              style={{ color: "#64748B" }}>
                              {fmt(seed(si, mi, pi, 0), m.isRate)}
                            </td>
                          ))}
                          {/* After columns */}
                          {PERIODS.map((_, pi) => (
                            <td key={`a${pi}`} className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap"
                              style={{ color: "#374151", borderLeft: pi === 0 ? "2px solid #CBD5E1" : undefined }}>
                              {fmt(seed(si, mi, pi, 1.5), m.isRate)}
                            </td>
                          ))}
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
