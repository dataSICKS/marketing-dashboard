import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNewsletterDate } from "./newsletter-date.ts";

test("normalizes spreadsheet serial dates without a timezone shift", () => {
  assert.equal(normalizeNewsletterDate("46231"), "2026/07/28");
  assert.equal(normalizeNewsletterDate("46231.75"), "2026/07/28");
});

test("unifies ISO and slash dates including unpadded fields", () => {
  assert.equal(normalizeNewsletterDate("2026-07-28"), "2026/07/28");
  assert.equal(normalizeNewsletterDate("2026/7/8"), "2026/07/08");
});

test("rejects invalid dates rather than silently shifting calendar days", () => {
  for (const date of ["", "unknown", "2026/02/30", "999999"]) {
    assert.throws(() => normalizeNewsletterDate(date));
  }
});
