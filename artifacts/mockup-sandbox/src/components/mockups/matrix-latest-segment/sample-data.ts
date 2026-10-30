export interface MatrixResponse {
  series: {
    key: string;
    type: "scenario" | "template";
    segments: string[];
    periodSegments: Record<string, { scenarioName: string; segment: string }[]>;
    metricValues: Record<string, Record<string, number>>;
  }[];
}

export const periods = ["2026/09", "2026/10"];
export const metrics = ["deliveryCount", "openCount", "clickCount", "clickRate"];
const definitions = [
  ["ステップ_2本_アップセル_260713", "2本_定期作成日35日前", 14320, 16180],
  ["ステップ_3本_アップセル_260713", "3本_定期作成日35日前", 8240, 9460],
  ["ステップ_共通_スタートガイド_260713", "定期作成日7日前", 22510, 24860],
] as const;

export const sampleSeries: MatrixResponse["series"] = definitions.map(([key, segment, before, after]) => ({
  key, type: "scenario", segments: [segment],
  periodSegments: Object.fromEntries(periods.map((period) => [period, [{ scenarioName: key, segment }]])),
  metricValues: {
    deliveryCount: { "2026/09": before, "2026/10": after },
    openCount: { "2026/09": Math.round(before * 0.42), "2026/10": Math.round(after * 0.45) },
    clickCount: { "2026/09": Math.round(before * 0.018), "2026/10": Math.round(after * 0.023) },
    clickRate: { "2026/09": 0.018, "2026/10": 0.023 },
  },
}));
