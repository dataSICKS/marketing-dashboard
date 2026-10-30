import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRows, newsletterPeriod, computeMatrixData, computeSummary, mergeComparisonMetrics } from "./newsletter-aggregate.ts";

const row = (deliveryDate, subject = "件名A", deliveryCount = 10, openCount = 2) => ({
  deliveryDate, subject, deliveryCount, openCount, clickCount: 1, cvCount: 1,
  deliveryYearMonth: "wrong-month", deliveryWeek: "ambiguous-week",
  scenarioName: "シナリオA", templateName: "テンプレA", segment: "", deliveryMethod: "",
});

test("matrix returns summed open and click counts for each grain and campaign anchor", () => {
  const rows = [row("2026/10/07", "件名A", 100, 30), row("2026/10/08", "件名A", 50, 20)];
  for (const grain of ["day", "week", "month"]) {
    for (const anchor of [undefined, "2026-10-07"]) {
      const matrix = computeMatrixData(rows, ["シナリオA"], ["テンプレA"], grain, ["openCount", "clickCount"], anchor);
      for (const series of matrix.series) {
        assert.equal(Object.values(series.metricValues.openCount).reduce((a, b) => a + b, 0), 50);
        assert.equal(Object.values(series.metricValues.clickCount).reduce((a, b) => a + b, 0), 2);
      }
      if (grain !== "day") {
        assert.equal(matrix.series[0].metricValues.openCount[matrix.timePeriods[0]], 50);
        assert.equal(matrix.series[0].metricValues.clickCount[matrix.timePeriods[0]], 2);
      }
    }
  }
});

test("matrix exposes distinct spreadsheet segments without changing aggregated counts", () => {
  const rows = [
    { ...row("2026/10/07"), segment: "既存顧客" },
    { ...row("2026/10/08"), segment: "新規顧客" },
    { ...row("2026/10/09"), segment: " 既存顧客 " },
    { ...row("2026/10/10"), segment: "" },
  ];
  const matrix = computeMatrixData(rows, ["シナリオA"], ["テンプレA"], "month", ["deliveryCount"]);
  for (const series of matrix.series) {
    assert.deepEqual(new Set(series.segments), new Set(["既存顧客", "新規顧客"]));
    assert.equal(series.metricValues.deliveryCount["2026/10"], 40);
  }
  const empty = computeMatrixData([], ["シナリオA"], [], "month", ["deliveryCount"]);
  assert.deepEqual(empty.series[0].segments, []);
});

test("period segments follow bucket, scenario and template filters rather than a series-wide history", () => {
  const rows = [
    { ...row("2026/08/11"), segment: "変更前" },
    { ...row("2026/08/12"), segment: "変更後" },
    { ...row("2026/08/12"), segment: "別シナリオ", scenarioName: "シナリオB" },
    { ...row("2026/08/12"), segment: "別テンプレ", templateName: "テンプレB" },
  ];
  const matrix = computeMatrixData(rows, ["シナリオA"], ["テンプレA"], "day", ["deliveryCount"]);
  for (const series of matrix.series) {
    assert.deepEqual(series.periodSegments, {
      "2026/08/11": [{ scenarioName: "シナリオA", segment: "変更前" }],
      "2026/08/12": [{ scenarioName: "シナリオA", segment: "変更後" }],
    });
  }
  const filtered = computeMatrixData(rows.filter((r) => r.deliveryDate >= "2026/08/12"), ["シナリオA"], ["テンプレA"], "day", ["deliveryCount"]);
  assert.equal(filtered.series[0].periodSegments["2026/08/11"], undefined);
  const shared = computeMatrixData(rows, [], ["テンプレA"], "day", ["deliveryCount"]);
  assert.deepEqual(shared.series[0].periodSegments["2026/08/12"], [
    { scenarioName: "シナリオA", segment: "変更後" },
    { scenarioName: "シナリオB", segment: "別シナリオ" },
  ]);
  for (const grain of ["week", "month"]) {
    const grouped = computeMatrixData(rows, ["シナリオA"], ["テンプレA"], grain, ["deliveryCount"], "2026-08-12");
    assert.deepEqual(grouped.series[0].periodSegments[newsletterPeriod("2026/08/11", grain, "2026-08-12")],
      [{ scenarioName: "シナリオA", segment: "変更前" }]);
    assert.deepEqual(grouped.series[0].periodSegments["2026/08/12"],
      [{ scenarioName: "シナリオA", segment: "変更後" }]);
  }
  const blank = computeMatrixData([{ ...row("2026/08/12"), segment: "" }], ["シナリオA"], [], "day", ["deliveryCount"]);
  assert.deepEqual(blank.series[0].periodSegments["2026/08/12"], [{ scenarioName: "シナリオA", segment: "" }]);
});

