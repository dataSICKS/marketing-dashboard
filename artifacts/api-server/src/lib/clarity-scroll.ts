export type ClarityDevice = "Desktop" | "Mobile";

export interface ClarityScrollPoint {
  depth: number;
  desktop: number | null;
  mobile: number | null;
}

export interface ClarityScrollExport {
  device: string;
  pageViews: number | null;
  points: { depth: number; visitors: number }[];
  emptyExport?: boolean;
}

export function isEmptyClarityExport(entry: ClarityScrollExport): boolean {
  return entry.emptyExport === true && entry.pageViews == null && entry.points.length === 0;
}

export function parseClarityCsv(text: string): {
  pageViews: number | null;
  points: { depth: number; visitors: number }[];
  emptyExport?: boolean;
} {
  const lines = text.split("\n");
  let pageViews: number | null = null;
  let dataStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("ページ ビュー")) {
      const match = line.match(/"ページ ビュー","(\d+)"/);
      if (match) pageViews = parseInt(match[1], 10);
    }
    if (line.includes("スクロールの奥行き")) {
      dataStart = i + 1;
      break;
    }
  }

  if (dataStart === -1) return { pageViews, points: [] };

  const points: { depth: number; visitors: number }[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Clarity CSV rows are "depth","visitors","drop-off rate".
    const match = line.match(/^"(\d+)","(\d+)"/);
    if (!match) continue;
    points.push({ depth: parseInt(match[1], 10), visitors: parseInt(match[2], 10) });
  }

  // Only a recognized, explicitly blank PV header and an empty scroll body
  // count as an empty export. Malformed/unreadable rows must not bypass safety.
  if (pageViews == null &&
      lines.some((line) => /^"ページ ビュー",""\s*$/.test(line.trim())) &&
      lines.slice(dataStart).every((line) => !line.trim())) {
    return { pageViews, points, emptyExport: true };
  }
  return { pageViews, points };
}

export function aggregateClarityScrollDays(
  allDayData: readonly (readonly ClarityScrollExport[])[],
): {
  points: ClarityScrollPoint[];
  pageViews: Partial<Record<ClarityDevice, number>>;
} {
  const depthMap = new Map<number, { desktop: number; mobile: number }>();
  const pageViewTotals: Record<ClarityDevice, number> = { Desktop: 0, Mobile: 0 };
  const pageViewAvailable: Record<ClarityDevice, boolean> = { Desktop: true, Mobile: true };
  const hasDeviceData: Record<ClarityDevice, boolean> = { Desktop: false, Mobile: false };
  const hasReadablePV: Record<ClarityDevice, boolean> = { Desktop: false, Mobile: false };

  for (const dayData of allDayData) {
    for (const entry of dayData) {
      const { device, pageViews, points } = entry;
      if (device === "Desktop" || device === "Mobile") {
        hasDeviceData[device] = true;
        // A header-only export contributes neither PV nor visitor counts.
        // The API reports it as excluded; never treat it as an observed zero.
        if (pageViews == null && !isEmptyClarityExport(entry)) pageViewAvailable[device] = false;
        else if (pageViews != null) {
          hasReadablePV[device] = true;
          pageViewTotals[device] += pageViews;
        }
      }
      for (const { depth, visitors } of points) {
        const existing = depthMap.get(depth) ?? { desktop: 0, mobile: 0 };
        if (device === "Desktop") existing.desktop += visitors;
        if (device === "Mobile") existing.mobile += visitors;
        depthMap.set(depth, existing);
      }
    }
  }

  const points = Array.from(depthMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([depth, { desktop, mobile }]) => ({
      depth,
      desktop: desktop > 0 ? desktop : null,
      mobile: mobile > 0 ? mobile : null,
    }));

  const pageViews: Partial<Record<ClarityDevice, number>> = {};
  for (const device of ["Desktop", "Mobile"] as const) {
    if (hasReadablePV[device] && pageViewAvailable[device]) {
      pageViews[device] = pageViewTotals[device];
    } else if (!hasDeviceData[device] && (hasReadablePV.Desktop || hasReadablePV.Mobile)) {
      // No exports means zero contribution, not a missing PV denominator.
      // Exports with unreadable PVs still omit the key to block incomplete rates.
      pageViews[device] = 0;
    }
  }

  return { points, pageViews };
}
