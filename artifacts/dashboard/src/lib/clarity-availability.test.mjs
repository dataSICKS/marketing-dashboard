import test from "node:test";
import assert from "node:assert/strict";
import { resolveClarityDate } from "./clarity-availability.ts";

test("latest date is per code, not the globally newest date", () => {
  assert.equal(resolveClarityDate({ availableDates: ["2026-10-23", "2026-10-20"] }, null), "2026-10-23");
  assert.equal(resolveClarityDate({ availableDates: [] }, null), "");
  assert.equal(resolveClarityDate(undefined, null), "");
});

test("explicit ranges never use historical exports outside that range", () => {
  const coverage = { availableDates: ["2026-10-26", "2026-10-23", "2026-10-20"] };
  assert.equal(resolveClarityDate(coverage, { from: "2026/10/24", to: "2026/10/25" }), "");
  assert.equal(resolveClarityDate(coverage, { from: "2026/10/20", to: "2026/10/23" }), "2026-10-23");
});
