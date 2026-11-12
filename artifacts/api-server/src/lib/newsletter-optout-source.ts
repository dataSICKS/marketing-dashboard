import type { OptoutRow } from "./newsletter-types.js";
import { getOptoutCache, setOptoutCache } from "./newsletter-cache.js";
import { fetchOptoutsFromSupabase, upsertOptoutRows } from "./newsletter-optout-supabase.js";
import { fetchOptoutSheet } from "./newsletter-optout-sheets.js";
import { logger } from "./logger.js";

/**
 * オプトアウト行の取得口。キャッシュ → Supabase → スプレッドシート の順にフォールバックする。
 * メルマガ分析とLTV分析の両方から使うので、ルートではなく lib に置く。
 */
export async function loadOptoutRows(): Promise<{ rows: OptoutRow[]; syncedAt: string | null }> {
  let cached = getOptoutCache();
  if (!cached) {
    const { rows: supabaseRows, syncedAt: supabaseSyncedAt } = await fetchOptoutsFromSupabase();
    if (supabaseRows.length > 0 && supabaseSyncedAt) {
      setOptoutCache(supabaseRows, supabaseSyncedAt);
      cached = { rows: supabaseRows, syncedAt: supabaseSyncedAt };
    } else {
      logger.info("Opt-out table empty, fetching from Google Sheets");
      const rows = await fetchOptoutSheet();
      const syncedAt = new Date().toISOString();
      if (rows.length > 0) await upsertOptoutRows(rows, syncedAt);
      setOptoutCache(rows, syncedAt);
      cached = { rows, syncedAt };
    }
  }
  return cached;
}

/** オプトアウトした顧客番号の集合。同じ顧客が複数回オフにしていても1件として扱う。 */
export async function loadOptoutCustomerCodes(): Promise<Set<string>> {
  const { rows } = await loadOptoutRows();
  const set = new Set<string>();
  for (const row of rows) {
    const code = row.customerCode.trim();
    if (code) set.add(code);
  }
  return set;
}
