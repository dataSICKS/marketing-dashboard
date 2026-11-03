import assert from "node:assert/strict";
import test from "node:test";
import { matrixSeriesId, matrixSeriesLabel, matrixMetricKey, mergeMatrixSeries, matrixDimensionColumns, matrixIdentityWidth } from "./newsletter-matrix.ts";

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

test("selected table dimensions keep their own columns, sticky offsets and a total-only fallback", () => {
  const names = ["scenario", "subject", "template"];
  for (let mask = 0; mask < 8; mask++) {
    const dimensions = names.filter((_, i) => mask & (1 << i));
    const columns = matrixDimensionColumns(dimensions);
    assert.deepEqual(columns.map((column) => column.key), dimensions.length ? dimensions : ["total"]);
    let left = 0;
    for (const column of columns) {
      assert.equal(column.left, left);
      left += column.width;
    }
    assert.equal(matrixIdentityWidth(dimensions), left);
  }
});

test("regrouped comparison identities and chart labels use only selected dimensions", () => {
  const before = { ...row(null, "2026/09/30", 100), groupKey: '[["scenario","シナリオA"]]', dimensionValues: { scenario: "シナリオA" } };
  const after = { ...row(null, "2026/10/01", 200), key: "別表示名", groupKey: before.groupKey, dimensionValues: { scenario: "シナリオA" } };
  const different = { ...after, groupKey: '[["scenario","シナリオB"]]', dimensionValues: { scenario: "シナリオB" } };
  const merged = mergeMatrixSeries([before], [after, different]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].metricValues.deliveryCount, { "2026/09/30": 100, "2026/10/01": 200 });
  assert.equal(matrixSeriesLabel(before), "シナリオ: シナリオA");
  assert.equal(matrixSeriesLabel({ ...before, groupKey: "[]", dimensionValues: {} }), "合計");
  assert.notEqual(matrixMetricKey(before, "deliveryCount"), matrixMetricKey(different, "deliveryCount"));
});
