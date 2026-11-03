import assert from "node:assert/strict";
import test from "node:test";
import { matrixSeriesId, matrixSeriesLabel, matrixMetricKey, mergeMatrixSeries } from "./newsletter-matrix.ts";

const row = (subject, period, count, type = "scenario") => ({
  key: "同じ名前", type, subject, segments: [subject ?? ""],
  latestSegment: { scenarioName: "同じ名前", segment: subject ?? "", date: period.replace(/\//g, "-") },
  periodSegments: { [period]: [{ scenarioName: "同じ名前", segment: subject ?? "" }] },
  metricValues: { deliveryCount: { [period]: count }, clickRate: { [period]: 0.25 } },
});

test("comparison takes the union of subjects, including after-only subjects without borrowing previous metrics", () => {
  const before = [row("旧件名", "2026/09/30", 100), row(null, "2026/09/30", 10), row("継続", "2026/09/30", 20)];
  const after = [row("新件名", "2026/10/01", 200), row("継続", "2026/10/01", 30), row("新件名", "2026/10/01", 40, "template")];
  const snapshot = JSON.stringify([before, after]);
  const merged = mergeMatrixSeries(before, after);
  assert.equal(merged.length, 5);
  assert.deepEqual(merged.find((entry) => entry.subject === "旧件名").metricValues.deliveryCount, { "2026/09/30": 100 });
  assert.deepEqual(merged.find((entry) => entry.subject === "新件名" && entry.type === "scenario").metricValues.deliveryCount, { "2026/10/01": 200 });
  const retained = merged.find((entry) => entry.subject === "継続");
  assert.deepEqual(retained.metricValues.deliveryCount, { "2026/09/30": 20, "2026/10/01": 30 });
  assert.equal(retained.latestSegment.date, "2026-10-01");
  assert.equal(JSON.stringify([before, after]), snapshot);
  assert.deepEqual(mergeMatrixSeries(undefined, after), after);
  assert.deepEqual(mergeMatrixSeries(before, undefined), before);
});

test("series and chart identities distinguish types, subjects and punctuation", () => {
  const variants = [row("a.b[0]__clickRate", "2026/10/01", 1), row("別件名", "2026/10/01", 2),
    row(null, "2026/10/01", 3), row("別件名", "2026/10/01", 4, "template")];
  assert.equal(new Set(variants.map(matrixSeriesId)).size, 4);
  const keys = variants.flatMap((entry) => ["clickRate", "deliveryCount"].map((metric) => matrixMetricKey(entry, metric)));
  assert.equal(new Set(keys).size, 8);
  assert.ok(keys.every((key) => !/[.[\]]/.test(key)));
  assert.ok(matrixSeriesLabel(variants[0]).includes("a.b[0]__clickRate"));
  assert.ok(matrixSeriesLabel(variants[2]).includes("件名未取得"));
});
