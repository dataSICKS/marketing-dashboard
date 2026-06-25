import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLOR = "#F59E0B";

const data = [
  { label: "W22", accessCount: 2282, cvCount: 474, cvr: 20.8, launchRate: 6.9 },
  { label: "W23", accessCount: 1489, cvCount: 339, cvr: 22.8, launchRate: 7.1 },
  { label: "W24", accessCount: 421,  cvCount: 70,  cvr: 16.6, launchRate: 6.2 },
  { label: "W25", accessCount: 404,  cvCount: 88,  cvr: 21.8, launchRate: 6.8 },
  { label: "W26", accessCount: 307,  cvCount: 49,  cvr: 19.2, launchRate: 7.3 },
];

export function VariantA() {
  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 w-[480px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">CVR推移</h3>
          <div className="flex gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#F59E0B]" style={{display:'inline-block'}}></span>CVR</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 border-t-2 border-dashed border-[#10B981]" style={{display:'inline-block'}}></span>起動率</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} margin={{ top: 8, right: 24, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="count" orientation="left" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={40} />
            <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} unit="%" width={36} domain={[0, 30]} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }}
              formatter={(value: number, name: string) => {
                if (name === "cvr") return [`${value}%`, "CVR"];
                if (name === "launchRate") return [`${value}%`, "起動率"];
                if (name === "accessCount") return [value.toLocaleString(), "起動数"];
                if (name === "cvCount") return [value.toLocaleString(), "CV数"];
                return [value, name];
              }}
            />
            <Bar yAxisId="count" dataKey="accessCount" fill="#E5E7EB" radius={[3,3,0,0]} maxBarSize={28} />
            <Bar yAxisId="count" dataKey="cvCount" fill={COLOR} radius={[3,3,0,0]} maxBarSize={28} opacity={0.85} />
            <Line yAxisId="rate" type="monotone" dataKey="cvr" stroke={COLOR} strokeWidth={2.5} dot={{ r: 3, fill: COLOR }} />
            <Line yAxisId="rate" type="monotone" dataKey="launchRate" stroke="#10B981" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: "#10B981" }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-400 mt-2 text-center">右軸：CVR（実線）と起動率（破線）を同一スケールで比較</p>
      </div>
    </div>
  );
}
