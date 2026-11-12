import assert from "node:assert/strict";
import test from "node:test";
import { toothpasteStatus, segmentOf, filterLtvRows, aggregateLtv } from "./ltv-aggregate.ts";

const row = (first, second = "", third = "", fourth = "") => ({
  subsOrderCode: "sub", customerCode: "customer", firstOrderMonth: "2026-01-01",
  firstProduct: first, product2: second, product3: third, product4: fourth,
  offerName: "オファーA", subsStatus: "継続中", adGroupName: "広告A",
  ltv95: 100, ltv180: 200, ltv365: 300, sellingUrl: "",
});

test("toothpaste classification handles combinations, spelling variants, and unknown records", () => {
  for (const label of ["大人2本,Hareno歯磨き剤_1ヶ月ごと", "歯磨き粉", "歯みがき剤", "ﾊﾐｶﾞｷ粉", "TOOTHPASTE"]) {
    assert.equal(toothpasteStatus(label), "yes", label);
  }
  for (const label of ["大人2本", "こども2本", "歯磨きブラシ", "大人4本,スパイラル2本"]) {
    assert.equal(toothpasteStatus(label), "no", label);
  }
  for (const label of ["", " ", null, undefined, "未設定", "不明", "未購入", "—", "N/A", ", ,"]) {
    assert.equal(toothpasteStatus(label), "unknown", String(label));
  }
});

test("purchase stages are independent, including changes in either direction and missing later purchases", () => {
  const changed = row("大人2本", "大人2本,歯磨き剤", "大人2本", "");
  const noOptouts = new Set();
  assert.equal(segmentOf(changed, "toothpaste1", noOptouts), "歯磨き剤なし");
  assert.equal(segmentOf(changed, "toothpaste2", noOptouts), "歯磨き剤あり");
  assert.equal(segmentOf(changed, "toothpaste3", noOptouts), "歯磨き剤なし");
  assert.equal(segmentOf(changed, "toothpaste4", noOptouts), "不明（商品未記録）");
  const reverse = row("歯磨き剤", "大人2本");
  assert.equal(segmentOf(reverse, "toothpaste1", noOptouts), "歯磨き剤あり");
  assert.equal(segmentOf(reverse, "toothpaste2", noOptouts), "歯磨き剤なし");
});

test("multiple toothpaste stage segments combine with all existing filters using AND", () => {
  const match = row("大人2本", "歯磨き剤");
  const rows = [
    match, row("歯磨き剤", "歯磨き剤"), row("大人2本", ""),
    { ...match, firstOrderMonth: "2025-12-01" }, { ...match, offerName: "別" },
    { ...match, subsStatus: "解約" }, { ...match, adGroupName: "別" },
    { ...match, customerCode: "not-opted-out" },
  ];
  const result = filterLtvRows(rows, {
    toothpaste1: "no", toothpaste2: "yes", toothpaste3: "unknown", toothpaste4: "all",
    monthFrom: "2026-01-01", monthTo: "2026-01-01", firstProducts: ["大人2本"],
    offers: ["オファーA"], subsStatuses: ["継続中"], adGroups: ["広告A"], optout: "yes",
  }, new Set(["customer"]));
  assert.deepEqual(result, [match]);
  assert.equal(filterLtvRows(rows, { toothpaste2: "unknown" }, new Set()).length, 1);
});

test("monthly and total toothpaste breakdowns retain correct counts, averages, and unknown groups", () => {
  const rows = [row("大人2本", "歯磨き剤"), row("大人2本", "大人2本"), row("大人2本")];
  for (const mode of ["month", "total"]) {
    const items = aggregateLtv(rows, "toothpaste2", new Set(), mode);
    assert.equal(items.length, 3);
    assert.equal(items.reduce((sum, item) => sum + item.count, 0), 3);
    assert.ok(items.every((item) => item.ltv95 === 100 && item.ltv365 === 300));
  }
  assert.deepEqual(aggregateLtv([], "toothpaste4", new Set(), "total"), []);
});
