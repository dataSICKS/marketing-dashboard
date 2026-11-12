import assert from "node:assert/strict";
import test from "node:test";
import { calculateLtvProductRatios, brushCountLabel } from "./ltv-product-ratios.ts";
import { filterLtvRows, toothpasteStatus, TOOTHPASTE_LABELS } from "./ltv-aggregate.ts";

const row = (firstProduct, product2 = "", product3 = "", product4 = "") => ({
  subsOrderCode: "sub", customerCode: "customer", firstOrderMonth: "2026-01-01",
  firstProduct, product2, product3, product4, adGroupName: "広告A",
  subsStatus: "継続中", offerName: "オファーA", sellingUrl: "",
  ltv95: 100, ltv180: 200, ltv365: 300,
});

test("first and all purchase composition use distinct denominators and repeated records count once each", () => {
  const result = calculateLtvProductRatios([
    row("商品A", "商品B", "商品A"),
    row("商品A", "商品A"),
    row("商品B", "", "", "商品C"),
  ]);
  assert.equal(result.subscriptionCount, 3);
  assert.deepEqual(result.stageCounts, [3, 2, 1, 1]);
  assert.equal(result.totalPurchaseCount, 7);
  assert.equal(result.initial.find((i) => i.product === "商品A").ratio, 2 / 3);
  const a = result.all.find((i) => i.product === "商品A");
  assert.equal(a.count, 4);
  assert.equal(a.ratio, 4 / 7);
  assert.deepEqual(a.stageCounts, [2, 1, 1, 0]);
  assert.equal(result.all.reduce((sum, i) => sum + i.count, 0), 7);
  assert.ok(Math.abs(result.all.reduce((sum, i) => sum + i.ratio, 0) - 1) < 1e-12);
});

test("unknown first labels are disclosed; blank repeats do not become purchases; combinations stay intact", () => {
  const result = calculateLtvProductRatios([row(" ", " ", "商品A,商品B", ""), row(" 商品A ", "商品A")]);
  assert.equal(result.missingFirstProductCount, 1);
  assert.deepEqual(result.stageCounts, [2, 1, 1, 0]);
  assert.equal(result.initial.find((i) => i.product === "未設定").count, 1);
  assert.equal(result.all.find((i) => i.product === "商品A,商品B").count, 1);
  assert.equal(result.all.find((i) => i.product === "商品A").count, 2);
});

test("composition follows date, product, offer, status, ad group, and opt-out filters", () => {
  const matching = row("商品A", "商品B");
  const rows = [
    matching, { ...matching, firstOrderMonth: "2025-12-01" },
    { ...matching, firstProduct: "別商品" }, { ...matching, offerName: "別オファー" },
    { ...matching, subsStatus: "解約" }, { ...matching, adGroupName: "別広告" },
    { ...matching, customerCode: "not-opted-out" },
  ];
  const filtered = filterLtvRows(rows, {
    monthFrom: "2026-01-01", monthTo: "2026-01-01", firstProducts: ["商品A"],
    offers: ["オファーA"], subsStatuses: ["継続中"], adGroups: ["広告A"], optout: "yes",
  }, new Set(["customer"]));
  const result = calculateLtvProductRatios(filtered);
  assert.equal(result.subscriptionCount, 1);
  assert.equal(result.totalPurchaseCount, 2);
});

test("empty data has no invented products or nonfinite rates", () => {
  assert.deepEqual(calculateLtvProductRatios([]), {
    subscriptionCount: 0, totalPurchaseCount: 0, missingFirstProductCount: 0,
    stageCounts: [0, 0, 0, 0], initial: [], all: [],
  });
});

