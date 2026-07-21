import { createClient } from "@supabase/supabase-js";
import type { NewsletterRow } from "./newsletter-types.js";
import { logger } from "./logger.js";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function upsertRows(rows: NewsletterRow[], syncedAt: string): Promise<void> {
  const supabase = getSupabaseClient();

  const allRecords = rows.map((r) => ({
    delivery_year_month: r.deliveryYearMonth,
    delivery_week: r.deliveryWeek,
    delivery_date: r.deliveryDate,
    scenario_name: r.scenarioName,
    segment: r.segment,
    delivery_method: r.deliveryMethod,
    template_name: r.templateName,
    subject: r.subject,
    delivery_count: r.deliveryCount,
    open_count: r.openCount,
    click_count: r.clickCount,
    cv_count: r.cvCount,
    synced_at: syncedAt,
  }));

  // 同一ユニークキーの重複を除去（後勝ち）
  const seen = new Map<string, typeof allRecords[0]>();
  for (const record of allRecords) {
    const key = `${record.delivery_date}|${record.scenario_name}|${record.segment}|${record.template_name}`;
    seen.set(key, record);
  }
  const records = Array.from(seen.values());
  logger.info({ original: rows.length, deduplicated: records.length }, "Deduplicated rows");

  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from("newsletter_rows")
      .upsert(batch, {
        onConflict: "delivery_date,scenario_name,segment,template_name",
        ignoreDuplicates: false,
      });
    if (error) {
      logger.error({ error }, "Supabase upsert failed");
      throw new Error(`Supabase upsert失敗: ${error.message}`);
    }
  }

  logger.info({ rowCount: records.length }, "Upserted rows to Supabase");
}

export async function fetchRowsFromSupabase(): Promise<{ rows: NewsletterRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();
  const PAGE = 1000;
  const allData: Record<string, unknown>[] = [];
  let from = 0;

  // Supabaseのデフォルト上限は1000行なので、全件取得するまでページネーション
  while (true) {
    const { data, error } = await supabase
      .from("newsletter_rows")
      .select("*")
      .order("delivery_date", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      logger.error({ error }, "Supabase fetch failed");
      throw new Error(`Supabase fetch失敗: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    allData.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (allData.length === 0) {
    return { rows: [], syncedAt: null };
  }

  const rows: NewsletterRow[] = allData.map((r) => ({
    deliveryYearMonth: (r.delivery_year_month as string) ?? "",
    deliveryWeek: (r.delivery_week as string) ?? "",
    deliveryDate: (r.delivery_date as string) ?? "",
    scenarioName: (r.scenario_name as string) ?? "",
    segment: (r.segment as string) ?? "",
    deliveryMethod: (r.delivery_method as string) ?? "",
    templateName: (r.template_name as string) ?? "",
    subject: (r.subject as string) ?? "",
    deliveryCount: (r.delivery_count as number) ?? 0,
    openCount: (r.open_count as number) ?? 0,
    clickCount: (r.click_count as number) ?? 0,
    cvCount: (r.cv_count as number) ?? 0,
  }));

  const syncedAt: string | null = (allData[0]?.synced_at as string) ?? null;

  return { rows, syncedAt };
}
