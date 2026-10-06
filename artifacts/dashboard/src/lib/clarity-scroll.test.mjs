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

test("total overlay preserves the separate device rates from split view", () => {
  assert.equal(getPageViewsForDevice({ Desktop: 100, Mobile: 300 }, "合計"), 400);

  const { chartData, pageViews } = buildClarityOverlayChartData(
    [{ depth: 50, desktop: 20, mobile: 30 }],
    { Desktop: 100, Mobile: 300 },
    [{ depth: 50, desktop: 10, mobile: 90 }],
    { Desktop: 200, Mobile: 200 },
    "合計",
  );

  assert.deepEqual(pageViews, { "A Desktop": 100, "A Mobile": 300, "B Desktop": 200, "B Mobile": 200 });
  assert.equal(chartData[1]["A Desktop"], 20);
  assert.equal(chartData[1]["A Mobile"], 10);
  assert.equal(chartData[1]["B Desktop"], 5);
  assert.equal(chartData[1]["B Mobile"], 45);
  for (const key of Object.keys(pageViews)) assert.equal(chartData[0][key], 100);
});

test("one missing device denominator does not erase another device's valid line", () => {
  const { chartData, pageViews } = buildClarityOverlayChartData(
    [{ depth: 50, desktop: 10, mobile: 5 }],
    { Desktop: 100, Mobile: 0 },
    [{ depth: 50, desktop: 20, mobile: null }],
    { Desktop: 200 },
    "合計",
  );

  assert.deepEqual(pageViews, { "A Desktop": 100, "A Mobile": 0, "B Desktop": 200 });
  assert.equal(chartData[1]["A Desktop"], 10);
  assert.equal(chartData[1]["A Mobile"], null);
  assert.equal(chartData[1]["B Desktop"], 10);
  assert.equal(chartData[1]["B Mobile"], null);
});

test("keeps a mobile-only test-pattern line in total overlay when Desktop has no exports", () => {
  const { chartData, pageViews } = buildClarityOverlayChartData(
    [{ depth: 50, desktop: 20, mobile: null }],
    { Desktop: 100, Mobile: 0 },
    [{ depth: 50, desktop: null, mobile: 30 }],
    { Desktop: 0, Mobile: 150 },
    "合計",
  );

  assert.deepEqual(pageViews, { "A Desktop": 100, "A Mobile": 0, "B Desktop": 0, "B Mobile": 150 });
  assert.equal(chartData[1]["A Desktop"], 20);
  assert.equal(chartData[1]["B Mobile"], 20);
});

test("screenshot regression: A Desktop PV 22 remains visible when A Mobile PV is missing", () => {
  const pointsA = [{ depth: 50, desktop: 10, mobile: 2000 }];
  const pointsB = [{ depth: 50, desktop: 18, mobile: 2369 }];
  const pvA = { Desktop: 22 };
  const pvB = { Desktop: 22, Mobile: 4738 };
  const { chartData, pageViews } = buildClarityOverlayChartData(pointsA, pvA, pointsB, pvB, "合計");
  const splitA = buildClarityChartData(pointsA, pvA);
  const splitB = buildClarityChartData(pointsB, pvB);
  for (let i = 0; i < chartData.length; i++) {
    for (const device of ["Desktop", "Mobile"]) {
      assert.equal(chartData[i][`A ${device}`], splitA[i][device]);
      assert.equal(chartData[i][`B ${device}`], splitB[i][device]);
      assert.equal(chartData[i][`A ${device}Visitors`], splitA[i][`${device}Visitors`]);
      assert.equal(chartData[i][`B ${device}Visitors`], splitB[i][`${device}Visitors`]);
    }
  }
  assert.equal(pageViews["A Desktop"], 22);
  assert.equal(pageViews["A Mobile"], undefined);
  assert.equal(pageViews["B Mobile"], 4738);
});

test("device tabs filter overlay series without changing their calculations", () => {
  for (const device of ["Desktop", "Mobile"]) {
    const { chartData, pageViews } = buildClarityOverlayChartData(
      [{ depth: 50, desktop: 10, mobile: 50 }], { Desktop: 20, Mobile: 200 },
      [{ depth: 75, desktop: 5, mobile: 20 }], { Desktop: 10, Mobile: 100 },
      device,
    );
    assert.deepEqual(Object.keys(pageViews), [`A ${device}`, `B ${device}`]);
    assert.equal(chartData[1][`A ${device}`], device === "Desktop" ? 50 : 25);
    assert.equal(chartData[1][`B ${device}`], null);
    assert.equal(chartData[2][`A ${device}`], null);
    assert.equal(chartData[2][`B ${device}`], device === "Desktop" ? 50 : 20);
  }
});