test("toothpaste composition groups product labels per purchase without changing denominators", () => {
  const rows = [
    row("大人2本", "大人2本,歯磨き剤", "大人2本"),
    row("歯磨き粉", "こども2本", "未設定", "歯みがき剤"),
    row("", "", "", ""),
  ];
  const products = calculateLtvProductRatios(rows);
  const result = calculateLtvProductRatios(rows, (product) => TOOTHPASTE_LABELS[toothpasteStatus(product)]);
  assert.deepEqual(result.stageCounts, products.stageCounts);
  assert.equal(result.totalPurchaseCount, 8);
  assert.equal(result.missingFirstProductCount, 1);
  assert.deepEqual(result.all.find((i) => i.product === "歯磨き剤あり").stageCounts, [1, 1, 0, 1]);
  assert.deepEqual(result.all.find((i) => i.product === "歯磨き剤なし").stageCounts, [1, 1, 1, 0]);
  assert.deepEqual(result.all.find((i) => i.product === "不明（商品未記録）").stageCounts, [1, 0, 1, 0]);
  assert.equal(result.initial.reduce((sum, i) => sum + i.count, 0), 3);
  assert.equal(result.all.reduce((sum, i) => sum + i.count, 0), 8);
  for (let stage = 0; stage < 4; stage++) {
    assert.equal(result.all.reduce((sum, i) => sum + i.stageCounts[stage], 0), result.stageCounts[stage]);
  }
  const filtered = filterLtvRows(rows, { toothpaste2: "yes" }, new Set());
  const segment = calculateLtvProductRatios(filtered, (product) => TOOTHPASTE_LABELS[toothpasteStatus(product)]);
  assert.equal(segment.subscriptionCount, 1);
  assert.deepEqual(segment.all.find((i) => i.product === "歯磨き剤あり").stageCounts, [0, 1, 0, 0]);
});

test("empty comma entries merge with the same product without splitting combinations", () => {
  const result = calculateLtvProductRatios([
    row(",大人2本", "大人2本,"),
    row("大人2本", " , 大人2本 , "),
    row("，大人2本", ", ,"),
    row("大人2本,歯磨き剤", "大人2本,,歯磨き剤,"),
  ]);
  assert.equal(result.initial.find((i) => i.product === "大人2本").count, 3);
  assert.equal(result.all.find((i) => i.product === "大人2本").count, 5);
  assert.equal(result.all.find((i) => i.product === "大人2本,歯磨き剤").count, 2);
  assert.deepEqual(result.stageCounts, [4, 3, 0, 0]);
  assert.ok(result.all.every((i) => !i.product.startsWith(",") && !i.product.endsWith(",")));
});

test("adult and child count labels ignore toothpaste, sum repeated quantities, and preserve unknowns", () => {
  for (const name of ["大人2本", ",大人2本", "大人2本,Hareno歯磨き剤_1ヶ月ごと", "歯磨き粉, 大人２本,"]) {
    assert.equal(brushCountLabel(name), "大人2本");
  }
  assert.equal(brushCountLabel("大人1本,大人2本"), "大人3本");
  assert.equal(brushCountLabel("こども2本,大人2本,歯磨き剤"), "大人2本＋こども2本");
  assert.equal(brushCountLabel("子供用２本,子ども1本,おとな用 4 本"), "大人4本＋こども3本");
  assert.equal(brushCountLabel("スパイラル2本"), "その他（大人・こども表記なし）");
  assert.equal(brushCountLabel("大人2本,スパイラル2本"), "大人2本");
  assert.equal(brushCountLabel("未設定"), "不明（商品未記録）");
  assert.equal(brushCountLabel("大人セット"), "不明（本数判定不可）");
  assert.equal(brushCountLabel("大人2本,こども不明"), "不明（本数判定不可）");
});

test("count-based ratios independently regroup each purchase and preserve totals after filters", () => {
  const rows = [row(",大人2本", "歯磨き剤,大人2本"), row("大人2本,歯磨き剤", "こども2本")];
  const result = calculateLtvProductRatios(rows, brushCountLabel);
  assert.equal(result.initial.length, 1);
  assert.equal(result.initial[0].product, "大人2本");
  assert.equal(result.initial[0].count, 2);
  assert.equal(result.initial[0].ratio, 1);
  assert.deepEqual(result.all.find((i) => i.product === "大人2本").stageCounts, [2, 1, 0, 0]);
  assert.equal(result.totalPurchaseCount, 4);
  assert.equal(result.all.reduce((sum, i) => sum + i.count, 0), 4);
  const filtered = filterLtvRows(rows, { toothpaste2: "yes" }, new Set());
  assert.equal(calculateLtvProductRatios(filtered, brushCountLabel).subscriptionCount, 1);
});
