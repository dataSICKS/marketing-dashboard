import type { LtvRow } from "./ltv-types.js";

const PRODUCT_FIELDS = ["firstProduct", "product2", "product3", "product4"] as const;

/** Group by adult/child composition, not toothpaste or total toothbrush volume. */
export function brushCountLabel(product: string | null | undefined): string {
  const label = (product ?? "").normalize("NFKC").trim();
  if (!label || /^[,、\s|;]+$/.test(label) ||
    /^(未設定|不明|未記録|未購入|未到達|なし|null|n\/a|[-—ー]+)$/i.test(label)) return "不明（商品未記録）";
  const audiencePattern = /大人|おとな|こども|子ども|子供/g;
  const audiences = label.match(audiencePattern) ?? [];
  const matches = [...label.matchAll(/(大人|おとな|こども|子ども|子供)\s*(?:用\s*)?(\d+)\s*本/g)];
  // Never silently drop an adult/child item with an unreadable quantity.
  if (matches.length !== audiences.length) return "不明（本数判定不可）";
  if (!matches.length) return "その他（大人・こども表記なし）";
  let adult = 0;
  let child = 0;
  for (const match of matches) {
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count <= 0) return "不明（本数判定不可）";
    if (match[1] === "大人" || match[1] === "おとな") adult += count;
    else child += count;
  }
  if (!Number.isSafeInteger(adult) || !Number.isSafeInteger(child)) return "不明（本数判定不可）";
  return [adult > 0 ? `大人${adult}本` : "", child > 0 ? `こども${child}本` : ""].filter(Boolean).join("＋");
}

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
      // Empty comma-separated entries are not products.
      let product = row[field].split(/[,，、]/).map((part) => part.trim()).filter(Boolean).join(",");
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
