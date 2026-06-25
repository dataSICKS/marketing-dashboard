import { useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const COLOR = "#F59E0B";

const data = [
  { label: "W22", accessCount: 2282, cvCount: 474, cvr: 20.8, lpAccess: 33072, launchRate: 6.9 },
  { label: "W23", accessCount: 1489, cvCount: 339, cvr: 22.8, lpAccess: 20954, launchRate: 7.1 },
  { label: "W24", accessCount: 421,  cvCount: 70,  cvr: 16.6, lpAccess: 6797,  launchRate: 6.2 },
  { label: "W25", accessCount: 404,  cvCount: 88,  cvr: 21.8, lpAccess: 5945,  launchRate: 6.8 },
  { label: "W26", accessCount: 307,  cvCount: 49,  cvr: 19.2, lpAccess: 4157,  launchRate: 7.3 },
];

export function VariantB() {
  const [tab, setTab] = useState<"chat" | "lp">("chat");

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 w-[480px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">CVR推移</h3>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-[11px] font-medium">
            <button
              className="px-3 py-1 transition-colors"
              style={{ background: tab === "chat" ? COLOR : "white", color: tab === "chat" ? "white" : "#6B7280" }}
              onClick={() => setTab("chat")}
            >
              起動数・CVR
            </button>
            <button
              className="px-3 py-1 transition-colors"
              style={{ background: tab === "lp" ? "#10B981" : "white", color: tab === "lp" ? "white" : "#6B7280" }}
              onClick={() => setTab("lp")}
            >
              LPアクセス・起動率
            </button>
          </div>
        </div>

        {tab === "chat" ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 8, right: 24, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="count" orientation="left" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={40} />
              <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} unit="%" width={36} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }}
                formatter={(v: number, n: string) => n === "cvr" ? [`${v}%`, "CVR"] : n === "accessCount" ? [v.toLocaleString(), "起動数"] : [v.toLocaleString(), "CV数"]} />
              <Bar yAxisId="count" dataKey="accessCount" fill="#E5E7EB" radius={[3,3,0,0]} maxBarSize={28} />
              <Bar yAxisId="count" dataKey="cvCount" fill={COLOR} radius={[3,3,0,0]} maxBarSize={28} opacity={0.85} />
              <Line yAxisId="rate" type="monotone" dataKey="cvr" stroke={COLOR} strokeWidth={2.5} dot={{ r: 3, fill: COLOR }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 8, right: 24, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="count" orientation="left" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={44} />
              <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} unit="%" width={36} domain={[0, 14]} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 11 }}
                formatter={(v: number, n: string) => n === "launchRate" ? [`${v}%`, "起動率"] : [v.toLocaleString(), "LPアクセス"]} />
              <Bar yAxisId="count" dataKey="lpAccess" fill="#D1FAE5" radius={[3,3,0,0]} maxBarSize={28} />
              <Line yAxisId="rate" type="monotone" dataKey="launchRate" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: "#10B981" }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-gray-400 mt-2 text-center">タブで「チャット指標」と「LP指標」を切り替え</p>
      </div>
    </div>
  );
}
