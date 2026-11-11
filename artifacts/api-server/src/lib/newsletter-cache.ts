import type { NewsletterRow, OptoutRow } from "./newsletter-types.js";

interface CacheEntry {
  rows: NewsletterRow[];
  syncedAt: string;
}

let cache: CacheEntry | null = null;

export function getCache(): CacheEntry | null {
  return cache;
}

export function setCache(rows: NewsletterRow[], syncedAt: string): void {
  cache = { rows, syncedAt };
}

interface OptoutCacheEntry {
  rows: OptoutRow[];
  syncedAt: string;
}

let optoutCache: OptoutCacheEntry | null = null;

export function getOptoutCache(): OptoutCacheEntry | null {
  return optoutCache;
}

export function setOptoutCache(rows: OptoutRow[], syncedAt: string): void {
  optoutCache = { rows, syncedAt };
}
