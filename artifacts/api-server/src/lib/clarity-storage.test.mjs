import test from "node:test";
import assert from "node:assert/strict";
import { listAllClarityFiles, parseClarityFilename, buildClarityCoverage } from "./clarity-storage.ts";
import { storedSettings } from "./settings-contract.ts";

test("paginate root/date listings beyond 200, preserving the last page", async () => {
  const source = Array.from({ length: 405 }, (_, i) => ({ name: String(i) }));
  const offsets = [];
  const result = await listAllClarityFiles(async (prefix, options) => {
    assert.equal(prefix, "2026-10-26");
    assert.equal(options.sortBy.column, "name");
    offsets.push(options.offset);
    return { data: source.slice(options.offset, options.offset + options.limit), error: null };
  }, "2026-10-26");
  assert.equal(result.length, 405);
  assert.deepEqual(offsets, [0, 200, 400]);
});

test("a later page failure rejects instead of yielding a partial list", async () => {
  await assert.rejects(listAllClarityFiles(async (_, { offset }) => offset
    ? { data: null, error: new Error("storage outage") }
    : { data: Array.from({ length: 200 }, () => ({ name: "file" })), error: null }, ""), /storage outage/);
});

test("filename identity distinguishes parent and child advertising codes", () => {
  const parent = "kisekino_haburashi_fb_inst_ad30";
  assert.equal(parseClarityFilename(`${parent}_child01_Mobile_scroll_yesterday.csv`).adCode, `${parent}_child01`);
  assert.notEqual(parseClarityFilename(`${parent}_child01_Mobile_scroll_yesterday.csv`).adCode, parent);
  assert.equal(parseClarityFilename(`${parent}_Desktop_scroll_2026-10-26.png`), null);
});

test("coverage includes registered zero-file codes, older exports and per-device counts", () => {
  const csv = (code, device, suffix = "yesterday") => ({ name: `${code}_${device}_scroll_${suffix}.csv` });
  const result = buildClarityCoverage([
    { date: "2026-10-26", files: [csv("active", "Mobile"), csv("not-registered", "Desktop")] },
    { date: "2026-10-23", files: [csv("older", "Mobile"), csv("older", "Mobile", "2026-10-23"), csv("older", "Desktop")] },
  ], ["active", "older", "never-collected"]);
  assert.equal(result.latestDate, "2026-10-26");
  assert.equal(result.adCodes.length, 3);
  assert.deepEqual(result.adCodes[1], { adCode: "older", availableDates: ["2026-10-23"], daysWithExports: 1, firstDate: "2026-10-23", lastDate: "2026-10-23", desktopDays: 1, mobileDays: 1 });
  assert.equal(result.adCodes[2].lastDate, null);
  assert.equal(result.adCodes[2].daysWithExports, 0);
  assert.equal(buildClarityCoverage([], ["configured"]).adCodes[0].daysWithExports, 0);
});

test("settings persistence mirrors the current codes for external legacy collectors", () => {
  assert.deepEqual(storedSettings({ adCodes: ["new"] }), { adCodes: ["new"], clarityTargetUrls: ["new"] });
  assert.deepEqual(storedSettings({ adCodes: [] }), { adCodes: [], clarityTargetUrls: [] });
});
