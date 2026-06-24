const YELLOW = "#FBBF24";
const BLUE = "#6366F1";

const mockProfiles = ["全体", "kisekino_A", "kisekino_B", "aosora_main"];
const mockAdCodes = ["全体", "ggl_lst_ad11", "ggl_lst_ad12", "fb_ad01"];

const mockData = {
  A: { access: 18420, cv: 9840, cvr: 53.4 },
  B: { access: 12300, cv: 5910, cvr: 48.1 },
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

const WEEKLY = [
  { wk: "5/19", a: 420, b: 310 },
  { wk: "5/26", a: 510, b: 380 },
  { wk: "6/2",  a: 480, b: 360 },
  { wk: "6/9",  a: 560, b: 410 },
  { wk: "6/16", a: 540, b: 395 },
  { wk: "6/23", a: 490, b: 340 },
];

function SegmentCard({ seg, color }: { seg: "A" | "B"; color: string }) {
  const d = mockData[seg];
  return (
    <div style={{ flex: 1, borderRadius: 12, border: `2px solid ${color}`, overflow: "hidden" }}>
      <div style={{ background: color, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: seg === "A" ? "#1A1A1A" : "#fff" }}>セグメント {seg}</span>
      </div>
      <div style={{ padding: "12px 14px", background: "#fff" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <select style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "1px solid #E5E7EB", color: "#374151" }}>
            <option>プロファイル: 全体</option>
            {mockProfiles.slice(1).map(p => <option key={p}>{p}</option>)}
          </select>
          <select style={{ flex: 1, fontSize: 11, padding: "5px 8px", borderRadius: 6, border: "1px solid #E5E7EB", color: "#374151" }}>
            <option>広告コード: 全体</option>
            {mockAdCodes.slice(1).map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "起動数", value: d.access.toLocaleString() },
            { label: "CV数",   value: d.cv.toLocaleString() },
            { label: "CVR",    value: `${d.cvr}%` },
          ].map(k => (
            <div key={k.label} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 8, background: "#F9FAFB", border: "1px solid #F0F0F0" }}>
              <div style={{ fontSize: 9, color: "#9CA3AF", marginBottom: 3 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{k.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarChart() {
  const maxVal = Math.max(...WEEKLY.flatMap(w => [w.a, w.b]));
  const h = 80;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 8 }}>週別起動数</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: h + 20 }}>
        {WEEKLY.map(w => (
          <div key={w.wk} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ width: "100%", display: "flex", gap: 1, alignItems: "flex-end", height: h }}>
              <div style={{ flex: 1, background: YELLOW, borderRadius: "3px 3px 0 0", height: `${(w.a / maxVal) * h}px` }} />
              <div style={{ flex: 1, background: BLUE, borderRadius: "3px 3px 0 0", height: `${(w.b / maxVal) * h}px` }} />
            </div>
            <span style={{ fontSize: 9, color: "#9CA3AF" }}>{w.wk}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
        <span style={{ fontSize: 10, color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: YELLOW, borderRadius: 2 }} /> A
        </span>
        <span style={{ fontSize: 10, color: "#6B7280", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, background: BLUE, borderRadius: 2 }} /> B
        </span>
      </div>
    </div>
  );
}

export default function CardSelectorPattern() {
  return (
    <div style={{ minHeight: "100vh", background: "#F8F8F8", fontFamily: "system-ui, sans-serif", padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: "#111", margin: 0 }}>EFO CVRレポート</h1>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>セグメント比較</p>
      </div>

      {/* Segment Cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <SegmentCard seg="A" color={YELLOW} />
        <SegmentCard seg="B" color={BLUE} />
      </div>

      {/* Charts Side by Side */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: 10, border: "1px solid #F0F0F0", padding: "14px 16px" }}>
          <BarChart />
        </div>
        <div style={{ flex: 1, background: "#fff", borderRadius: 10, border: "1px solid #F0F0F0", padding: "14px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 10 }}>ステップ別到達率</div>
          {FUNNEL.map(f => (
            <div key={f.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: "#6B7280", width: 38, textAlign: "right", flexShrink: 0 }}>{f.name}</span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ height: 6, borderRadius: 99, background: "#F3F4F6", overflow: "hidden" }}>
                  <div style={{ width: `${f.a}%`, height: "100%", background: YELLOW, borderRadius: 99 }} />
                </div>
                <div style={{ height: 6, borderRadius: 99, background: "#F3F4F6", overflow: "hidden" }}>
                  <div style={{ width: `${f.b}%`, height: "100%", background: BLUE, borderRadius: 99 }} />
                </div>
              </div>
              <span style={{ fontSize: 9, color: "#374151", width: 72, textAlign: "right", flexShrink: 0 }}>
                {f.a}% / {f.b}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #F0F0F0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#F9FAFB" }}>
              <th style={{ padding: "8px 12px", textAlign: "left", color: "#6B7280", fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>週</th>
              <th style={{ padding: "8px 12px", textAlign: "right", color: YELLOW, fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>A 起動数</th>
              <th style={{ padding: "8px 12px", textAlign: "right", color: YELLOW, fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>A CVR</th>
              <th style={{ padding: "8px 12px", textAlign: "right", color: BLUE, fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>B 起動数</th>
              <th style={{ padding: "8px 12px", textAlign: "right", color: BLUE, fontWeight: 600, borderBottom: "1px solid #F0F0F0" }}>B CVR</th>
            </tr>
          </thead>
          <tbody>
            {WEEKLY.map((w, i) => (
              <tr key={w.wk} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                <td style={{ padding: "6px 12px", color: "#374151", borderBottom: "1px solid #F7F7F7" }}>{w.wk}</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "#374151", borderBottom: "1px solid #F7F7F7" }}>{w.a.toLocaleString()}</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "#374151", borderBottom: "1px solid #F7F7F7" }}>{(53 + i * 0.3).toFixed(1)}%</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "#374151", borderBottom: "1px solid #F7F7F7" }}>{w.b.toLocaleString()}</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "#374151", borderBottom: "1px solid #F7F7F7" }}>{(48 + i * 0.2).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
