import type { LtvRow } from "./ltv-types.js";

const PRODUCT_FIELDS = ["firstProduct", "product2", "product3", "product4"] as const;

/**
 * One subscription has one first purchase. Unknown first labels stay explicit.
 * Blank repeat fields are unrecorded, not proof of a completed purchase.
 * Preserve combination labels rather than guessing SKU boundaries or quantities.
 */
export function calculateLtvProductRatios(rows: readonly LtvRow[], groupLabel: (product: string) => string = (product) => product) {
  const initial = new Map<string, number[]>();
  const all = new Map<string, number[]>();
  const stageCounts = [0, 0, 0, 0];
  let missingFirstProductCount = 0;

  for (const row of rows) {
    for (const [stage, field] of PRODUCT_FIELDS.entries()) {
      let product = row[field].trim();
      if (!product) {
        if (stage > 0) continue;
        product = "未設定";
        missingFirstProductCount++;
      }
      product = groupLabel(product);
      stageCounts[stage]++;
      const counts = all.get(product) ?? [0, 0, 0, 0];
      counts[stage]++;
      all.set(product, counts);
      if (stage === 0) {
        const firstCounts = initial.get(product) ?? [0, 0, 0, 0];
        firstCounts[0]++;
        initial.set(product, firstCounts);
      }
    }
  }

  const totalPurchaseCount = stageCounts.reduce((sum, count) => sum + count, 0);
  const toItems = (groups: Map<string, number[]>, total: number) =>
    Array.from(groups, ([product, counts]) => {
      const count = counts.reduce((sum, value) => sum + value, 0);
      return { product, count, ratio: total > 0 ? count / total : 0, stageCounts: counts };
    }).sort((a, b) => b.count - a.count || a.product.localeCompare(b.product, "ja"));

  return {
    subscriptionCount: rows.length,
    totalPurchaseCount,
    missingFirstProductCount,
    stageCounts,
    initial: toItems(initial, rows.length),
    all: toItems(all, totalPurchaseCount),
  };
}
