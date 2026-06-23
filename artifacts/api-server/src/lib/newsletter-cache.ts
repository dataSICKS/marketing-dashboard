import type { NewsletterRow } from "./newsletter-types.js";

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
