import assert from "node:assert/strict";
import test from "node:test";
import { analyzeOptoutMail } from "./optout-mail-analysis.ts";

const event = (customerCode, date, templateName = "T", nodeId = "n1", scenarioName = "S") =>
  ({ customerCode, date, templateName, nodeId, scenarioName });

const snapshot = (events) => {
  const dates = events.map((item) => item.date).sort();
  return {
    events, from: dates[0] ?? null, to: dates.at(-1) ?? null,
    rawRows: events.length, excludedRows: 0, invalidRows: 0, available: true, error: null,
  };
};

const purchase = (customerCode, firstOrderMonth, subsOrderCode = customerCode, ltv = {}) => ({
  customerCode, subsOrderCode, firstOrderMonth,
  firstProduct: "", adGroupName: "", subsStatus: "", product2: "", product3: "", product4: "",
  ltv95: ltv.ltv95 ?? 0, ltv180: ltv.ltv180 ?? 0, ltv365: ltv.ltv365 ?? 0,
  sellingUrl: "", offerName: "",
});

const out = (customerCode, optoutDate) => ({ customerCode, optoutDate });
const metadata = { purchaseSyncedAt: "2026-11-01T00:00:00Z", fetchedAt: "2026-11-23T00:00:00Z" };
const run = (events, optouts = [], purchases = [], options = {}) =>
  analyzeOptoutMail(snapshot(events), optouts, purchases,
    { minEvents: 1, today: "2026-11-23", optoutDataFrom: "2026-01-01", ...options }, metadata);

test("same-day and later deliveries are excluded from both the numerator and the denominator", () => {
  // 解除推定日は操作日時ではないので、当日の配信が解除前だったとは言えない。
  const result = run([
    event("a", "2026-03-01"), event("a", "2026-03-10"),
    event("a", "2026-03-15"), event("a", "2026-03-20"),
  ], [out("a", "2026-03-15")]);
  const reached = result.sequence.map((item) => [item.sequence, item.reached, item.churned]);
  assert.deepEqual(reached, [[1, 1, 0], [2, 1, 1]]);
  assert.equal(result.coverage.cohortOptouts, 1);
  assert.equal(result.nodes[0].events, 2, "解除日当日と以降の2通は母数に入らない");
});

test("an opt-out with no usable prior record is reported as undecidable instead of as a zero-mail churn", () => {
  const result = run([
    event("same", "2026-03-15"),
    event("none", "2026-04-20"),
  ], [out("same", "2026-03-15"), out("none", "2026-03-01")]);
  assert.equal(result.coverage.undecidableSameDay, 1);
  assert.equal(result.coverage.undecidableNoHistory, 1);
  assert.equal(result.sequence.reduce((sum, item) => sum + item.churned, 0), 0);
});

test("customers whose history starts before opt-out data are excluded, so invisible churn is not counted as retention", () => {
  const result = run([
    event("early", "2025-11-01"), event("early", "2026-02-01"),
    event("late", "2026-02-01"),
  ], [out("x", "2025-12-31")], [], { optoutDataFrom: "2025-12-31" });
  assert.equal(result.coverage.optoutFrom, "2025-12-31");
  assert.equal(result.coverage.excludedEarlyCustomers, 1);
  assert.equal(result.coverage.cohortCustomers, 1);
});

test("hazard divides by the customers who reached that position, and the cumulative share uses the whole cohort", () => {
  const events = [];
  for (let index = 0; index < 10; index++) {
    events.push(event(`c${index}`, "2026-03-01"));
    if (index < 4) events.push(event(`c${index}`, "2026-03-10"));
  }
  // c0 は1通目のあと、c1 は2通目のあとに解除。
  const result = run(events, [out("c0", "2026-03-05"), out("c1", "2026-03-15")]);
  const first = result.sequence[0];
  const second = result.sequence[1];
  assert.equal(first.reached, 10);
  assert.equal(first.churned, 1, "c0 は1通目までしか受け取っていない");
  assert.equal(first.hazard, 1 / 10);
  // c0 は1通目のあとに解除したので、2通目には到達していない（c1〜c3 の3人だけ）。
  assert.equal(second.reached, 3);
  assert.equal(second.churned, 1);
  assert.equal(second.hazard, 1 / 3);
  assert.equal(second.cumulativeShare, 2 / 10);
});

test("labels disambiguate repeated template names by node and name deleted templates by scenario", () => {
  const result = run([
    event("a", "2026-03-01", "同名テンプレ", "node-aaaa1111"),
    event("b", "2026-03-01", "同名テンプレ", "node-bbbb2222"),
    event("c", "2026-03-01", "単独テンプレ", "node-cccc3333"),
    event("d", "2026-03-01", "削除されたテンプレート", "node-dddd4444", "260130_スタートガイドメルマガ"),
  ]);
  const labels = result.nodes.map((item) => item.label).sort();
  assert.deepEqual(labels, [
    "260130_スタートガイドメルマガ／テンプレ削除済 node-ddd",
    "単独テンプレ",
    "同名テンプレ（node-aaa）",
    "同名テンプレ（node-bbb）",
  ]);
});

