import assert from "node:assert/strict";
import test from "node:test";
import { aggregateClarityScrollDays, parseClarityCsv } from "./clarity-scroll.ts";

test("parses page views and scroll visitor counts from a Clarity CSV", () => {
  const csv = [
    '"ページ ビュー","240"',
    '"スクロールの奥行き","訪問者数","ドロップオフ率"',
    '"0","240","0"',
    '"50","120","50.0"',
  ].join("\n");

  assert.deepEqual(parseClarityCsv(csv), {
    pageViews: 240,
    points: [{ depth: 0, visitors: 240 }, { depth: 50, visitors: 120 }],
  });
});

test("sums PV and visitors by device over multiple days", () => {
  const { pageViews, points } = aggregateClarityScrollDays([
    [
      { device: "Desktop", pageViews: 100, points: [{ depth: 50, visitors: 40 }] },
      { device: "Mobile", pageViews: 200, points: [{ depth: 50, visitors: 100 }] },
    ],
    [
      { device: "Desktop", pageViews: 300, points: [{ depth: 50, visitors: 120 }] },
      { device: "Mobile", pageViews: 400, points: [{ depth: 50, visitors: 180 }] },
    ],
  ]);

  assert.deepEqual(pageViews, { Desktop: 400, Mobile: 600 });
  assert.deepEqual(points, [{ depth: 50, desktop: 160, mobile: 280 }]);
});

test("omits a device PV total if any matching export has no PV count", () => {
  const { pageViews, points } = aggregateClarityScrollDays([
    [{ device: "Mobile", pageViews: 200, points: [{ depth: 50, visitors: 80 }] }],
    [{ device: "Mobile", pageViews: null, points: [{ depth: 50, visitors: 20 }] }],
  ]);

  assert.deepEqual(pageViews, { Desktop: 0 });
  assert.deepEqual(points, [{ depth: 50, desktop: null, mobile: 100 }]);
});

test("keeps an available zero PV count instead of treating it as missing", () => {
  const { pageViews } = aggregateClarityScrollDays([
    [{ device: "Desktop", pageViews: 0, points: [] }],
  ]);

  assert.deepEqual(pageViews, { Desktop: 0, Mobile: 0 });
});

test("distinguishes no Desktop exports from exports missing PV in a mobile-only range", () => {
  const { pageViews, points } = aggregateClarityScrollDays([
    [{ device: "Mobile", pageViews: 150, points: [{ depth: 50, visitors: 30 }] }],
    [],
  ]);
  assert.deepEqual(pageViews, { Desktop: 0, Mobile: 150 });
  assert.deepEqual(points, [{ depth: 50, desktop: null, mobile: 30 }]);

  const incomplete = aggregateClarityScrollDays([
    [
      { device: "Desktop", pageViews: null, points: [{ depth: 50, visitors: 10 }] },
      { device: "Mobile", pageViews: 150, points: [{ depth: 50, visitors: 30 }] },
    ],
  ]);
  assert.deepEqual(incomplete.pageViews, { Mobile: 150 });
});

test("keeps an empty range empty instead of fabricating device PV", () => {
  assert.deepEqual(aggregateClarityScrollDays([[], []]), { points: [], pageViews: {} });
});
