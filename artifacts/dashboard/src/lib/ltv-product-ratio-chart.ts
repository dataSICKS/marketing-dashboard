import type { LtvProductRatioMonth, LtvProductRatios } from "@workspace/api-client-react";

export type ProductRatioItemsKey = keyof Pick<LtvProductRatios,
  "initial" | "all" | "toothpasteInitial" | "toothpasteAll" | "brushCountInitial" | "brushCountAll">;

export function buildProductRatioChart(periods: LtvProductRatioMonth[], itemKey: ProductRatioItemsKey, isAll: boolean, monthly: boolean) {
  const valid = periods.filter((period) => !monthly || /^\d{4}\/\d{2}$/.test(period.month));
  const excludedUndatedCount = periods.filter((period) => !valid.includes(period))
    .reduce((sum, period) => sum + (isAll ? period.productRatios.totalPurchaseCount : period.productRatios.subscriptionCount), 0);
  const totals = new Map<string, number>();
  for (const period of valid) {
    for (const item of period.productRatios[itemKey]) totals.set(item.product, (totals.get(item.product) ?? 0) + item.count);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
  const top = ranked.slice(0, 7);
  const series = top.map(([label], index) => ({ key: `part_${index}`, label, other: false }));
  if (ranked.length > 7) series.push({ key: "remaining", label: `その他（残り${ranked.length - 7}区分）`, other: true });
  const topLabels = new Set(top.map(([label]) => label));
  const points = valid.map((period) => {
    const total = isAll ? period.productRatios.totalPurchaseCount : period.productRatios.subscriptionCount;
    const items = period.productRatios[itemKey];
    const counts = new Map(items.map((item) => [item.product, item.count]));
    const point: Record<string, number | string> = { label: period.month, total };
    if (monthly) {
      const [year, month] = period.month.split("/").map(Number);
      point.timestamp = Date.UTC(year, month - 1, 1);
    }
    for (const part of series) {
      const count = part.other ? items.reduce((sum, item) => sum + (topLabels.has(item.product) ? 0 : item.count), 0)
        : counts.get(part.label) ?? 0;
      point[`count_${part.key}`] = count;
      point[part.key] = total > 0 ? count / total * 100 : 0;
    }
    return point;
  }).sort((a, b) => monthly ? Number(a.timestamp) - Number(b.timestamp) : 0);
  return { points, series, excludedUndatedCount };
}
