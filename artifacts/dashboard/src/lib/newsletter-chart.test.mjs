import test from "node:test";
import assert from "node:assert/strict";
import { focusRange, timePeriod, CHART_METRICS, formatChartRate, formatChartValueLabel, formatNewsletterDecimal, formatNewsletterPercent, recentNewsletterDateRange, newsletterSeriesUsesBars } from "./newsletter-chart.ts";

test("default newsletter range includes today and the preceding 29 calendar days", () => {
  assert.deepEqual(recentNewsletterDateRange(new Date(2026, 10, 5, 12)), { from: "2026/10/07", to: "2026/11/05" });
  assert.deepEqual(recentNewsletterDateRange(new Date(2026, 0, 10, 12)), { from: "2025/12/12", to: "2026/01/10" });
  assert.deepEqual(recentNewsletterDateRange(new Date(2024, 2, 1, 12)), { from: "2024/02/01", to: "2024/03/01" });
});

test("categorical, single-point and sparse series use bars instead of isolated dots", () => {
  assert.equal(newsletterSeriesUsesBars([0.2, 0.3], true), true);
  assert.equal(newsletterSeriesUsesBars([0.2, 0.3]), false);
  assert.equal(newsletterSeriesUsesBars([0]), true);
  assert.equal(newsletterSeriesUsesBars([null, 0.3]), true);
  assert.equal(newsletterSeriesUsesBars([0.2, undefined, 0.3]), true);
  assert.equal(newsletterSeriesUsesBars([0.2, NaN]), true);
  assert.equal(newsletterSeriesUsesBars([0, 0]), false);
});

test("open and click counts are selectable count metrics", () => {
  for (const [value, label] of [["openCount", "開封数"], ["clickCount", "クリック数"]]) {
    const metric = CHART_METRICS.find((entry) => entry.value === value);
    assert.equal(metric?.label, label);
    assert.equal(metric?.isRate, false);
  }
});

test("value labels format counts and small rates without inventing missing values", () => {
  assert.equal(formatChartValueLabel(12345, false), "12,345");
  assert.equal(formatChartValueLabel(0.000123, true), "0.0%");
  assert.equal(formatChartValueLabel(0, false), "0");
  assert.equal(formatChartValueLabel(0, true), "0.0%");
  for (const value of [null, undefined, NaN, Infinity]) {
    assert.equal(formatChartValueLabel(value, true), "");
  }
});

test("newsletter decimal displays round to one decimal without changing source values", () => {
  for (const [value, expected] of [[0.12344, "12.3%"], [0.1235, "12.4%"], [0.28779, "28.8%"], [1, "100.0%"], [0, "0.0%"]]) {
    assert.equal(formatChartRate(value), expected);
    assert.equal(formatNewsletterPercent(value), expected);
    assert.equal(formatChartValueLabel(value, true), expected);
  }
  assert.equal(formatNewsletterPercent(undefined), "0.0%");
  assert.equal(formatNewsletterDecimal(1.15), "1.2");
  assert.equal(formatNewsletterDecimal(-1.15), "-1.2");
  assert.equal(formatChartValueLabel(12.35, false), "12.4");
  const source = 0.123456789;
  formatChartRate(source);
  assert.equal(source, 0.123456789);
});

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
test("small click rates follow the same requested one-decimal precision on axes", () => {
  assert.equal(formatChartRate(0.0001), "0.0%");
  assert.equal(formatChartRate(0.0002), "0.0%");
  assert.equal(formatChartRate(0), "0.0%");
});
