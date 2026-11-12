import assert from "node:assert/strict";
import test from "node:test";
import { buildProductRatioChart } from "./ltv-product-ratio-chart.ts";

function ratios(entries) {
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const items = entries.map(([product, count]) => ({ product, count, ratio: count / total, stageCounts: [count, 0, 0, 0] }));
  return {
    subscriptionCount: total, totalPurchaseCount: total, missingFirstProductCount: 0,
    stageCounts: [total, 0, 0, 0], initial: items, all: items,
    toothpasteInitial: items, toothpasteAll: items, brushCountInitial: items, brushCountAll: items,
  };
}

test("monthly chart keeps exact shares, stable series, real month spacing, and source data unchanged", () => {
  const periods = [
    { month: "2026/03", productRatios: ratios([["大人2本", 2], ["こども2本", 1]]) },
    { month: "2026/01", productRatios: ratios([["大人2本", 1], ["こども2本", 3]]) },
  ];
  const before = JSON.stringify(periods);
  for (const key of ["initial", "all", "toothpasteInitial", "toothpasteAll", "brushCountInitial", "brushCountAll"]) {
    const chart = buildProductRatioChart(periods, key, key.endsWith("All") || key === "all", true);
    assert.deepEqual(chart.points.map((p) => p.label), ["2026/01", "2026/03"]);
    assert.equal(chart.points[1].timestamp - chart.points[0].timestamp, 59 * 86400000);
    const adult = chart.series.find((s) => s.label === "大人2本");
    assert.equal(chart.points[0][adult.key], 25);
    assert.equal(chart.points[1][adult.key], 2 / 3 * 100);
    for (const point of chart.points) {
      assert.ok(Math.abs(chart.series.reduce((sum, part) => sum + point[part.key], 0) - 100) < 1e-9);
    }
  }
  assert.equal(JSON.stringify(periods), before);
});

test("small categories are aggregated rather than discarded, even with unsafe product-name keys", () => {
  const data = ratios(Array.from({ length: 10 }, (_, i) => [`商品.${i}[0]`, i + 1]));
  const chart = buildProductRatioChart([{ month: "2026/01", productRatios: data }], "initial", false, true);
  assert.equal(chart.series.length, 8);
  const other = chart.series.find((s) => s.other);
  assert.equal(other.label, "その他（残り3区分）");
  assert.equal(chart.points[0][`count_${other.key}`], 6);
  assert.ok(Math.abs(chart.series.reduce((sum, part) => sum + chart.points[0][part.key], 0) - 100) < 1e-9);
  assert.ok(chart.series.every((s) => /^[a-z_0-9]+$/.test(s.key)));
});

test("period totals use total counts, with explicit undated exclusions only in monthly mode", () => {
  const data = ratios([["大人2本", 3]]);
  data.totalPurchaseCount = 6;
  data.all = [{ product: "大人2本", count: 6, ratio: 1, stageCounts: [3, 3, 0, 0] }];
  const periods = [{ month: "不明", productRatios: data }];
  const monthly = buildProductRatioChart(periods, "all", true, true);
  assert.equal(monthly.excludedUndatedCount, 6);
  assert.deepEqual(monthly.points, []);
  const total = buildProductRatioChart([{ month: "期間合算", productRatios: data }], "all", true, false);
  assert.equal(total.points[0].total, 6);
  assert.equal(total.points[0].part_0, 100);
  assert.equal(total.points[0].count_part_0, 6);
  assert.deepEqual(buildProductRatioChart([], "initial", false, true).points, []);
  const empty = buildProductRatioChart([{ month: "2026/01", productRatios: ratios([]) }], "initial", false, true);
  assert.equal(empty.points[0].total, 0);
  assert.deepEqual(empty.series, []);
});
