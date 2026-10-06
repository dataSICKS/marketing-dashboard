export type ClarityDeviceTab = "合計" | "Desktop" | "Mobile";
export type ClarityDevice = Exclude<ClarityDeviceTab, "合計">;
export type ClarityPageViews = Partial<Record<ClarityDevice, number>>;
export type ClarityPoint = {
  depth: number;
  desktop: number | null;
  mobile: number | null;
};
export type ClarityChartRow = Record<string, string | number | null>;

export function getPageViewsForDevice(
  pageViews: Partial<Record<string, number>>,
  device: ClarityDeviceTab,
): number | undefined {
  if (device === "Desktop") return pageViews.Desktop;
  if (device === "Mobile") return pageViews.Mobile;
  const desktop = pageViews.Desktop;
  const mobile = pageViews.Mobile;
  return desktop != null && mobile != null ? desktop + mobile : undefined;
}

export function getReachRate(
  visitors: number | null | undefined,
  pageViews: number | undefined,
): number | null {
  return visitors != null && pageViews != null && pageViews > 0
    ? (visitors / pageViews) * 100
    : null;
}

export function buildClarityChartData(
  points: readonly ClarityPoint[],
  pageViews: ClarityPageViews,
): ClarityChartRow[] {
  const depths = new Set(points.map((point) => point.depth));
  if ((pageViews.Desktop ?? 0) > 0 || (pageViews.Mobile ?? 0) > 0) depths.add(0);

  return Array.from(depths)
    .sort((a, b) => a - b)
    .map((depth) => {
      const point = points.find((item) => item.depth === depth);
      const row: ClarityChartRow = { depth: `${depth}%` };
      for (const key of ["Desktop", "Mobile"] as const) {
        const pv = pageViews[key];
        const visitors = depth === 0
          ? (pv != null && pv > 0 ? pv : null)
          : point?.[key.toLowerCase() as "desktop" | "mobile"] ?? null;
        row[key] = getReachRate(visitors, pv);
        row[`${key}Visitors`] = visitors;
      }
      return row;
    });
}

export function buildClarityOverlayChartData(
  pointsA: readonly ClarityPoint[],
  pageViewsA: ClarityPageViews,
  pointsB: readonly ClarityPoint[],
  pageViewsB: ClarityPageViews,
  device: ClarityDeviceTab,
): { chartData: ClarityChartRow[]; pageViews: Partial<Record<"A" | "B", number>> } {
  const pvA = getPageViewsForDevice(pageViewsA, device);
  const pvB = getPageViewsForDevice(pageViewsB, device);
  const depths = new Set([...pointsA.map((point) => point.depth), ...pointsB.map((point) => point.depth)]);
  if ((pvA ?? 0) > 0 || (pvB ?? 0) > 0) depths.add(0);

  const getVisitors = (points: readonly ClarityPoint[], depth: number): number | null => {
    const point = points.find((item) => item.depth === depth);
    if (!point) return null;
    if (device === "Desktop") return point.desktop ?? null;
    if (device === "Mobile") return point.mobile ?? null;
    const total = (point.desktop ?? 0) + (point.mobile ?? 0);
    return total > 0 ? total : null;
  };

  const chartData = Array.from(depths)
    .sort((a, b) => a - b)
    .map((depth) => {
      const visitorsA = depth === 0 ? (pvA != null && pvA > 0 ? pvA : null) : getVisitors(pointsA, depth);
      const visitorsB = depth === 0 ? (pvB != null && pvB > 0 ? pvB : null) : getVisitors(pointsB, depth);
      return {
        depth: `${depth}%`,
        A: getReachRate(visitorsA, pvA),
        AVisitors: visitorsA,
        B: getReachRate(visitorsB, pvB),
        BVisitors: visitorsB,
      };
    });

  const pageViews: Partial<Record<"A" | "B", number>> = {};
  if (pvA != null) pageViews.A = pvA;
  if (pvB != null) pageViews.B = pvB;
  return { chartData, pageViews };
}
