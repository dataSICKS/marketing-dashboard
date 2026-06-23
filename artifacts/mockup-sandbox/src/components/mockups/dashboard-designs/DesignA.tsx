const MOCK_SUMMARY = { deliveryCount: 188129, openRate: 0.238, clickRate: 0.028, cvr: 0.004, cvCount: 725 };
const MOCK_ITEMS = [
  { label: "2026/06/01", deliveryCount: 1820, openRate: 0.241, clickRate: 0.031 },
  { label: "2026/06/02", deliveryCount: 1650, openRate: 0.228, clickRate: 0.027 },
  { label: "2026/06/03", deliveryCount: 1930, openRate: 0.255, clickRate: 0.033 },
  { label: "2026/06/04", deliveryCount: 1410, openRate: 0.219, clickRate: 0.022 },
  { label: "2026/06/05", deliveryCount: 2100, openRate: 0.262, clickRate: 0.035 },
  { label: "2026/06/06", deliveryCount: 1780, openRate: 0.244, clickRate: 0.029 },
  { label: "2026/06/07", deliveryCount: 1590, openRate: 0.233, clickRate: 0.026 },
];

const fmt = (n: number) => n.toLocaleString("ja-JP");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const KPI_LIST = [
  { label: "DELIVERED", value: fmt(MOCK_SUMMARY.deliveryCount), unit: "通" },
  { label: "OPEN_RATE", value: pct(MOCK_SUMMARY.openRate), unit: "" },
  { label: "CLICK_RATE", value: pct(MOCK_SUMMARY.clickRate), unit: "" },
  { label: "CVR", value: pct(MOCK_SUMMARY.cvr), unit: "" },
  { label: "CONV", value: fmt(MOCK_SUMMARY.cvCount), unit: "件" },
];

const BAR_MAX = Math.max(...MOCK_ITEMS.map(d => d.deliveryCount));

export function DesignA() {
  return (
    <div className="min-h-screen bg-[#050a05] text-[#00ff41] font-mono p-6 flex flex-col gap-5"
      style={{ fontFamily: "'Courier New', monospace" }}>

      {/* Scanline overlay */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,0.015) 2px, rgba(0,255,65,0.015) 4px)",
        zIndex: 50
      }} />

      {/* Header */}
      <header className="flex items-start justify-between border-b border-[#00ff41]/20 pb-4">
        <div>
          <div className="text-xs text-[#00ff41]/50 mb-1">{">"} SYSTEM: MARKETING_ANALYTICS v2.6.0</div>
          <div className="text-2xl font-bold tracking-widest text-[#00ff41]">■ MAIL_REPORT.SH</div>
          <div className="text-xs text-[#00ff41]/40 mt-1">LAST_SYNC: 2026-06-23 06:52:24 JST │ STATUS: <span className="text-[#00ff41]">OK</span></div>
        </div>
        <button className="border border-[#00ff41]/40 hover:border-[#00ff41] px-4 py-2 text-xs tracking-widest transition-colors hover:bg-[#00ff41]/5 flex items-center gap-2">
          <span className="animate-pulse">█</span> SYNC_NOW
        </button>
      </header>

      {/* KPI Grid */}
      <div className="grid grid-cols-5 gap-3">
        {KPI_LIST.map((kpi) => (
          <div key={kpi.label} className="border border-[#00ff41]/20 p-3 hover:border-[#00ff41]/50 transition-colors bg-[#00ff41]/[0.02]">
            <div className="text-[10px] text-[#00ff41]/50 tracking-widest mb-2">{kpi.label}</div>
            <div className="text-xl font-bold text-[#00ff41] tracking-tight">{kpi.value}</div>
            {kpi.unit && <div className="text-[10px] text-[#00ff41]/40 mt-1">{kpi.unit}</div>}
          </div>
        ))}
      </div>

      {/* Chart: ASCII-style bars */}
      <div className="border border-[#00ff41]/20 p-4 bg-[#00ff41]/[0.02]">
        <div className="text-[10px] text-[#00ff41]/50 tracking-widest mb-4">{">"} DELIVERY_TREND --format=bar</div>
        <div className="flex flex-col gap-2">
          {MOCK_ITEMS.map((item) => {
            const barW = Math.round((item.deliveryCount / BAR_MAX) * 100);
            return (
              <div key={item.label} className="flex items-center gap-3 text-xs">
                <div className="w-20 text-[#00ff41]/50 shrink-0">{item.label.slice(5)}</div>
                <div className="flex-1 relative h-5 bg-[#00ff41]/5">
                  <div
                    className="absolute left-0 top-0 h-full bg-[#00ff41]/80 transition-all"
                    style={{ width: `${barW}%` }}
                  />
                </div>
                <div className="w-16 text-right text-[#00ff41]/70">{fmt(item.deliveryCount)}</div>
                <div className="w-12 text-right text-[#00ff41]/50">{pct(item.openRate)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="border border-[#00ff41]/20 bg-[#00ff41]/[0.02]">
        <div className="text-[10px] text-[#00ff41]/50 tracking-widest p-3 border-b border-[#00ff41]/10">{">"} SELECT * FROM newsletter_rows LIMIT 7;</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#00ff41]/10">
              {["DATE", "DELIVERED", "OPEN_RATE", "CLICK_RATE"].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[#00ff41]/40 tracking-widest font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_ITEMS.map((row, i) => (
              <tr key={i} className="border-b border-[#00ff41]/5 hover:bg-[#00ff41]/5 transition-colors">
                <td className="px-3 py-2 text-[#00ff41]/70">{row.label}</td>
                <td className="px-3 py-2">{fmt(row.deliveryCount)}</td>
                <td className="px-3 py-2">{pct(row.openRate)}</td>
                <td className="px-3 py-2">{pct(row.clickRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] text-[#00ff41]/20 tracking-widest">{">"} █</div>
    </div>
  );
}
