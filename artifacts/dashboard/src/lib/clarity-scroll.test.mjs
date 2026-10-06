import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClarityChartData,
  buildClarityOverlayChartData,
  getPageViewsForDevice,
  getReachRate,
} from "./clarity-scroll.ts";

test("uses each device's own PV denominator and gives a valid 0% point 100% reach", () => {
  const chart = buildClarityChartData(
    [
      { depth: 0, desktop: 100, mobile: 400 },
      { depth: 50, desktop: 25, mobile: 100 },
    ],
    { Desktop: 100, Mobile: 400 },
  );

  assert.equal(chart.filter((row) => row.depth === "0%").length, 1);
  assert.deepEqual(chart[0], {
    depth: "0%",
    Desktop: 100,
    DesktopVisitors: 100,
    Mobile: 100,
    MobileVisitors: 400,
  });
  assert.deepEqual(chart[1], {
    depth: "50%",
    Desktop: 25,
    DesktopVisitors: 25,
    Mobile: 25,
    MobileVisitors: 100,
  });
});

test("returns no rate when PV is zero or unavailable", () => {
  assert.equal(getReachRate(0, 0), null);
  assert.equal(getReachRate(20, undefined), null);
  assert.equal(getPageViewsForDevice({ Desktop: 10 }, "合計"), undefined);

  const chart = buildClarityChartData(
    [{ depth: 50, desktop: 0, mobile: null }],
    { Desktop: 0 },
  );
  assert.equal(chart.some((row) => row.depth === "0%"), false);
  assert.equal(chart[0].Desktop, null);
});

test("combines device PV and visitors for total A/B overlay without mixing denominators", () => {
  assert.equal(getPageViewsForDevice({ Desktop: 100, Mobile: 300 }, "合計"), 400);

  const { chartData, pageViews } = buildClarityOverlayChartData(
    [{ depth: 50, desktop: 20, mobile: 30 }],
    { Desktop: 100, Mobile: 300 },
    "合計",
    [{ depth: 50, desktop: 10, mobile: 90 }],
    { Desktop: 200, Mobile: 200 },
    "合計",
  );

  assert.deepEqual(pageViews, { A: 400, B: 400 });
  assert.deepEqual(chartData, [
    { depth: "0%", A: 100, AVisitors: 400, B: 100, BVisitors: 400 },
    { depth: "50%", A: 12.5, AVisitors: 50, B: 25, BVisitors: 100 },
  ]);
});

test("does not draw a rate for an A/B series without a positive complete denominator", () => {
  const { chartData, pageViews } = buildClarityOverlayChartData(
    [{ depth: 50, desktop: 10, mobile: 5 }],
    { Desktop: 100, Mobile: 0 },
    "合計",
    [{ depth: 50, desktop: 20, mobile: null }],
    { Desktop: 200 },
    "合計",
  );

  assert.deepEqual(pageViews, { A: 100 });
  assert.deepEqual(chartData, [
    { depth: "0%", A: 100, AVisitors: 100, B: null, BVisitors: null },
    { depth: "50%", A: 15, AVisitors: 15, B: null, BVisitors: 20 },
  ]);
});

test("keeps the test-pattern line when A and B use different devices", () => {
  const { chartData, pageViews } = buildClarityOverlayChartData(
    [{ depth: 50, desktop: 20, mobile: null }],
    { Desktop: 100, Mobile: 0 },
    "Desktop",
    [{ depth: 50, desktop: null, mobile: 30 }],
    { Mobile: 150 },
    "Mobile",
  );

  assert.deepEqual(pageViews, { A: 100, B: 150 });
  assert.deepEqual(chartData, [
    { depth: "0%", A: 100, AVisitors: 100, B: 100, BVisitors: 150 },
    { depth: "50%", A: 20, AVisitors: 20, B: 20, BVisitors: 30 },
  ]);
});
