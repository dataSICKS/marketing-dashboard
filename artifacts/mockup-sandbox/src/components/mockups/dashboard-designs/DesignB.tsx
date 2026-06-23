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
  { label: "配信数", value: fmt(MOCK_SUMMARY.deliveryCount), color: "from-violet-500 to-purple-600", glow: "shadow-violet-500/20" },
  { label: "開封率", value: pct(MOCK_SUMMARY.openRate), color: "from-cyan-400 to-blue-500", glow: "shadow-cyan-500/20" },
  { label: "クリック率", value: pct(MOCK_SUMMARY.clickRate), color: "from-emerald-400 to-teal-500", glow: "shadow-emerald-500/20" },
  { label: "CVR", value: pct(MOCK_SUMMARY.cvr), color: "from-orange-400 to-rose-500", glow: "shadow-orange-500/20" },
  { label: "CV数", value: fmt(MOCK_SUMMARY.cvCount), color: "from-pink-400 to-fuchsia-500", glow: "shadow-pink-500/20" },
];

export function DesignB() {
  return (
    <div className="min-h-screen p-6 flex flex-col gap-5" style={{
      background: "linear-gradient(135deg, #0f0c29 0%, #1a0533 40%, #0d1b4b 100%)",
      fontFamily: "'Outfit', 'Inter', sans-serif"
    }}>
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: "absolute", top: "-20%", left: "-10%", width: "500px", height: "500px", borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-5%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)" }} />
      </div>

      {/* Header */}
      <header className="relative flex items-end justify-between pb-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: "rgba(167,139,250,0.7)", letterSpacing: "0.15em" }}>MARKETING ANALYTICS</div>
          <h1 className="text-2xl font-bold text-white tracking-tight">メルマガレポート</h1>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>最終更新: 2026/06/23 06:52</p>
        </div>
        <button className="relative px-5 py-2.5 rounded-xl text-sm font-semibold text-white overflow-hidden"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 0 20px rgba(124,58,237,0.4)" }}>
          スプレッドシートから更新
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {["日別", "週別", "月別", "シナリオ別"].map((t, i) => (
          <button key={t} className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={i === 0
              ? { background: "rgba(124,58,237,0.6)", color: "white", boxShadow: "0 0 12px rgba(124,58,237,0.3)" }
              : { color: "rgba(255,255,255,0.45)" }}>
            {t}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className={`relative rounded-2xl p-4 overflow-hidden shadow-lg ${kpi.glow}`}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(20px)" }}>
            <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${kpi.color}`} />
            <div className="relative">
              <div className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>{kpi.label}</div>
              <div className="text-2xl font-bold text-white tracking-tight">{kpi.value}</div>
            </div>
            <div className={`absolute bottom-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-30 bg-gradient-to-br ${kpi.color}`} />
          </div>
        ))}
      </div>

      {/* Chart Area */}
      <div className="rounded-2xl p-5 flex-1"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}>
        <div className="text-sm font-semibold text-white mb-4">パフォーマンストレンド</div>
        <div className="flex items-end gap-2 h-36">
          {MOCK_ITEMS.map((item) => {
            const h = Math.round((item.deliveryCount / BAR_MAX) * 100);
            return (
              <div key={item.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-lg relative overflow-hidden" style={{ height: `${h}%`, minHeight: "8px" }}>
                  <div className="absolute inset-0 rounded-t-lg" style={{
                    background: "linear-gradient(180deg, rgba(124,58,237,0.9) 0%, rgba(79,70,229,0.6) 100%)",
                    boxShadow: "0 0 12px rgba(124,58,237,0.4)"
                  }} />
                </div>
                <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{item.label}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-4">
          {[
            { color: "rgba(124,58,237,0.8)", label: "配信数" },
            { color: "rgba(6,182,212,0.8)", label: "開封率" },
            { color: "rgba(52,211,153,0.8)", label: "クリック率" },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}>
        <div className="px-5 py-3 text-sm font-semibold text-white" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>詳細データ</div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["日付", "配信数", "開封率", "クリック率"].map(h => (
                <th key={h} className="text-left px-5 py-2.5 text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_ITEMS.map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="px-5 py-2.5" style={{ color: "rgba(255,255,255,0.6)" }}>{row.label}</td>
                <td className="px-5 py-2.5 text-white font-medium">{fmt(row.deliveryCount)}</td>
                <td className="px-5 py-2.5" style={{ color: "rgba(6,182,212,0.9)" }}>{pct(row.openRate)}</td>
                <td className="px-5 py-2.5" style={{ color: "rgba(52,211,153,0.9)" }}>{pct(row.clickRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
