import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRows } from "./newsletter-aggregate.ts";

function row(deliveryDate, subject, deliveryCount = 10) {
  return {
    deliveryDate, subject, deliveryCount,
    deliveryYearMonth: deliveryDate.slice(0, 7), deliveryWeek: "",
    scenarioName: "same-scenario", segment: "", deliveryMethod: "",
    templateName: "same-template", openCount: 2, clickCount: 1, cvCount: 0,
  };
}

test("scenario and template aggregation disclose both subjects in date order", () => {
  for (const groupBy of ["scenario", "template"]) {
    const [result] = aggregateRows([
      row("2026/10/01", "new", 20),
      row("2026/09/29", "old"),
      row("2026/10/02", "new"),
    ], groupBy);
    assert.equal(result.subject, "複数の件名（2種類）\nold\nnew");
    assert.equal(result.deliveryCount, 40);
    assert.equal(result.openCount, 6);
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

test("does not silently hide missing subjects in mixed groups", () => {
  assert.equal(aggregateRows([row("2026/09/29", "")], "scenario")[0].subject, null);
  assert.equal(aggregateRows([
    row("2026/09/29", ""), row("2026/10/01", "new"),
  ], "scenario")[0].subject, "複数の件名（2種類）\n（件名未取得）\nnew");
});