test("frequency buckets stay inside one sequence position, so survivors are never pooled with newcomers", () => {
  const result = run([
    // 2通目までの間隔が2日の顧客と、20日の顧客。
    event("fast", "2026-03-01"), event("fast", "2026-03-03"), event("fast", "2026-03-25"),
    event("slow", "2026-03-01"), event("slow", "2026-03-21"),
  ], [out("slow", "2026-03-28")], [], { frequencySequences: [2, 3] });
  const second = result.frequency.find((group) => group.sequence === 2);
  assert.deepEqual(second.buckets.map((item) => [item.bucket, item.events, item.churned]),
    [["d0_3", 1, 0], ["d15_30", 1, 1]]);
  const third = result.frequency.find((group) => group.sequence === 3);
  assert.deepEqual(third.buckets.map((item) => [item.bucket, item.events]), [["d15_30", 1]]);
});

test("stratified node tables compare only the same position and drop groups below the volume floor", () => {
  const result = run([
    event("a", "2026-03-01", "一通目用", "n1"), event("a", "2026-03-10", "二通目用", "n2"),
    event("b", "2026-03-01", "一通目用", "n1"),
  ], [], [], { minEvents: 2, nodeSequences: [1, 2] });
  const first = result.nodesBySequence.find((group) => group.sequence === 1);
  const second = result.nodesBySequence.find((group) => group.sequence === 2);
  assert.deepEqual(first.items.map((item) => [item.label, item.events]), [["一通目用", 2]]);
  assert.deepEqual(second.items, [], "1件しかないノードは率を出さずに落とす");
  assert.equal(result.lowVolumeNodes, 1);
});

test("LTV cohorts use one subscription per customer and mark averages that cannot have matured", () => {
  const result = run(
    [event("a", "2026-02-01"), event("b", "2026-02-01")],
    [out("a", "2026-03-01")],
    [
      purchase("a", "2026-01-01", "sub-late", { ltv95: 9999, ltv180: 9999, ltv365: 9999 }),
      purchase("a", "2025-12-01", "sub-early", { ltv95: 100, ltv180: 200, ltv365: 300 }),
      purchase("b", "2025-12-01", "sub-b", { ltv95: 500, ltv180: 600, ltv365: 700 }),
    ],
  );
  const cohort = result.ltvCohorts.find((item) => item.cohortMonth === "2025-12");
  assert.equal(result.ltvCohorts.length, 1, "顧客aの2つの定期は最も早い月の1件に寄せる");
  assert.equal(cohort.withCount, 1);
  assert.equal(cohort.withLtv180, 200, "遅い定期の9999は使わない");
  assert.equal(cohort.withoutLtv180, 600);
  assert.equal(cohort.optoutRate, 0.5);
  assert.equal(cohort.mature180, true, "2025-12末+180日は基準日より前");
  assert.equal(cohort.mature365, false, "2025-12末+365日は基準日より後");
});

test("malformed dates are dropped rather than silently treated as the epoch", () => {
  const result = run(
    [event("a", "2026-03-01")],
    [out("a", "2026/03/05"), out("b", "")],
    [purchase("a", "not-a-date"), purchase("b", "2026-02-01")],
  );
  assert.equal(result.coverage.cohortOptouts, 0, "正規化されていない解除日は使わない");
  assert.deepEqual(result.ltvCohorts.map((item) => item.cohortMonth), ["2026-02"]);
});

test("empty sources produce finite, zero-filled output instead of throwing", () => {
  const result = run([], [], []);
  assert.deepEqual(result.sequence, []);
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.ltvCohorts, []);
  assert.equal(result.coverage.cohortCustomers, 0);
  assert.ok(result.notes.length > 0);
});

test("the cohort boundary falls back to the earliest observed opt-out when no extract start is given", () => {
  const events = [event("a", "2026-03-01"), event("a", "2026-03-10")];
  const withoutOption = analyzeOptoutMail(snapshot(events), [out("a", "2026-03-20")], [],
    { minEvents: 1, today: "2026-11-23" }, metadata);
  assert.equal(withoutOption.coverage.optoutFrom, "2026-03-20");
  assert.equal(withoutOption.coverage.excludedEarlyCustomers, 1, "抽出開始日が分からないときは安全側に倒す");
  const empty = analyzeOptoutMail(snapshot([]), [], [], { minEvents: 1, today: "2026-11-23" }, metadata);
  assert.equal(empty.coverage.optoutFrom, null);
});
