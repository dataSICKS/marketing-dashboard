import { createClient } from "@supabase/supabase-js";
import type { NewsletterRow } from "./newsletter-types.js";
import { logger } from "./logger.js";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL または SUPABASE_ANON_KEY が設定されていません");
  }
  return createClient(url, key);
}

export async function upsertRows(rows: NewsletterRow[], syncedAt: string): Promise<void> {
  const supabase = getSupabaseClient();

  const records = rows.map((r) => ({
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

  logger.info({ rowCount: rows.length }, "Upserted rows to Supabase");
}

export async function fetchRowsFromSupabase(): Promise<{ rows: NewsletterRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("newsletter_rows")
    .select("*")
    .order("delivery_date", { ascending: true });

  if (error) {
    logger.error({ error }, "Supabase fetch failed");
    throw new Error(`Supabase fetch失敗: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { rows: [], syncedAt: null };
  }

  const rows: NewsletterRow[] = data.map((r) => ({
    deliveryYearMonth: r.delivery_year_month ?? "",
    deliveryWeek: r.delivery_week ?? "",
    deliveryDate: r.delivery_date ?? "",
    scenarioName: r.scenario_name ?? "",
    segment: r.segment ?? "",
    deliveryMethod: r.delivery_method ?? "",
    templateName: r.template_name ?? "",
    subject: r.subject ?? "",
    deliveryCount: r.delivery_count ?? 0,
    openCount: r.open_count ?? 0,
    clickCount: r.click_count ?? 0,
    cvCount: r.cv_count ?? 0,
  }));

  const syncedAt: string | null = data[0]?.synced_at ?? null;

  return { rows, syncedAt };
}
