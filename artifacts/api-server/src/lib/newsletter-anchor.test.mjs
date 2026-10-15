import test from "node:test";
import assert from "node:assert/strict";
import { aggregateRows, computeMatrixData, newsletterPeriod, periodEnd } from "./newsletter-aggregate.ts";

const row = (date, count = 10, subject = "件名") => ({
  deliveryDate: date, deliveryYearMonth: date.slice(0, 7), deliveryWeek: "",
  deliveryCount: count, openCount: 2, clickCount: 1, cvCount: 0,
  scenarioName: "scenario", templateName: "template", subject, segment: "", deliveryMethod: "",
});
test("Oct 7 weekly campaign buckets are Sep 30–Oct 6, Oct 7–13 and Oct 14–20", () => {
  const rows = [row("2026/09/30"), row("2026/10/06"), row("2026/10/07"), row("2026/10/13", 90), row("2026/10/14")];
  const items = aggregateRows(rows, "week", undefined, "2026-10-07");
  assert.deepEqual(items.map(x => [x.label, x.periodEnd, x.deliveryCount]), [
    ["2026/09/30", "2026/10/06", 20], ["2026/10/07", "2026/10/13", 100], ["2026/10/14", "2026/10/20", 10],
  ]);
  assert.equal(items[1].clickRate, 2 / 100);
  assert.equal(items.reduce((s, r) => s + r.deliveryCount, 0), 130);
});
test("every date lands in exactly one period; weeks do not straddle the campaign", () => {
  const anchor = "2026-10-07";
  const start = Date.parse(anchor + "T00:00:00Z");
  for (let offset = -100; offset <= 100; offset++) {
    const date = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
    const bucket = newsletterPeriod(date, "week", anchor);
    assert.equal(bucket < anchor.replace(/-/g, "/"), offset < 0);
    const end = periodEnd(bucket, "week", anchor);
    assert.ok(bucket <= date.replace(/-/g, "/") && end >= date.replace(/-/g, "/"));
  }
});
test("campaign months start on the anniversary, with leap-year and month-end clamping", () => {
  assert.equal(newsletterPeriod("2026/10/06", "month", "2026-10-07"), "2026/09/07");
  assert.equal(periodEnd("2026/09/07", "month", "2026-10-07"), "2026/10/06");
  assert.equal(newsletterPeriod("2026/10/07", "month", "2026-10-07"), "2026/10/07");
  assert.equal(periodEnd("2026/10/07", "month", "2026-10-07"), "2026/11/06");
  assert.equal(newsletterPeriod("2024/02/29", "month", "2024-01-31"), "2024/02/29");
  assert.equal(periodEnd("2024/02/29", "month", "2024-01-31"), "2024/03/30");
  assert.equal(newsletterPeriod("2024/03/31", "month", "2024-01-31"), "2024/03/31");
});
test("category and matrix aggregates use identical anchored buckets and weighted rates", () => {
  const rows = [row("2026/10/06"), row("2026/10/07", 90), row("2026/10/08", 10, "別件名")];
  for (const grain of ["day", "week", "month"]) {
    const temporal = aggregateRows(rows, grain, undefined, "2026-10-07");
    const categories = aggregateRows(rows, "scenario", grain, "2026-10-07");
    assert.equal(categories.reduce((sum, x) => sum + x.deliveryCount, 0), 110);
    const matrix = computeMatrixData(rows, ["scenario"], [], grain, ["deliveryCount", "clickRate"], "2026-10-07");
    assert.deepEqual(matrix.timePeriods, temporal.map(x => x.label));
    for (const item of temporal) {
      assert.equal(matrix.series[0].metricValues.deliveryCount[item.label], item.deliveryCount);
      assert.equal(matrix.series[0].metricValues.clickRate[item.label], item.clickRate);
    }
  }
});
test("ordinary mode retains Monday weeks and calendar months", () => {
  assert.equal(newsletterPeriod("2026/10/07", "week"), "2026/10/05");
  assert.equal(newsletterPeriod("2026/10/07", "month"), "2026/10");
});
