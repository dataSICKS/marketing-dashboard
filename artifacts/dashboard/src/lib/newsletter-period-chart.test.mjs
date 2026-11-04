import test from "node:test";
import assert from "node:assert/strict";
import { buildNewsletterPeriodChart } from "./newsletter-period-chart.ts";

test("many subjects in one month produce one X-axis period, not many category points", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    label: "シナリオA", subject: `件名${index}`, period: "2026/10",
    deliveryCount: 100 + index, openRate: index / 100,
  }));
  const chart = buildNewsletterPeriodChart(rows, ["deliveryCount", "openRate"]);
  assert.deepEqual(chart.points.map((point) => point.chartKey), ["2026/10"]);
  assert.equal(chart.series.length, 20);
  for (const [index, series] of chart.series.entries()) {
    assert.equal(chart.points[0][series.keys.openRate], rows[index].openRate);
    assert.equal(chart.points[0][series.keys.deliveryCount], rows[index].deliveryCount);
  }
});

test("two months connect only the same name and actual delivered subject", () => {
  const chart = buildNewsletterPeriodChart([
    { label: "A", subject: "旧件名", period: "2026/11", openRate: 0.25 },
    { label: "A", subject: "旧件名", period: "2026/10", openRate: 0.20 },
    { label: "A", subject: "新件名", period: "2026/11", openRate: 0.35 },
    { label: "B", subject: "旧件名", period: "2026/10", openRate: 0.50 },
  ], ["openRate"]);
  assert.deepEqual(chart.points.map((point) => point.chartKey), ["2026/10", "2026/11"]);
  const old = chart.series.find((series) => series.id === JSON.stringify(["A", "旧件名"]));
  const fresh = chart.series.find((series) => series.id === JSON.stringify(["A", "新件名"]));
  assert.deepEqual(chart.points.map((point) => point[old.keys.openRate]), [0.20, 0.25]);
  assert.deepEqual(chart.points.map((point) => point[fresh.keys.openRate]), [null, 0.35]);
  assert.equal(chart.series.length, 3);
});

test("weekly and daily period labels are preserved and sorted without regrouping subjects", () => {
  for (const periods of [["2026/11/02", "2026/10/26"], ["2026/11/05", "2026/11/04"]]) {
    const rows = periods.map((period) => ({ label: "テンプレA", subject: null, period, deliveryCount: 0, clickRate: 0.123456 }));
    const chart = buildNewsletterPeriodChart(rows, ["deliveryCount", "clickRate"]);
    assert.deepEqual(chart.points.map((point) => point.chartKey), [...periods].sort());
    assert.equal(chart.points[0][chart.series[0].keys.deliveryCount], 0);
    assert.equal(chart.points[0][chart.series[0].keys.clickRate], 0.123456);
  }
});

test("missing metrics remain null and punctuation cannot become Recharts property paths", () => {
  const chart = buildNewsletterPeriodChart([{ label: "A.B", subject: "件名[1].foo", period: "2026/10", openRate: null }], ["openRate"]);
  const key = chart.series[0].keys.openRate;
  assert.ok(!/[.[\]]/.test(key));
  assert.equal(chart.points[0][key], null);
  assert.throws(() => buildNewsletterPeriodChart([{ label: "A", openRate: 0.2 }], ["openRate"]), /集計期間/);
});
