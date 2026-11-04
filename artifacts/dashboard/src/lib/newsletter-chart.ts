export type TimeGranularity = "day" | "week" | "month";
export function recentNewsletterDateRange(now = new Date()) {
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  const format = (date: Date) =>
    `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  return { from: format(from), to: format(now) };
}

/** Chart type follows the metric, regardless of tab or available point count. */
export const newsletterSeriesUsesBars = (isRate: boolean) => !isRate;

export const CHART_METRICS = [
  { value: "deliveryCount", label: "配信数", isRate: false, color: "#FBBF24" },
  { value: "openCount", label: "開封数", isRate: false, color: "#60A5FA" },
  { value: "clickCount", label: "クリック数", isRate: false, color: "#34D399" },
  { value: "openRate", label: "開封率", isRate: true, color: "#60A5FA" },
  { value: "clickRate", label: "クリック率", isRate: true, color: "#34D399" },
  { value: "cvr", label: "CVR", isRate: true, color: "#A855F7" },
  { value: "cvCount", label: "CV数", isRate: false, color: "#F97316" },
] as const;
export type ChartMetric = typeof CHART_METRICS[number]["value"];
const decimalFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1, maximumFractionDigits: 1,
});
export const formatNewsletterDecimal = (value: number) => decimalFormatter.format(value);
export const formatNewsletterPercent = (value: number | null | undefined) =>
  `${formatNewsletterDecimal((value ?? 0) * 100)}%`;
export const formatChartRate = formatNewsletterPercent;
export const formatChartValueLabel = (value: unknown, isRate: boolean) =>
  typeof value !== "number" || !Number.isFinite(value) ? ""
    : isRate ? formatChartRate(value) : value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });

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
