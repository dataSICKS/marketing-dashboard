import assert from "node:assert/strict";
import test from "node:test";
import { classifyDeliveryRow } from "./ma-deliveries-row.ts";

const row = (overrides = {}) => ({
  customer_code: "001", delivery_date: "2026-11-04", delivery_status: "完了", delivery_method: "メール",
  template_name: "T", node_id: "n1", scenario_name: "S", ...overrides,
});

test("only completed email deliveries count as received", () => {
  assert.equal(classifyDeliveryRow(row()).kind, "delivered");
  for (const status of ["配信不可", "スキップ", "", "完了済み"]) {
    assert.equal(classifyDeliveryRow(row({ delivery_status: status })).kind, "excluded", `status=${status}`);
  }
  // CSV由来の前後の空白は取り除く。表記ゆれで届いた1通を落とさないため。
  assert.equal(classifyDeliveryRow(row({ delivery_status: " 完了 ", delivery_method: "メール " })).kind, "delivered");
  // LINEは別チャネル。メルマガの受信通数に混ぜない。
  assert.equal(classifyDeliveryRow(row({ delivery_method: "LINE" })).kind, "excluded");
});

test("rows that cannot be attributed to a customer and a day are invalid, not silently delivered", () => {
  assert.equal(classifyDeliveryRow(row({ customer_code: "" })).kind, "invalid");
  assert.equal(classifyDeliveryRow(row({ customer_code: null })).kind, "invalid");
  assert.equal(classifyDeliveryRow(row({ delivery_date: "" })).kind, "invalid");
  assert.equal(classifyDeliveryRow(row({ delivery_date: "2026/11/04" })).kind, "invalid");
});

test("leading zeroes survive and a timestamp is truncated to its calendar day", () => {
  const outcome = classifyDeliveryRow(row({ customer_code: "007", delivery_date: "2026-11-04T09:21:00+09:00" }));
  assert.equal(outcome.kind, "delivered");
  assert.equal(outcome.event.customerCode, "007");
  assert.equal(outcome.event.date, "2026-11-04");
});

test("missing optional labels become empty strings rather than the string null", () => {
  const outcome = classifyDeliveryRow(row({ template_name: null, scenario_name: undefined, node_id: " n2 " }));
  assert.equal(outcome.kind, "delivered");
  assert.equal(outcome.event.templateName, "");
  assert.equal(outcome.event.scenarioName, "");
  assert.equal(outcome.event.nodeId, "n2");
});
