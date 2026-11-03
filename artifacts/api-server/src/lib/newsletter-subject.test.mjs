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
    assert.equal(old.clickRate, 1 / 2);
    assert.equal(next.deliveryCount, 30);
    assert.equal(next.openCount, 4);
    assert.equal(next.openRate, 4 / 30);
    assert.equal(next.clickCount, 2);
    assert.equal(next.clickRate, 2 / 4);
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

test("daily totals remain combined while matrix rows retain each subject's delivered metrics", () => {
  const source = [row("2026/10/01", "old", 20), row("2026/10/01", "new", 10)];
  const daily = aggregateRows(source, "day");
  assert.equal(daily.length, 1);
  assert.equal(daily[0].deliveryCount, 30);
  const matrix = computeMatrixData(source, ["same-scenario"], [], "day", ["deliveryCount", "openRate"]);
  assert.equal(matrix.series.length, 2);
  const old = matrix.series.find((entry) => entry.subject === "old");
  const next = matrix.series.find((entry) => entry.subject === "new");
  assert.equal(old.metricValues.deliveryCount["2026/10/01"], 20);
  assert.equal(old.metricValues.openRate["2026/10/01"], 2 / 20);
  assert.equal(next.metricValues.deliveryCount["2026/10/01"], 10);
  assert.equal(next.metricValues.openRate["2026/10/01"], 2 / 10);
});

test("matrix subject groups preserve weighted rates, missing subjects, date boundaries and both selection filters", () => {
  const source = [
    { ...row("2026/09/30", "old", 100), openCount: 20, clickCount: 2, segment: "以前" },
    { ...row("2026/10/01", "new", 200), openCount: 50, clickCount: 5, segment: "現在" },
    { ...row("2026/10/02", " new ", 400), openCount: 10, clickCount: 3, segment: "現在" },
    row("2026/10/02", "", 30),
    { ...row("2026/10/02", "old", 800), scenarioName: "別シナリオ" },
    { ...row("2026/10/02", "old", 900), templateName: "別テンプレ" },
  ];
  for (const grain of ["day", "week", "month"]) {
    for (const anchor of [undefined, "2026-10-01"]) {
      const matrix = computeMatrixData(source, ["same-scenario"], ["same-template"], grain,
        ["deliveryCount", "openCount", "clickCount", "openRate", "clickRate", "cvr", "cvCount"], anchor);
      for (const type of ["scenario", "template"]) {
        const series = matrix.series.filter((entry) => entry.type === type);
        assert.deepEqual(series.map((entry) => entry.subject), ["old", "new", null]);
        assert.equal(series.reduce((sum, entry) => sum + Object.values(entry.metricValues.deliveryCount).reduce((a, b) => a + b, 0), 0), 730);
        for (const entry of series) {
          const matching = source.filter((delivery) => delivery.scenarioName === "same-scenario"
            && delivery.templateName === "same-template" && (delivery.subject.trim() || null) === entry.subject);
          const expected = aggregateRows(matching, grain, undefined, anchor);
          for (const item of expected) {
            for (const metric of ["deliveryCount", "openCount", "clickCount", "openRate", "clickRate", "cvr", "cvCount"]) {
              assert.equal(entry.metricValues[metric][item.label], item[metric]);
            }
          }
        }
        const old = series.find((entry) => entry.subject === "old");
        assert.equal(old.latestSegment.segment, "以前");
        const next = series.find((entry) => entry.subject === "new");
        assert.equal(next.latestSegment.segment, "現在");
      }
    }
  }
  const after = computeMatrixData(source.filter((delivery) => delivery.deliveryDate >= "2026/10/01"),
    ["same-scenario"], ["same-template"], "day", ["deliveryCount"]);
  assert.deepEqual(after.series.filter((entry) => entry.type === "scenario").map((entry) => entry.subject), ["new", null]);
});

test("zero delivery denominators produce finite zero rates for that subject", () => {
  const [result] = aggregateRows([{ ...row("2026/10/01", "new", 0), openCount: 0, clickCount: 0 }], "scenario");
  assert.equal(result.openRate, 0);
  assert.equal(result.clickRate, 0);
  assert.equal(result.cvr, 0);
});
