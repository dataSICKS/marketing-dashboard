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
): { chartData: ClarityChartRow[]; pageViews: Partial<Record<string, number>> } {
  // 「合計」は左右比較と同じく両デバイスを表示する。表示切替で
  // 分母を合算したり、片方のPV欠損で正常なデバイスの線を消したりしない。
  const rows = new Map<string, ClarityChartRow>();
  const pageViews: Partial<Record<string, number>> = {};
  const devices: ClarityDevice[] = device === "合計" ? ["Desktop", "Mobile"] : [device];

  for (const [segment, points, pv] of [
    ["A", pointsA, pageViewsA],
    ["B", pointsB, pageViewsB],
  ] as const) {
    for (const selectedDevice of devices) {
      if (pv[selectedDevice] != null) pageViews[`${segment} ${selectedDevice}`] = pv[selectedDevice];
    }
    for (const row of buildClarityChartData(points, pv)) {
      const depth = String(row.depth);
      const merged = rows.get(depth) ?? { depth };
      for (const selectedDevice of devices) {
        const key = `${segment} ${selectedDevice}`;
        merged[key] = row[selectedDevice];
        merged[`${key}Visitors`] = row[`${selectedDevice}Visitors`];
      }
      rows.set(depth, merged);
    }
  }
  const chartData = [...rows.values()]
    .sort((a, b) => parseFloat(String(a.depth)) - parseFloat(String(b.depth)))
    .map((row) => {
      for (const segment of ["A", "B"]) {
        for (const selectedDevice of devices) {
          const key = `${segment} ${selectedDevice}`;
          row[key] ??= null;
          row[`${key}Visitors`] ??= null;
        }
      }
      return row;
    });
  return { chartData, pageViews };
}
