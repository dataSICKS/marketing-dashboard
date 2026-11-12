import assert from "node:assert/strict";
import test from "node:test";
import { groupLtvTableRows, pivotLtvTable } from "./ltv-table.ts";

const row = (label, segment, count = 10) => ({
  label, segment, count, ltv95: 1111, ltv180: 2222, ltv365: 3333,
});

test("product blocks keep months together, sort chronologically and preserve API metrics", () => {
  const items = [row("2026/02", "商品B", 20), row("2026/02", "商品A", 5), row("2026/01", "商品B", 10)];
  const before = JSON.stringify(items);
  const blocks = groupLtvTableRows(items);
  assert.deepEqual(blocks.map((b) => b.segment), ["商品A", "商品B"]);
  assert.deepEqual(blocks[1].rows.map((r) => r.label), ["2026/01", "2026/02"]);
  assert.equal(blocks.flatMap((b) => b.rows).length, items.length);
  assert.deepEqual(blocks[1].rows[1], items[0]);
  assert.equal(JSON.stringify(items), before);
});

test("opt-out groups remain separate, including when their months differ", () => {
  const blocks = groupLtvTableRows([
    row("2026/02", "オプトアウトあり"), row("2026/01", "オプトアウトなし"),
    row("2026/01", "オプトアウトあり"),
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks.find((b) => b.segment === "オプトアウトあり").rows.length, 2);
  assert.equal(blocks.find((b) => b.segment === "オプトアウトなし").rows.length, 1);
});

test("overall and missing-value blocks are preserved without inventing rows", () => {
  assert.deepEqual(groupLtvTableRows([]), []);
  assert.equal(groupLtvTableRows([row("2026/01", "全体")]).length, 1);
  assert.deepEqual(groupLtvTableRows([row("2026/01", "未設定")])[0].rows, [row("2026/01", "未設定")]);
});

test("pivot uses periods as columns and metrics as rows with aligned missing values", () => {
  const result = pivotLtvTable([
    row("2026/02", "商品A", 0), row("2026/01", "商品B", 7),
    row("2026/01", "商品A", 5),
  ]);
  assert.deepEqual(result.periods, ["2026/01", "2026/02"]);
  const a = result.blocks.find((block) => block.segment === "商品A");
  assert.deepEqual(a.metrics.map((metric) => metric.label), ["件数", "LTV95", "LTV180", "LTV365"]);
  assert.deepEqual(a.metrics[0].values, [5, 0]);
  assert.deepEqual(a.metrics[1].values, [1111, 1111]);
  const b = result.blocks.find((block) => block.segment === "商品B");
  assert.deepEqual(b.metrics[0].values, [7, null]);
  assert.deepEqual(b.metrics[3].values, [3333, null]);
});

test("pivot supports opt-out blocks, overall, and empty results", () => {
  const result = pivotLtvTable([
    row("2026/01", "オプトアウトあり", 1), row("2026/01", "オプトアウトなし", 2),
  ]);
  assert.equal(result.blocks.length, 2);
  assert.ok(result.blocks.every((block) => block.metrics.length === 4));
  assert.equal(pivotLtvTable([row("2026/01", "全体")]).blocks.length, 1);
  assert.deepEqual(pivotLtvTable([]), { periods: [], blocks: [] });
});
