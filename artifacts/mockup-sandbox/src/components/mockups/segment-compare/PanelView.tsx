const YELLOW = "#FBBF24";
const BLUE = "#6366F1";

const mockProfiles = ["全体", "kisekino_A", "kisekino_B", "aosora_main"];
const mockAdCodes = ["全体", "ggl_lst_ad11", "ggl_lst_ad12", "fb_ad01"];

const mockData = {
  A: { access: 18420, cv: 9840, cvr: 53.4 },
  B: { access: 12300, cv: 5910, cvr: 48.1 },
};

const FUNNEL = [
  { name: "開始",   a: 100,  b: 100 },
  { name: "挨拶",   a: 99.8, b: 99.5 },
  { name: "氏名",   a: 94.2, b: 91.8 },
  { name: "連絡先", a: 88.1, b: 83.4 },
  { name: "住所",   a: 81.7, b: 76.2 },
  { name: "商品",   a: 74.3, b: 68.9 },
  { name: "決済",   a: 66.8, b: 60.1 },
  { name: "確認",   a: 58.2, b: 51.7 },
  { name: "送信",   a: 53.4, b: 48.1 },
];

const WEEKLY = [
  { wk: "5/19", a: 420, b: 310, aCV: 224, bCV: 149, aCVR: 53.3, bCVR: 48.1 },
  { wk: "5/26", a: 510, b: 380, aCV: 272, bCV: 183, aCVR: 53.3, bCVR: 48.2 },
  { wk: "6/2",  a: 480, b: 360, aCV: 257, bCV: 173, aCVR: 53.5, bCVR: 48.1 },
  { wk: "6/9",  a: 560, b: 410, aCV: 299, bCV: 197, aCVR: 53.4, bCVR: 48.0 },
  { wk: "6/16", a: 540, b: 395, aCV: 290, bCV: 192, aCVR: 53.7, bCVR: 48.6 },
  { wk: "6/23", a: 490, b: 340, aCV: 264, bCV: 165, aCVR: 53.9, bCVR: 48.5 },
];

