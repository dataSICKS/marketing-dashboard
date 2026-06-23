const MOCK_SUMMARY = { deliveryCount: 188129, openRate: 0.238, clickRate: 0.028, cvr: 0.004, cvCount: 725 };
const MOCK_ITEMS = [
  { label: "06/01", deliveryCount: 1820, openRate: 0.241, clickRate: 0.031 },
  { label: "06/02", deliveryCount: 1650, openRate: 0.228, clickRate: 0.027 },
  { label: "06/03", deliveryCount: 1930, openRate: 0.255, clickRate: 0.033 },
  { label: "06/04", deliveryCount: 1410, openRate: 0.219, clickRate: 0.022 },
  { label: "06/05", deliveryCount: 2100, openRate: 0.262, clickRate: 0.035 },
  { label: "06/06", deliveryCount: 1780, openRate: 0.244, clickRate: 0.029 },
  { label: "06/07", deliveryCount: 1590, openRate: 0.233, clickRate: 0.026 },
];

const fmt = (n: number) => n.toLocaleString("ja-JP");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const BAR_MAX = Math.max(...MOCK_ITEMS.map(d => d.deliveryCount));

export function DesignC() {
  return (
    <div className="min-h-screen flex" style={{ background: "#f9f8f6", fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col py-8 px-5" style={{ background: "#1a1a1a", color: "#f9f8f6" }}>
        <div className="text-xs font-medium mb-8" style={{ color: "rgba(249,248,246,0.35)", letterSpacing: "0.12em" }}>NEWSLETTER</div>
        <nav className="flex flex-col gap-1">
          {[
            { label: "レポート", active: true },
            { label: "シナリオ", active: false },
            { label: "設定", active: false },
          ].map(item => (
            <a key={item.label} className="px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
              style={item.active
                ? { background: "rgba(249,248,246,0.1)", color: "#f9f8f6", fontWeight: 500 }
                : { color: "rgba(249,248,246,0.4)" }}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto">
          <button className="w-full py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: "#f9f8f6", color: "#1a1a1a" }}>
            更新
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto flex flex-col gap-8">
        {/* Header */}
        <div>
          <div className="text-xs font-medium mb-1.5" style={{ color: "#9ca3af", letterSpacing: "0.08em" }}>2026年6月 · 日別</div>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: "#111" }}>メルマガレポート</h1>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: "配信数", value: fmt(MOCK_SUMMARY.deliveryCount), sub: "通" },
            { label: "開封率", value: pct(MOCK_SUMMARY.openRate), sub: "avg" },
            { label: "クリック率", value: pct(MOCK_SUMMARY.clickRate), sub: "avg" },
            { label: "CVR", value: pct(MOCK_SUMMARY.cvr), sub: "avg" },
            { label: "CV数", value: fmt(MOCK_SUMMARY.cvCount), sub: "件" },
          ].map((kpi, i) => (
            <div key={kpi.label} className="rounded-2xl p-5" style={{
              background: i === 0 ? "#1a1a1a" : "white",
              color: i === 0 ? "white" : "#111",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
            }}>
              <div className="text-xs font-medium mb-3" style={{ color: i === 0 ? "rgba(255,255,255,0.5)" : "#9ca3af" }}>{kpi.label}</div>
              <div className="text-2xl font-semibold tracking-tight">{kpi.value}</div>
              <div className="text-xs mt-1" style={{ color: i === 0 ? "rgba(255,255,255,0.35)" : "#d1d5db" }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="rounded-2xl p-6 bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-semibold" style={{ color: "#111" }}>配信トレンド</span>
            <div className="flex gap-3">
              {["日別", "週別", "月別", "シナリオ別"].map((t, i) => (
                <button key={t} className="text-xs px-3 py-1 rounded-full transition-all"
                  style={i === 0
                    ? { background: "#111", color: "white" }
                    : { color: "#9ca3af" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          {/* Bar chart */}
          <div className="flex items-end gap-3 h-32">
            {MOCK_ITEMS.map((item) => {
              const h = Math.round((item.deliveryCount / BAR_MAX) * 100);
              return (
                <div key={item.label} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full rounded-t-md" style={{
                    height: `${h}%`,
                    minHeight: "4px",
                    background: "#1a1a1a",
                    opacity: 0.85
                  }} />
                  <div className="text-[10px]" style={{ color: "#9ca3af" }}>{item.label}</div>
                </div>
              );
            })}
          </div>
          {/* Open rate line indicators */}
          <div className="flex items-center gap-6 mt-4 pt-4" style={{ borderTop: "1px solid #f3f4f6" }}>
            {MOCK_ITEMS.map((item) => (
              <div key={item.label} className="flex-1 text-center">
                <div className="text-xs font-medium" style={{ color: "#6b7280" }}>{pct(item.openRate)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden bg-white" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="px-6 py-4 text-sm font-semibold" style={{ color: "#111", borderBottom: "1px solid #f3f4f6" }}>詳細データ</div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #f9fafb" }}>
                {["日付", "配信数", "開封率", "クリック率"].map(h => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-medium" style={{ color: "#9ca3af" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_ITEMS.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f9fafb" }}>
                  <td className="px-6 py-3 text-sm" style={{ color: "#6b7280" }}>{row.label}</td>
                  <td className="px-6 py-3 font-medium" style={{ color: "#111" }}>{fmt(row.deliveryCount)}</td>
                  <td className="px-6 py-3" style={{ color: "#111" }}>{pct(row.openRate)}</td>
                  <td className="px-6 py-3" style={{ color: "#111" }}>{pct(row.clickRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
