import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const COLOR_CVR = "#F59E0B";
const COLOR_LAUNCH = "#10B981";

const data = [
  { label: "W22", cvr: 20.8, launchRate: 6.9 },
  { label: "W23", cvr: 22.8, launchRate: 7.1 },
  { label: "W24", cvr: 16.6, launchRate: 6.2 },
  { label: "W25", cvr: 21.8, launchRate: 6.8 },
  { label: "W26", cvr: 19.2, launchRate: 7.3 },
];

function Sparkline({ dataKey, color, unit }: { dataKey: string; color: string; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        <Tooltip
          contentStyle={{ borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 10, padding: "2px 6px" }}
          formatter={(v: number) => [`${v}${unit}`]}
          labelFormatter={(l) => l}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function VariantD() {
  const latestCvr = data[data.length - 1].cvr;
  const prevCvr = data[data.length - 2].cvr;
  const latestLaunch = data[data.length - 1].launchRate;
  const prevLaunch = data[data.length - 2].launchRate;

  const delta = (cur: number, prev: number) => {
    const d = cur - prev;
    return { sign: d >= 0 ? "▲" : "▼", val: Math.abs(d).toFixed(1), color: d >= 0 ? "#10B981" : "#EF4444" };
  };
  const cvrDelta = delta(latestCvr, prevCvr);
  const launchDelta = delta(latestLaunch, prevLaunch);

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center p-6">
      <div className="w-[480px] space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">CVR推移</h3>

        {/* CVRカード */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">チャットCVR</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold" style={{ color: "#111" }}>{latestCvr}%</span>
                <span className="text-xs font-medium" style={{ color: cvrDelta.color }}>
                  {cvrDelta.sign} {cvrDelta.val}%
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">前週比</p>
            </div>
            <div className="text-[10px] text-gray-300 font-medium mt-1">週次推移</div>
          </div>
          <Sparkline dataKey="cvr" color={COLOR_CVR} unit="%" />
          <div className="flex justify-between mt-1">
            {data.map((d) => (
              <span key={d.label} className="text-[9px] text-gray-300">{d.label}</span>
            ))}
          </div>
        </div>

        {/* 起動率カード */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">チャット起動率</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold" style={{ color: "#111" }}>{latestLaunch}%</span>
                <span className="text-xs font-medium" style={{ color: launchDelta.color }}>
                  {launchDelta.sign} {launchDelta.val}%
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">前週比</p>
            </div>
            <div className="text-[10px] text-gray-300 font-medium mt-1">週次推移</div>
          </div>
          <Sparkline dataKey="launchRate" color={COLOR_LAUNCH} unit="%" />
          <div className="flex justify-between mt-1">
            {data.map((d) => (
              <span key={d.label} className="text-[9px] text-gray-300">{d.label}</span>
            ))}
          </div>
        </div>

        <p className="text-[10px] text-gray-400 text-center">各指標を独立カード+スパークラインで表示</p>
      </div>
    </div>
  );
}
