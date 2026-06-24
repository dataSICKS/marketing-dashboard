const YELLOW = "#FBBF24";

const mockProfiles = ["全体", "kisekino_A", "kisekino_B", "aosora_main"];
const mockAdCodes = ["全体", "ggl_lst_ad11", "ggl_lst_ad12", "fb_ad01"];

const mockData = {
  A: { access: 18420, cv: 9840, cvr: 53.4, trend: [62,71,58,80,74,66,88,92,76,85,90,78] },
  B: { access: 12300, cv: 5910, cvr: 48.1, trend: [40,52,45,61,58,50,70,74,61,68,72,60] },
};

const FUNNEL = [
  { name: "開始", a: 100, b: 100 },
  { name: "挨拶", a: 99.8, b: 99.5 },
  { name: "氏名", a: 94.2, b: 91.8 },
  { name: "連絡先", a: 88.1, b: 83.4 },
  { name: "住所", a: 81.7, b: 76.2 },
  { name: "商品", a: 74.3, b: 68.9 },
  { name: "決済", a: 66.8, b: 60.1 },
  { name: "確認", a: 58.2, b: 51.7 },
  { name: "送信", a: 53.4, b: 48.1 },
];

function Selector({ label, seg }: { label: string; seg: "A" | "B" }) {
  return (
    <div style={{ flex: 1, borderRight: seg === "A" ? "1px solid #F0F0F0" : "none", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: seg === "A" ? YELLOW : "#6366F1", borderRadius: 4, padding: "2px 7px" }}>
          セグメント {seg}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <select style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid #E5E7EB", color: "#374151", background: "#F9FAFB" }}>
          {mockProfiles.map(p => <option key={p}>{p}</option>)}
        </select>
        <select style={{ flex: 1, fontSize: 12, padding: "5px 8px", borderRadius: 6, border: "1px solid #E5E7EB", color: "#374151", background: "#F9FAFB" }}>
          {mockAdCodes.map(a => <option key={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "#F9FAFB", border: "1px solid #F0F0F0" }}>
      <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MiniTrend({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const w = 260, h = 48, n = data.length;
  const pts = data.map((v, i) => `${(i / (n - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function FunnelBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ flex: 1, height: 16, borderRadius: 99, background: "#F3F4F6", overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color }} />
    </div>
  );
}

export default function FilterBarPattern() {
  const d = mockData;
  return (
    <div style={{ minHeight: "100vh", background: "#F8F8F8", fontFamily: "system-ui, sans-serif", padding: 20 }}>
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>EFO CVRレポート</h1>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>セグメント比較</p>
      </div>

      {/* Filter Bar */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #F0F0F0", display: "flex", marginBottom: 12 }}>
        <Selector label="A" seg="A" />
        <Selector label="B" seg="B" />
      </div>

      {/* KPI + Trend */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        {(["A", "B"] as const).map(seg => (
          <div key={seg} style={{ flex: 1, background: "#fff", borderRadius: 10, border: "1px solid #F0F0F0", padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <KpiCard label="起動数" value={d[seg].access.toLocaleString()} />
              <KpiCard label="CV数" value={d[seg].cv.toLocaleString()} />
              <KpiCard label="CVR" value={`${d[seg].cvr}%`} />
            </div>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>CVR推移</div>
            <MiniTrend data={d[seg].trend} color={seg === "A" ? YELLOW : "#6366F1"} />
          </div>
        ))}
      </div>

      {/* Funnel Comparison */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #F0F0F0", padding: "14px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 12 }}>ステップ別到達率</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ width: 52 }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: YELLOW, flex: 1 }}>▬ セグメント A</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#6366F1", flex: 1 }}>▬ セグメント B</span>
        </div>
        {FUNNEL.map(f => (
          <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: "#6B7280", width: 52, textAlign: "right", flexShrink: 0 }}>{f.name}</span>
            <FunnelBar pct={f.a} color={YELLOW} />
            <FunnelBar pct={f.b} color="#6366F1" />
            <span style={{ fontSize: 10, color: "#374151", width: 80, textAlign: "right", flexShrink: 0 }}>
              {f.a}% / {f.b}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
