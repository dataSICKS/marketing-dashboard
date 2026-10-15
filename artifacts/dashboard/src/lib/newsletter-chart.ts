export type TimeGranularity = "day" | "week" | "month";
export const CHART_METRICS = [
  { value: "deliveryCount", label: "配信数", isRate: false, color: "#FBBF24" },
  { value: "openRate", label: "開封率", isRate: true, color: "#60A5FA" },
  { value: "clickRate", label: "クリック率", isRate: true, color: "#34D399" },
  { value: "cvr", label: "CVR", isRate: true, color: "#A855F7" },
  { value: "cvCount", label: "CV数", isRate: false, color: "#F97316" },
] as const;
export type ChartMetric = typeof CHART_METRICS[number]["value"];
export const formatChartRate = (value: number) =>
  `${(value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 3 })}%`;

const utc = (date: string) => new Date(`${date.replace(/\//g, "-")}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
function shiftMonth(anchor: string, offset: number) {
  const origin = utc(anchor);
  const date = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth() + offset, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(origin.getUTCDate(), lastDay));
  return date;
}
export function timePeriod(date: string, grain: TimeGranularity, anchor?: string): string {
  if (grain === "day") return date.replace(/-/g, "/");
  const value = utc(date);
  if (anchor) {
    const origin = utc(anchor);
    if (grain === "week") {
      const index = Math.floor((value.getTime() - origin.getTime()) / (7 * 86_400_000));
      return iso(new Date(origin.getTime() + index * 7 * 86_400_000)).replace(/-/g, "/");
    }
    let index = (value.getUTCFullYear() - origin.getUTCFullYear()) * 12 + value.getUTCMonth() - origin.getUTCMonth();
    if (value < shiftMonth(anchor, index)) index--;
    return iso(shiftMonth(anchor, index)).replace(/-/g, "/");
  }
  if (grain === "month") return iso(value).slice(0, 7).replace(/-/g, "/");
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return iso(value).replace(/-/g, "/");
}
export function focusRange(anchor: string, grain: TimeGranularity, periods: number) {
  const origin = utc(anchor);
  const start = grain === "month" ? shiftMonth(anchor, -periods)
    : new Date(origin.getTime() - periods * (grain === "week" ? 7 : 1) * 86_400_000);
  const next = grain === "month" ? shiftMonth(anchor, periods)
    : new Date(origin.getTime() + periods * (grain === "week" ? 7 : 1) * 86_400_000);
  return { from: iso(start), to: iso(new Date(next.getTime() - 86_400_000)) };
}
