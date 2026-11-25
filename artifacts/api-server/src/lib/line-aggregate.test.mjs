import assert from "node:assert/strict";
import test from "node:test";
import { linePeriod, aggregateLineRows, summarizeLineZone } from "./line-aggregate.ts";

const zone = (over = {}) => ({
  zone: "overall", people: null, newCount: null, instantBlock: null, blockDelta: null,
  blockTotal: null, active: null, scenarioCount: null, lpAccess: null, cv: null, ...over,
});
const day = (date, over = {}) => ({ date, zones: [zone(over)] });
const pick = (items, period) => items.find((item) => item.period === period);

test("weeks start on Monday and months on the first, matching the source sheet", () => {
  assert.equal(linePeriod("2026-11-23", "day"), "2026-11-23");
  assert.equal(linePeriod("2026-11-23", "week"), "2026-11-23", "月曜はその日が週の頭");
  assert.equal(linePeriod("2026-11-29", "week"), "2026-11-23", "日曜は同じ週");
  assert.equal(linePeriod("2026-11-30", "week"), "2026-11-30", "翌月曜から次の週");
  assert.equal(linePeriod("2026-11-23", "month"), "2026-11-01");
  assert.equal(linePeriod("2026-01-01", "week"), "2025-12-29", "年をまたぐ週");
});

test("flow metrics are summed while stock metrics take the period's last day", () => {
  const items = aggregateLineRows([
    day("2026-11-23", { newCount: 10, cv: 1, lpAccess: 20, people: 100, blockTotal: 30, active: 70 }),
    day("2026-11-24", { newCount: 5, cv: 2, lpAccess: 10, people: 105, blockTotal: 31, active: 74 }),
  ], "week");
  const week = pick(items, "2026-11-23");
  assert.equal(week.newCount, 15, "新規は足す");
  assert.equal(week.cv, 3);
  assert.equal(week.lpAccess, 30);
  assert.equal(week.active, 74, "残存は期末の値（足すと二重計上になる）");
  assert.equal(week.people, 105);
  assert.equal(week.blockTotal, 31);
  assert.equal(week.days, 2);
});

test("rates are computed from the aggregated numerator and denominator, not averaged", () => {
  const items = aggregateLineRows([
    day("2026-11-23", { newCount: 100, instantBlock: 1, cv: 1, lpAccess: 10, people: 200, blockTotal: 50, active: 150 }),
    day("2026-11-24", { newCount: 100, instantBlock: 9, cv: 9, lpAccess: 90, people: 200, blockTotal: 50, active: 150 }),
  ], "week");
  const week = pick(items, "2026-11-23");
  // 日次の率(1% と 9%)の平均5%ではなく、10/200=5% … ここでは合計から計算して 10/200
  assert.equal(week.instantBlockRate, 10 / 200);
  assert.equal(week.cvrLp, 10 / 100);
  assert.equal(week.convRate, 10 / 200);
  assert.equal(week.blockRate, 50 / 200);
});

test("the net change compares a period's end with the previous period's end", () => {
  const items = aggregateLineRows([
    day("2026-11-16", { active: 100 }),
    day("2026-11-23", { active: 130 }),
    day("2026-11-30", { active: 125 }),
  ], "week");
  assert.equal(pick(items, "2026-11-16").activeDelta, null, "最初の期間は比べる相手がいない");
  assert.equal(pick(items, "2026-11-23").activeDelta, 30);
  assert.equal(pick(items, "2026-11-30").activeDelta, -5);
});

test("a blank metric stays null instead of becoming zero, so unconfirmed days are visible", () => {
  const items = aggregateLineRows([day("2026-11-24", { people: 100, blockTotal: 30, active: 70 })], "day");
  const today = pick(items, "2026-11-24");
  assert.equal(today.newCount, null, "翌朝確定の列は空のまま");
  assert.equal(today.cv, null);
  assert.equal(today.instantBlockRate, null, "分母が無い率は0%と言わない");
  assert.equal(today.active, 70);
});

test("a day with no stock values does not overwrite the period's closing balance", () => {
  const items = aggregateLineRows([
    day("2026-11-23", { active: 70, people: 100, blockTotal: 30 }),
    day("2026-11-24", { newCount: 5 }),
  ], "week");
  const week = pick(items, "2026-11-23");
  assert.equal(week.active, 70, "残高が空の最新日で上書きしない");
  assert.equal(week.newCount, 5);
});

test("date range and zone filters apply before aggregation", () => {
  const rows = [
    { date: "2026-11-23", zones: [zone({ cv: 1 }), zone({ zone: "qrNew", cv: 10 })] },
    { date: "2026-11-24", zones: [zone({ cv: 2 }), zone({ zone: "qrNew", cv: 20 })] },
  ];
  const onlyNew = aggregateLineRows(rows, "month", { zones: ["qrNew"] });
  assert.deepEqual(onlyNew.map((item) => [item.zone, item.cv]), [["qrNew", 30]]);
  const oneDay = aggregateLineRows(rows, "month", { dateFrom: "2026-11-24" });
  assert.equal(pick(oneDay.filter((item) => item.zone === "overall"), "2026-11-01").cv, 2);
  assert.deepEqual(aggregateLineRows(rows, "day", { dateFrom: "2026-12-01" }), []);
});

test("the KPI summary uses the latest balance and the period's flow totals", () => {
  const summary = summarizeLineZone([
    day("2026-11-22", { active: 60, people: 90, blockTotal: 30, newCount: 10, instantBlock: 1, cv: 1, lpAccess: 20 }),
    day("2026-11-23", { active: 70, people: 100, blockTotal: 30, newCount: 5, instantBlock: 0, cv: 2, lpAccess: 30 }),
    day("2026-11-24", { newCount: 3 }),
  ], "overall");
  assert.equal(summary.activeLatest, 70);
  assert.equal(summary.activeLatestDate, "2026-11-23", "残高が入っている最新日");
  assert.equal(summary.blockRateLatest, 30 / 100);
  assert.equal(summary.newCount, 18, "残高の無い日の新規も足す");
  assert.equal(summary.cv, 3);
  assert.equal(summary.lpAccess, 50);
  assert.equal(summary.cvrLp, 3 / 50);
  assert.equal(summary.instantBlockRate, 1 / 18);
});

test("an empty selection summarizes to nulls and zeroes without dividing by zero", () => {
  const summary = summarizeLineZone([], "overall");
  assert.equal(summary.activeLatest, null);
  assert.equal(summary.cvrLp, null);
  assert.equal(summary.cv, 0);
});
