import assert from "node:assert/strict";
import test from "node:test";
import { aggregateLtv, filterLtvRows, collectFilters } from "./ltv-aggregate.ts";

const row = (month, product, customer, profit) => ({
  subsOrderCode: `${month}-${product}-${customer}`, customerCode: customer,
  firstOrderMonth: month, firstProduct: product,
  offerName: "オファーA", subsStatus: "継続中", adGroupName: "広告A",
  product2: "", product3: "", product4: "", sellingUrl: "",
  ltv95: profit, ltv180: profit * 2, ltv365: profit * 3,
});

test("selling URL segments preserve exact URLs and weight period averages by subscriptions", () => {
  const urlA = "https://example.test/lp?a=1&x[]=a|b#top";
  const urlB = "https://example.test/lp?a=2";
  const rows = [
    { ...row("2026-01-01", "商品A", "1", 100), sellingUrl: urlA },
    { ...row("2026-02-01", "商品B", "2", 400), sellingUrl: urlA },
    { ...row("2026-02-01", "商品A", "3", 900), sellingUrl: urlB },
    { ...row("2026-02-01", "商品A", "4", 200), sellingUrl: "  " },
  ];
  const totals = aggregateLtv(rows, "sellingUrl", new Set(), "total");
  assert.equal(totals.length, 3);
  assert.deepEqual(totals.find((item) => item.segment === urlA), {
    label: "期間合算", segment: urlA, count: 2, ltv95: 250, ltv180: 500, ltv365: 750,
  });
  assert.equal(totals.find((item) => item.segment === "未設定").count, 1);
  assert.equal(aggregateLtv(rows, "sellingUrl", new Set()).length, 4);
  assert.deepEqual(collectFilters(rows).sellingUrls, [urlA, urlB, "未設定"]);
});

test("selling URL multi-selection combines with other filters and treats blanks explicitly", () => {
  const a = "https://example.test/lp?source=a|b,c";
  const b = "https://example.test/lp?source=b";
  const rows = [
    { ...row("2026-01-01", "商品A", "1", 100), sellingUrl: a },
    { ...row("2026-02-01", "商品A", "2", 200), sellingUrl: b },
    { ...row("2026-02-01", "商品B", "3", 900), sellingUrl: b },
    { ...row("2026-02-01", "商品A", "4", 500), sellingUrl: "" },
  ];
  assert.equal(filterLtvRows(rows, { sellingUrls: [] }, new Set()).length, 4);
  assert.equal(filterLtvRows(rows, { sellingUrls: [a] }, new Set()).length, 1);
  const selected = filterLtvRows(rows, { sellingUrls: JSON.parse(JSON.stringify([a, b])), firstProducts: ["商品A"], monthFrom: "2026-02-01" }, new Set());
  assert.deepEqual(selected.map((item) => item.customerCode), ["2"]);
  assert.deepEqual(filterLtvRows(rows, { sellingUrls: ["未設定"] }, new Set()).map((item) => item.customerCode), ["4"]);
  assert.deepEqual(filterLtvRows(rows, { sellingUrls: ["https://unknown.test/"] }, new Set()), []);
  assert.deepEqual(collectFilters([]).sellingUrls, []);
});

test("period averages use raw subscriptions, not a mean or sum of monthly averages", () => {
  const rows = [
    row("2026-01-01", "商品A", "1", 100),
    row("2026-02-01", "商品A", "2", 300),
    row("2026-02-01", "商品A", "3", 300),
    row("2026-02-01", "商品A", "4", 300),
  ];
  const monthly = aggregateLtv(rows, "firstProduct", new Set());
  assert.deepEqual(monthly.map((r) => r.count), [1, 3]);
  assert.deepEqual(aggregateLtv(rows, "firstProduct", new Set(), "total"), [
    { label: "期間合算", segment: "商品A", count: 4, ltv95: 250, ltv180: 500, ltv365: 750 },
  ]);
  // Reconstructing totals from rounded monthly averages would produce 0 rather than 1.
  const fractional = [
    row("2026-01-01", "商品A", "1", 0.49),
    row("2026-01-01", "商品A", "2", 0.49),
    row("2026-01-01", "商品A", "3", 0.49),
    row("2026-02-01", "商品A", "4", 1.49),
  ];
  const roundedMonthly = aggregateLtv(fractional, "none", new Set());
  assert.equal(Math.round(roundedMonthly.reduce((sum, r) => sum + r.ltv95 * r.count, 0) / 4), 0);
  assert.equal(aggregateLtv(fractional, "none", new Set(), "total")[0].ltv95, 1);
});

test("total mode respects exact date boundaries and every existing filter", () => {
  const rows = [
    row("2025-12-01", "商品A", "before", 9999),
    row("2026-01-01", "商品A", "yes", 100),
    row("2026-02-01", "商品A", "no", 300),
    row("2026-02-01", "商品B", "other", 9999),
    { ...row("2026-01-01", "商品A", "wrong-offer", 9999), offerName: "別オファー" },
    { ...row("2026-01-01", "商品A", "wrong-status", 9999), subsStatus: "解約" },
    { ...row("2026-01-01", "商品A", "wrong-ad", 9999), adGroupName: "別広告" },
    row("2026-03-01", "商品A", "after", 9999),
  ];
  const query = {
    monthFrom: "2026-01-01", monthTo: "2026-02-01",
    firstProducts: ["商品A"], offers: ["オファーA"], subsStatuses: ["継続中"], adGroups: ["広告A"],
  };
  const optedOut = new Set(["yes"]);
  const filtered = filterLtvRows(rows, query, optedOut);
  assert.equal(filtered.length, 2);
  const total = aggregateLtv(filtered, "optout", optedOut, "total");
  assert.deepEqual(total.map((r) => [r.segment, r.count, r.ltv95]), [
    ["オプトアウトあり", 1, 100], ["オプトアウトなし", 1, 300],
  ]);
  const yes = filterLtvRows(rows, { ...query, optout: "yes" }, optedOut);
  assert.equal(aggregateLtv(yes, "none", optedOut, "total")[0].ltv95, 100);
});

test("monthly mode is unchanged; period mode preserves products, zero values, and empty results", () => {
  const rows = [row("2026-01-01", "商品A", "1", 0), row("2026-02-01", "商品B", "2", 200)];
  assert.deepEqual(aggregateLtv(rows, "none", new Set()), aggregateLtv(rows, "none", new Set(), "month"));
  const products = aggregateLtv(rows, "firstProduct", new Set(), "total");
  assert.equal(products.length, 2);
  assert.equal(products.find((r) => r.segment === "商品A").ltv95, 0);
  assert.equal(aggregateLtv(rows, "none", new Set(), "total")[0].count, 2);
  assert.deepEqual(aggregateLtv([], "firstProduct", new Set(), "total"), []);
  assert.deepEqual(aggregateLtv([row(null, "商品A", "1", 100)], "none", new Set(), "total"), []);
});
