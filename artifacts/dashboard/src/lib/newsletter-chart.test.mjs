import test from "node:test";
import assert from "node:assert/strict";
import { focusRange, timePeriod, CHART_METRICS, formatChartRate } from "./newsletter-chart.ts";

test("focus range contains equal numbers of campaign-relative periods on both sides", () => {
  assert.deepEqual(focusRange("2026-10-07", "week", 2), { from: "2026-09-23", to: "2026-10-20" });
  assert.deepEqual(focusRange("2026-10-07", "day", 2), { from: "2026-10-05", to: "2026-10-08" });
  assert.deepEqual(focusRange("2026-10-07", "month", 2), { from: "2026-08-07", to: "2026-12-06" });
});
test("reference lines use the same anchors as aggregation, and month shifting never drifts", () => {
  assert.equal(timePeriod("2026-10-07", "week", "2026-10-07"), "2026/10/07");
  assert.equal(timePeriod("2026-10-06", "week", "2026-10-07"), "2026/09/30");
  assert.equal(timePeriod("2024-03-31", "month", "2024-01-31"), "2024/03/31");
  assert.deepEqual(focusRange("2024-01-31", "month", 1), { from: "2023-12-31", to: "2024-02-28" });
});
test("click rate and CVR are selectable percentage metrics, CV count is a count", () => {
  assert.equal(CHART_METRICS.find(x => x.value === "clickRate").isRate, true);
  assert.equal(CHART_METRICS.find(x => x.value === "cvr").isRate, true);
  assert.equal(CHART_METRICS.find(x => x.value === "cvCount").isRate, false);
});
test("small click rates remain distinguishable on percentage axes", () => {
  assert.equal(formatChartRate(0.0001), "0.01%");
  assert.equal(formatChartRate(0.0002), "0.02%");
  assert.equal(formatChartRate(0), "0%");
});
