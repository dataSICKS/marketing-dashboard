import type { LtvRow } from "./ltv-types.js";
import type { LtvDataset } from "./ltv-sheets.js";

interface LtvCacheEntry {
  rows: LtvRow[];
  syncedAt: string;
}

/** データセット（fb / all）ごとに別のキャッシュを持つ。 */
const cache = new Map<LtvDataset, LtvCacheEntry>();

export function getLtvCache(dataset: LtvDataset): LtvCacheEntry | null {
  return cache.get(dataset) ?? null;
}

export function setLtvCache(dataset: LtvDataset, rows: LtvRow[], syncedAt: string): void {
  cache.set(dataset, { rows, syncedAt });
}
