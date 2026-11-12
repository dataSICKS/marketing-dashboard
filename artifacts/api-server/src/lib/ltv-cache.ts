import type { LtvRow } from "./ltv-types.js";

interface LtvCacheEntry {
  rows: LtvRow[];
  syncedAt: string;
}

let cache: LtvCacheEntry | null = null;

export function getLtvCache(): LtvCacheEntry | null {
  return cache;
}

export function setLtvCache(rows: LtvRow[], syncedAt: string): void {
  cache = { rows, syncedAt };
}