test("week buckets start on Monday and span months and years consistently", () => {
  assert.equal(newsletterPeriod("2026/10/04", "week"), "2026/09/28");
  assert.equal(newsletterPeriod("2026-10-05", "week"), "2026/10/05");
  assert.equal(newsletterPeriod("2027/01/01", "week"), "2026/12/28");
  assert.equal(newsletterPeriod("2026/10/05", "month"), "2026/10");
});

test("all granularities preserve counts and use summed numerators for rates", () => {
  const rows = [row("2026/09/30", "件名A", 10, 5), row("2026/10/01", "件名A", 90, 9), row("2026/10/05", "件名B")];
  for (const grain of ["day", "week", "month"]) {
    const total = computeSummary(rows);
    for (const dimension of [grain, "scenario", "template"]) {
      const items = aggregateRows(rows, dimension, grain);
      assert.equal(items.reduce((sum, item) => sum + item.deliveryCount, 0), total.deliveryCount);
      assert.equal(items.reduce((sum, item) => sum + item.openCount, 0), total.openCount);
      assert.ok(items.every(item => item.openRate === item.openCount / item.deliveryCount));
    }
    const matrix = computeMatrixData(rows, ["シナリオA"], [], grain, ["deliveryCount", "openRate"]);
    assert.deepEqual(matrix.timePeriods, aggregateRows(rows, grain).map(item => item.label));
  }
  const weekly = aggregateRows(rows, "week");
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].openRate, 14 / 100);
  assert.equal(aggregateRows(rows, "month").length, 2);
});

test("scenario/template keep different subjects separate within every period", () => {
  const rows = [row("2026/10/01"), row("2026/10/02"), row("2026/10/02", "件名B"), row("2026/10/02", ""), row("2026/10/05")];
  for (const dimension of ["scenario", "template"]) {
    for (const grain of ["day", "week", "month"]) {
      const items = aggregateRows(rows, dimension, grain);
      const identities = items.map(item => JSON.stringify([item.label, item.subject, item.period]));
      assert.equal(new Set(identities).size, items.length);
      assert.ok(items.every(item => item.period));
      assert.equal(items.filter(item => item.subject === "件名B").length, 1);
      assert.equal(items.filter(item => item.subject === null).length, 1);
    }
    assert.equal(aggregateRows(rows, dimension, "week").filter(item => item.subject === "件名A").length, 2);
    assert.equal(aggregateRows(rows, dimension).filter(item => item.subject === "件名A").length, 1);
  }
});

test("relative period comparison respects subject identity and gaps", () => {
  const options = { granularity: "week", currentStart: "2026-10-05", previousStart: "2026-09-07" };
  for (const dimension of ["week", "scenario", "template"]) {
    const current = aggregateRows([row("2026/10/05"), row("2026/10/19")], dimension, "week");
    const previous = aggregateRows([row("2026/09/07", "件名A", 50), row("2026/09/14", "件名A", 60), row("2026/09/21", "件名A", 70)], dimension, "week");
    const merged = mergeComparisonMetrics(current, previous, dimension, options);
    assert.deepEqual(merged.map(item => item.prevDeliveryCount), [50, 70]);
  }
  const current = aggregateRows([row("2026/10/05", "新件名")], "scenario", "week");
  const previous = aggregateRows([row("2026/09/07", "旧件名")], "scenario", "week");
  assert.equal(mergeComparisonMetrics(current, previous, "scenario", options)[0].prevDeliveryCount, null);
});

test("empty inputs produce empty aggregates without date parsing errors", () => {
  for (const grain of ["day", "week", "month"]) {
    assert.deepEqual(aggregateRows([], "scenario", grain), []);
    assert.deepEqual(aggregateRows([], grain), []);
  }
});
