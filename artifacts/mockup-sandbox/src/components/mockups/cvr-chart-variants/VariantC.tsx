import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const COLOR = "#F59E0B";

const data = [
  { label: "W22", accessCount: 2282, cvCount: 474, lpAccess: 33072, cvr: 20.8, launchRate: 6.9 },
  { label: "W23", accessCount: 1489, cvCount: 339, lpAccess: 20954, cvr: 22.8, launchRate: 7.1 },
  { label: "W24", accessCount: 421,  cvCount: 70,  lpAccess: 6797,  cvr: 16.6, launchRate: 6.2 },
  { label: "W25", accessCount: 404,  cvCount: 88,  lpAccess: 5945,  cvr: 21.8, launchRate: 6.8 },
  { label: "W26", accessCount: 307,  cvCount: 49,  lpAccess: 4157,  cvr: 19.2, launchRate: 7.3 },
];

export function VariantC() {
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 w-[480px]">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">CVR推移</h3>

        {/* 上段：棒グラフ3本 */}
        <div className="mb-0">
          <p className="text-[10px] text-gray-400 mb-1">数量 — LPアクセス / 起動数 / CV数</p>
          <ResponsiveContainer width="100%" height={110}>
            <ComposedChart data={data} margin={{ top: 4, right: 24, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={44} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }}
                formatter={(v: number, n: string) => [v.toLocaleString(), n === "lpAccess" ? "LPアクセス" : n === "accessCount" ? "起動数" : "CV数"]} />
              <Bar dataKey="lpAccess" fill="#D1FAE5" radius={[3,3,0,0]} maxBarSize={18} />
              <Bar dataKey="accessCount" fill="#E5E7EB" radius={[3,3,0,0]} maxBarSize={18} />
              <Bar dataKey="cvCount" fill={COLOR} radius={[3,3,0,0]} maxBarSize={18} opacity={0.85} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* 区切り線 */}
        <div className="border-t border-gray-100 my-2" />

        {/* 下段：折れ線のみ */}
        <div>
          <p className="text-[10px] text-gray-400 mb-1">率 — CVR / 起動率</p>
          <ResponsiveContainer width="100%" height={90}>
            <ComposedChart data={data} margin={{ top: 4, right: 24, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} unit="%" width={36} domain={[0, 30]} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }}
                formatter={(v: number, n: string) => [`${v}%`, n === "cvr" ? "CVR" : "起動率"]} />
              <Line type="monotone" dataKey="cvr" stroke={COLOR} strokeWidth={2.5} dot={{ r: 3, fill: COLOR }} />
              <Line type="monotone" dataKey="launchRate" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#10B981" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[10px] text-gray-400 mt-1 text-center">上段：量の推移 ／ 下段：率の推移（同じ横軸で対応）</p>
      </div>
    </div>
  );
}
