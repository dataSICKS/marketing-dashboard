import { createClient } from "@supabase/supabase-js";
import type { EfoAccessCvRow, EfoExitScenarioRow } from "./efo-types.js";
import { logger } from "./logger.js";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return createClient(url, key, { auth: { persistSession: false } });
}

const BATCH = 500;

export async function upsertEfoAccessCv(rows: EfoAccessCvRow[], syncedAt: string): Promise<void> {
  const supabase = getSupabaseClient();

  const seen = new Map<string, EfoAccessCvRow>();
  for (const r of rows) {
    const key = `${r.date}|${r.adCode}|${r.profileName}`;
    seen.set(key, r);
  }
  const records = Array.from(seen.values()).map((r) => ({
    date: r.date,
    ad_code: r.adCode,
    profile_name: r.profileName,
    access_count: r.accessCount,
    cv_count: r.cvCount,
    synced_at: syncedAt,
  }));

  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabase
      .from("efo_access_cv")
      .upsert(records.slice(i, i + BATCH), { onConflict: "date,ad_code,profile_name", ignoreDuplicates: false });
    if (error) {
      logger.error({ error }, "Supabase upsert efo_access_cv failed");
      throw new Error(`Supabase upsert失敗: ${error.message}`);
    }
  }
  logger.info({ rowCount: records.length }, "Upserted efo_access_cv to Supabase");
}

export async function upsertEfoExitScenarios(rows: EfoExitScenarioRow[], syncedAt: string): Promise<void> {
  const supabase = getSupabaseClient();

  const seen = new Map<string, EfoExitScenarioRow>();
  for (const r of rows) {
    const key = `${r.date}|${r.profileName}|${r.adCode}|${r.exitScenario}`;
    seen.set(key, r);
  }
  const records = Array.from(seen.values()).map((r) => ({
    date: r.date,
    profile_name: r.profileName,
    ad_code: r.adCode,
    exit_scenario: r.exitScenario,
    session_count: r.sessionCount,
    synced_at: syncedAt,
  }));

  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabase
      .from("efo_exit_scenarios")
      .upsert(records.slice(i, i + BATCH), { onConflict: "date,profile_name,ad_code,exit_scenario", ignoreDuplicates: false });
    if (error) {
      logger.error({ error }, "Supabase upsert efo_exit_scenarios failed");
      throw new Error(`Supabase upsert失敗: ${error.message}`);
    }
  }
  logger.info({ rowCount: records.length }, "Upserted efo_exit_scenarios to Supabase");
}

export async function fetchEfoAccessCvFromSupabase(): Promise<{ rows: EfoAccessCvRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("efo_access_cv").select("*").order("date", { ascending: true });
  if (error) {
    logger.error({ error }, "Supabase fetch efo_access_cv failed");
    throw new Error(`Supabase fetch失敗: ${error.message}`);
  }
  if (!data || data.length === 0) return { rows: [], syncedAt: null };
  const rows: EfoAccessCvRow[] = data.map((r) => ({
    date: r.date ?? "",
    adCode: r.ad_code ?? "",
    profileName: r.profile_name ?? "",
    accessCount: r.access_count ?? 0,
    cvCount: r.cv_count ?? 0,
  }));
  return { rows, syncedAt: data[0]?.synced_at ?? null };
}

export async function fetchEfoExitScenariosFromSupabase(): Promise<{ rows: EfoExitScenarioRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("efo_exit_scenarios").select("*").order("date", { ascending: true });
  if (error) {
    logger.error({ error }, "Supabase fetch efo_exit_scenarios failed");
    throw new Error(`Supabase fetch失敗: ${error.message}`);
  }
  if (!data || data.length === 0) return { rows: [], syncedAt: null };
  const rows: EfoExitScenarioRow[] = data.map((r) => ({
    date: r.date ?? "",
    profileName: r.profile_name ?? "",
    adCode: r.ad_code ?? "",
    exitScenario: r.exit_scenario ?? "",
    sessionCount: r.session_count ?? 0,
  }));
  return { rows, syncedAt: data[0]?.synced_at ?? null };
}
