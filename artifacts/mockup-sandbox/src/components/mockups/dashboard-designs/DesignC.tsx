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

const KPIS = [
  { label: "配信数", value: fmt(MOCK_SUMMARY.deliveryCount), sub: "通", accent: true },
  { label: "開封率", value: pct(MOCK_SUMMARY.openRate), sub: "平均", accent: false },
  { label: "クリック率", value: pct(MOCK_SUMMARY.clickRate), sub: "平均", accent: false },
  { label: "CVR", value: pct(MOCK_SUMMARY.cvr), sub: "平均", accent: false },
  { label: "CV数", value: fmt(MOCK_SUMMARY.cvCount), sub: "件", accent: false },
];

const NAV = ["レポート", "シナリオ", "設定"];

export function DesignC() {
  return (
    <div className="min-h-screen flex" style={{ background: "#ffffff", fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}>

      {/* Sidebar — deep black, high contrast */}
      <aside className="w-52 shrink-0 flex flex-col" style={{ background: "#0a0a0a" }}>
        {/* Logo area */}
        <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded" style={{ background: "#ffffff" }} />
            <span className="text-sm font-semibold text-white tracking-tight">Analytics</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5 p-3 flex-1">
          <div className="text-[10px] font-medium px-2 py-2" style={{ color: "rgba(255,255,255,0.22)", letterSpacing: "0.12em" }}>
            MAIN MENU
          </div>
          {NAV.map((label, i) => (
            <a key={label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all"
              style={i === 0
                ? { background: "rgba(255,255,255,0.1)", color: "#ffffff", fontWeight: 500 }
                : { color: "rgba(255,255,255,0.38)" }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: i === 0 ? "#ffffff" : "rgba(255,255,255,0.2)" }} />
              {label}
            </a>
          ))}
        </nav>

        {/* Sync button */}
        <div className="p-4" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button className="w-full py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all"
            style={{ background: "#ffffff", color: "#0a0a0a", letterSpacing: "0.04em" }}>
            ↻ 更新
          </button>
          <div className="text-[10px] text-center mt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
            最終更新 06/23 06:52
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-auto" style={{ background: "#f8f8f8" }}>

        {/* Top bar */}
        <div className="px-8 py-5 flex items-center justify-between bg-white"
          style={{ borderBottom: "1px solid #ebebeb" }}>
          <div>
            <div className="text-xs font-medium mb-0.5" style={{ color: "#999", letterSpacing: "0.06em" }}>
              メルマガ · 日別表示
            </div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "#0a0a0a" }}>
              パフォーマンスレポート
            </h1>
          </div>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "#f0f0f0" }}>
            {["日別", "週別", "月別", "シナリオ別"].map((t, i) => (
              <button key={t} className="px-3.5 py-1.5 rounded-md text-xs font-medium transition-all"
                style={i === 0
                  ? { background: "#0a0a0a", color: "#fff" }
                  : { color: "#888" }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-8 flex flex-col gap-5">

          {/* KPI strip */}
          <div className="grid grid-cols-5 gap-3">
            {KPIS.map((kpi) => (
              <div key={kpi.label} className="rounded-xl p-5 bg-white"
                style={{
                  border: kpi.accent ? "1.5px solid #0a0a0a" : "1px solid #ebebeb",
                  boxShadow: kpi.accent ? "0 2px 8px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.04)"
                }}>
                <div className="text-xs font-medium mb-3" style={{ color: "#999" }}>{kpi.label}</div>
                <div className="text-2xl font-bold tracking-tight" style={{ color: "#0a0a0a" }}>{kpi.value}</div>
                <div className="text-xs mt-1.5 font-medium" style={{ color: kpi.accent ? "#555" : "#bbb" }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart card */}
          <div className="rounded-xl bg-white p-6 flex flex-col gap-4"
            style={{ border: "1px solid #ebebeb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: "#0a0a0a" }}>配信トレンド</span>
              <div className="flex items-center gap-4">
                {[{ label: "配信数", color: "#0a0a0a" }, { label: "開封率", color: "#999" }, { label: "クリック率", color: "#ccc" }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "#999" }}>
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Bars */}
            <div className="flex items-end gap-2" style={{ height: "120px" }}>
              {MOCK_ITEMS.map((item) => {
                const h = Math.round((item.deliveryCount / BAR_MAX) * 100);
                return (
                  <div key={item.label} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="relative w-full rounded-t-md overflow-hidden"
                      style={{ height: `${h}%`, minHeight: "6px", background: "#0a0a0a" }} />
                    <div className="text-[10px] font-medium" style={{ color: "#bbb" }}>{item.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Rate row */}
            <div className="flex gap-2 pt-2" style={{ borderTop: "1px solid #f0f0f0" }}>
              {MOCK_ITEMS.map((item) => (
                <div key={item.label} className="flex-1 text-center">
                  <div className="text-[11px] font-semibold" style={{ color: "#555" }}>{pct(item.openRate)}</div>
                  <div className="text-[10px]" style={{ color: "#ccc" }}>{pct(item.clickRate)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl bg-white overflow-hidden"
            style={{ border: "1px solid #ebebeb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid #f0f0f0" }}>
              <span className="text-sm font-bold" style={{ color: "#0a0a0a" }}>詳細データ</span>
              <span className="text-xs" style={{ color: "#bbb" }}>{MOCK_ITEMS.length} 件</span>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                  {["日付", "配信数", "開封率", "クリック率"].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-semibold"
                      style={{ color: "#bbb", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_ITEMS.map((row, i) => (
                  <tr key={i} style={{ borderBottom: i < MOCK_ITEMS.length - 1 ? "1px solid #f8f8f8" : "none" }}>
                    <td className="px-6 py-3 text-sm" style={{ color: "#999" }}>{row.label}</td>
                    <td className="px-6 py-3 text-sm font-semibold" style={{ color: "#0a0a0a" }}>{fmt(row.deliveryCount)}</td>
                    <td className="px-6 py-3 text-sm font-medium" style={{ color: "#444" }}>{pct(row.openRate)}</td>
                    <td className="px-6 py-3 text-sm font-medium" style={{ color: "#444" }}>{pct(row.clickRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  );
}
