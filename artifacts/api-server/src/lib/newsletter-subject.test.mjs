import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRows, computeSummary, mergeComparisonMetrics, computeMatrixData } from "./newsletter-aggregate.ts";

function row(deliveryDate, subject, deliveryCount = 10) {
  return {
    deliveryDate, subject, deliveryCount,
    deliveryYearMonth: deliveryDate.slice(0, 7), deliveryWeek: "",
    scenarioName: "same-scenario", segment: "", deliveryMethod: "",
    templateName: "same-template", openCount: 2, clickCount: 1, cvCount: 0,
  };
}

test("scenario and template aggregation split subjects and compute each row's own metrics", () => {
  for (const groupBy of ["scenario", "template"]) {
    const source = [
      row("2026/10/01", "new", 20),
      row("2026/09/29", "old"),
      row("2026/10/02", "new"),
    ];
    const result = aggregateRows(source, groupBy);
    assert.equal(result.length, 2);
    const old = result.find(x => x.subject === "old");
    const next = result.find(x => x.subject === "new");
    assert.equal(old.deliveryCount, 10);
    assert.equal(old.openCount, 2);
    assert.equal(old.openRate, 2 / 10);
    assert.equal(old.clickCount, 1);
    assert.equal(old.clickRate, 1 / 10);
    assert.equal(next.deliveryCount, 30);
    assert.equal(next.openCount, 4);
    assert.equal(next.openRate, 4 / 30);
    assert.equal(next.clickCount, 2);
    assert.equal(next.clickRate, 2 / 30);
    assert.equal(result.reduce((sum, x) => sum + x.deliveryCount, 0), computeSummary(source).deliveryCount);
    assert.equal(result.reduce((sum, x) => sum + x.openCount, 0), computeSummary(source).openCount);
    assert.ok(result.every(x => x.label === (groupBy === "scenario" ? "same-scenario" : "same-template")));
  }
});

test("daily grouping retains each day's subject and reveals same-day mixed subjects", () => {
  const result = aggregateRows([
    row("2026/10/01", "new"), row("2026/09/29", "old"),
  ], "day");
  assert.deepEqual(result.map(x => x.subject), ["old", "new"]);
  assert.equal(aggregateRows([
    row("2026/09/30", "old"), row("2026/09/30", "new"),
  ], "day")[0].subject, "複数の件名（2種類）\nold\nnew");
});

test("missing subjects are a separate row, not attributed to a known subject", () => {
  assert.equal(aggregateRows([row("2026/09/29", "")], "scenario")[0].subject, null);
  const result = aggregateRows([
    row("2026/09/29", ""), row("2026/10/01", "new"),
  ], "scenario");
  assert.equal(result.length, 2);
  assert.equal(result.find(x => x.subject == null).deliveryCount, 10);
  assert.equal(result.find(x => x.subject === "new").deliveryCount, 10);
});

test("period comparison matches both the scenario/template and subject", () => {
  for (const groupBy of ["scenario", "template"]) {
    const current = aggregateRows([row("2026/10/01", "new"), row("2026/10/01", "old")], groupBy);
    const previous = aggregateRows([row("2026/09/29", "old", 100), row("2026/09/29", "new", 40)], groupBy);
    const result = mergeComparisonMetrics(current, previous, groupBy);
    assert.equal(result.find(x => x.subject === "old").prevDeliveryCount, 100);
    assert.equal(result.find(x => x.subject === "new").prevDeliveryCount, 40);
    const newOnly = mergeComparisonMetrics(current.filter(x => x.subject === "new"), previous.filter(x => x.subject === "old"), groupBy);
    assert.equal(newOnly[0].prevDeliveryCount, null);
  }
});

test("daily totals and matrix time-series remain combined rather than overwriting a subject", () => {
  const source = [row("2026/10/01", "old", 20), row("2026/10/01", "new", 10)];
  const daily = aggregateRows(source, "day");
  assert.equal(daily.length, 1);
  assert.equal(daily[0].deliveryCount, 30);
  const matrix = computeMatrixData(source, ["same-scenario"], [], "day", ["deliveryCount", "openRate"]);
  assert.equal(matrix.series[0].metricValues.deliveryCount["2026/10/01"], 30);
  assert.equal(matrix.series[0].metricValues.openRate["2026/10/01"], 4 / 30);
});

test("zero delivery denominators produce finite zero rates for that subject", () => {
  const [result] = aggregateRows([{ ...row("2026/10/01", "new", 0), openCount: 0, clickCount: 0 }], "scenario");
  assert.equal(result.openRate, 0);
  assert.equal(result.clickRate, 0);
  assert.equal(result.cvr, 0);
});
