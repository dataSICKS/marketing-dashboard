import { createClient } from "@supabase/supabase-js";
import type { LtvRow } from "./ltv-types.js";
import { logger } from "./logger.js";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function upsertLtvRows(rows: LtvRow[], syncedAt: string): Promise<void> {
  const supabase = getSupabaseClient();

  // 同一 定期購入番号 の重複を除去（シート側に重複行があっても二重計上しない・後勝ち）
  const seen = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    seen.set(r.subsOrderCode, {
      subs_order_code: r.subsOrderCode,
      customer_code: r.customerCode,
      first_order_month: r.firstOrderMonth,
      first_product: r.firstProduct,
      ad_group_name: r.adGroupName,
      subs_status: r.subsStatus,
      product_2: r.product2,
      product_3: r.product3,
      product_4: r.product4,
      ltv95: r.ltv95,
      ltv180: r.ltv180,
      ltv365: r.ltv365,
      selling_url: r.sellingUrl,
      offer_name: r.offerName,
      synced_at: syncedAt,
    });
  }
  const records = Array.from(seen.values());
  logger.info({ original: rows.length, deduplicated: records.length }, "Deduplicated LTV rows");

  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from("ltv_subscriptions")
      .upsert(batch, { onConflict: "subs_order_code", ignoreDuplicates: false });
    if (error) {
      logger.error({ error }, "Supabase LTV upsert failed");
      throw new Error(`Supabase upsert失敗: ${error.message}`);
    }
  }

  logger.info({ rowCount: records.length }, "Upserted LTV rows to Supabase");
}

export async function fetchLtvFromSupabase(): Promise<{ rows: LtvRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;
  const allData: Record<string, unknown>[] = [];
  let from = 0;

  // Supabaseのデフォルト上限は1000行なので全件取得するまでページネーション
  while (true) {
    const { data, error } = await supabase
      .from("ltv_subscriptions")
      .select("*")
      .order("subs_order_code", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      logger.error({ error }, "Supabase LTV fetch failed");
      throw new Error(`Supabase fetch失敗: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    allData.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (allData.length === 0) return { rows: [], syncedAt: null };

  const rows: LtvRow[] = allData.map((r) => ({
    subsOrderCode: String(r.subs_order_code ?? ""),
    customerCode: String(r.customer_code ?? ""),
    firstOrderMonth: r.first_order_month ? String(r.first_order_month).slice(0, 10) : null,
    firstProduct: String(r.first_product ?? ""),
    adGroupName: String(r.ad_group_name ?? ""),
    subsStatus: String(r.subs_status ?? ""),
    product2: String(r.product_2 ?? ""),
    product3: String(r.product_3 ?? ""),
    product4: String(r.product_4 ?? ""),
    ltv95: Number(r.ltv95 ?? 0),
    ltv180: Number(r.ltv180 ?? 0),
    ltv365: Number(r.ltv365 ?? 0),
    sellingUrl: String(r.selling_url ?? ""),
    offerName: String(r.offer_name ?? ""),
  }));

  return { rows, syncedAt: (allData[0]?.synced_at as string) ?? null };
}
