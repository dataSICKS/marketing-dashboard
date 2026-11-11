import { createClient } from "@supabase/supabase-js";
import type { OptoutRow } from "./newsletter-types.js";
import { logger } from "./logger.js";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function upsertOptoutRows(rows: OptoutRow[], syncedAt: string): Promise<void> {
  const supabase = getSupabaseClient();

  // 同一 (日付, 顧客番号) の重複を除去（シート側に重複行があっても二重計上しない）
  const seen = new Map<string, { optout_date: string; customer_code: string; synced_at: string }>();
  for (const r of rows) {
    seen.set(`${r.optoutDate}|${r.customerCode}`, {
      optout_date: r.optoutDate,
      customer_code: r.customerCode,
      synced_at: syncedAt,
    });
  }
  const records = Array.from(seen.values());
  logger.info({ original: rows.length, deduplicated: records.length }, "Deduplicated opt-out rows");

  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from("newsletter_optouts")
      .upsert(batch, { onConflict: "optout_date,customer_code", ignoreDuplicates: false });
    if (error) {
      logger.error({ error }, "Supabase opt-out upsert failed");
      throw new Error(`Supabase upsert失敗: ${error.message}`);
    }
  }

  logger.info({ rowCount: records.length }, "Upserted opt-out rows to Supabase");
}

export async function fetchOptoutsFromSupabase(): Promise<{ rows: OptoutRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;
  const allData: Record<string, unknown>[] = [];
  let from = 0;

  // Supabaseのデフォルト上限は1000行なので全件取得するまでページネーション
  while (true) {
    const { data, error } = await supabase
      .from("newsletter_optouts")
      .select("*")
      .order("optout_date", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      logger.error({ error }, "Supabase opt-out fetch failed");
      throw new Error(`Supabase fetch失敗: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    allData.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (allData.length === 0) return { rows: [], syncedAt: null };

  const rows: OptoutRow[] = allData.map((r) => ({
    optoutDate: String(r.optout_date ?? "").slice(0, 10),
    customerCode: (r.customer_code as string) ?? "",
  }));

  return { rows, syncedAt: (allData[0]?.synced_at as string) ?? null };
}