function CvrLineChart({ seg, color }: { seg: "A" | "B"; color: string }) {
  const cvrValues = WEEKLY.map(w => seg === "A" ? w.aCVR : w.bCVR);
  const labels = WEEKLY.map(w => w.wk);
  const n = cvrValues.length;
  const W = 280, H = 56;
  const min = Math.min(...cvrValues) - 1;
  const max = Math.max(...cvrValues) + 1;
  const toX = (i: number) => (i / (n - 1)) * W;
  const toY = (v: number) => H - ((v - min) / (max - min)) * (H - 8) - 4;
  const points = cvrValues.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const fillPts = `0,${H} ${points} ${W},${H}`;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={`grad-${seg}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={fillPts} fill={`url(#grad-${seg})`} />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {cvrValues.map((v, i) => (
          <circle key={i} cx={toX(i)} cy={toY(v)} r="3.5" fill="#fff" stroke={color} strokeWidth="2" />
        ))}
        {cvrValues.map((v, i) => (
          <text key={i} x={toX(i)} y={toY(v) - 7} textAnchor="middle" fontSize="8" fill={color} fontWeight="600">
            {v}%
          </text>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {labels.map(l => (
          <span key={l} style={{ fontSize: 9, color: "#9CA3AF" }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function Panel({ seg, color }: { seg: "A" | "B"; color: string }) {
  const d = mockData[seg];
  const isA = seg === "A";
  const textOnColor = isA ? "#1A1A1A" : "#fff";

  return (
    <div style={{ flex: 1, borderRadius: 12, overflow: "hidden", border: "1px solid #E5E7EB" }}>
      {/* Panel Header */}
      <div style={{ background: color, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: textOnColor }}>セグメント {seg}</span>
          <span style={{ fontSize: 11, color: isA ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.6)" }}>比較中</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <select style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "none", color: "#374151", background: "rgba(255,255,255,0.9)" }}>
            <option>プロファイル: 全体</option>
            {mockProfiles.slice(1).map(p => <option key={p}>{p}</option>)}
          </select>
          <select style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "none", color: "#374151", background: "rgba(255,255,255,0.9)" }}>
            <option>広告コード: 全体</option>
            {mockAdCodes.slice(1).map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #F0F0F0" }}>
        {[
          { label: "起動数", value: d.access.toLocaleString() },
          { label: "CV数",   value: d.cv.toLocaleString() },
          { label: "CVR",    value: `${d.cvr}%` },
        ].map((k, i) => (
          <div key={k.label} style={{
            flex: 1, padding: "12px 14px", textAlign: "center",
            borderRight: i < 2 ? "1px solid #F0F0F0" : "none"
          }}>
            <div style={{ fontSize: 9, color: "#9CA3AF", marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* CVR Trend Line Chart */}
      <div style={{ background: "#fff", padding: "12px 14px", borderBottom: "1px solid #F0F0F0" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#6B7280", marginBottom: 8 }}>CVR推移（週別）</div>
        <CvrLineChart seg={seg} color={color} />
      </div>

      {/* Funnel */}
      <div style={{ background: "#fff", padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#6B7280", marginBottom: 8 }}>到達率</div>
        {FUNNEL.map(f => {
          const pct = seg === "A" ? f.a : f.b;
          const isGoal = f.name === "送信";
          return (
            <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#6B7280", width: 40, textAlign: "right", flexShrink: 0 }}>{f.name}</span>
              <div style={{ flex: 1, height: 14, borderRadius: 99, background: "#F3F4F6", overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%", borderRadius: 99,
                  background: isGoal ? "#10B981" : color,
                  opacity: isGoal ? 1 : 0.6 + (pct / 100) * 0.4,
                }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#374151", width: 38, textAlign: "right", flexShrink: 0 }}>{pct}%</span>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ borderTop: "1px solid #F0F0F0", background: "#FAFAFA" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 12px", textAlign: "left", color: "#9CA3AF", fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>週</th>
              <th style={{ padding: "6px 12px", textAlign: "right", color: "#9CA3AF", fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>起動数</th>
              <th style={{ padding: "6px 12px", textAlign: "right", color: "#9CA3AF", fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>CV数</th>
              <th style={{ padding: "6px 12px", textAlign: "right", color: "#9CA3AF", fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>CVR</th>
            </tr>
          </thead>
          <tbody>
            {WEEKLY.map((w, i) => (
              <tr key={w.wk}>
                <td style={{ padding: "5px 12px", color: "#374151", borderBottom: "1px solid #F3F4F6" }}>{w.wk}</td>
                <td style={{ padding: "5px 12px", textAlign: "right", color: "#374151", borderBottom: "1px solid #F3F4F6" }}>{(seg === "A" ? w.a : w.b).toLocaleString()}</td>
                <td style={{ padding: "5px 12px", textAlign: "right", color: "#374151", borderBottom: "1px solid #F3F4F6" }}>{(seg === "A" ? w.aCV : w.bCV).toLocaleString()}</td>
                <td style={{ padding: "5px 12px", textAlign: "right", color: "#374151", borderBottom: "1px solid #F3F4F6" }}>{seg === "A" ? (53 + i * 0.3).toFixed(1) : (48 + i * 0.2).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PanelViewPattern() {
  return (
    <div style={{ minHeight: "100vh", background: "#F8F8F8", fontFamily: "system-ui, sans-serif", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>EFO CVRレポート</h1>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>セグメント比較</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#fff", border: "1px solid #E5E7EB", color: "#374151" }}>日別</span>
          <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#1A1A1A", color: "#fff" }}>週別</span>
          <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "#fff", border: "1px solid #E5E7EB", color: "#374151" }}>月別</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <Panel seg="A" color={YELLOW} />
        <Panel seg="B" color={BLUE} />
      </div>
    </div>
  );
}
