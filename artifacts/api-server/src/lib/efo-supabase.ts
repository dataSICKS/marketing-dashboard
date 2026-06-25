import { createClient } from "@supabase/supabase-js";
import type { EfoAccessCvRow, EfoExitScenarioRow, EcfAdAccessCvRow } from "./efo-types.js";
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

async function fetchAllPages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetcher: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  pageSize = 1000,
  parallelBatch = 20,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let offset = 0;
  while (true) {
    const promises = Array.from({ length: parallelBatch }, (_, i) =>
      fetcher(offset + i * pageSize, offset + (i + 1) * pageSize - 1),
    );
    const results = await Promise.all(promises);
    let done = false;
    for (const { data, error } of results) {
      if (error) throw error;
      if (!data || data.length === 0) { done = true; break; }
      all.push(...data);
      if (data.length < pageSize) { done = true; break; }
    }
    if (done) break;
    offset += parallelBatch * pageSize;
  }
  return all;
}

export async function fetchEfoAccessCvFromSupabase(): Promise<{ rows: EfoAccessCvRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();
  const data = await fetchAllPages((from, to) =>
    supabase.from("efo_access_cv").select("*").order("date", { ascending: true }).range(from, to),
  );
  if (data.length === 0) return { rows: [], syncedAt: null };
  const rows: EfoAccessCvRow[] = data.map((r) => ({
    date: r.date ?? "",
    adCode: r.ad_code ?? "",
    profileName: r.profile_name ?? "",
    accessCount: r.access_count ?? 0,
    cvCount: r.cv_count ?? 0,
  }));
  logger.info({ rowCount: rows.length }, "Fetched efo_access_cv from Supabase");
  const syncedAt = data.reduce((max: string | null, r) => {
    if (!r.synced_at) return max;
    return !max || r.synced_at > max ? r.synced_at : max;
  }, null);
  return { rows, syncedAt };
}

export async function fetchEfoExitScenariosFromSupabase(): Promise<{ rows: EfoExitScenarioRow[]; syncedAt: string | null }> {
  const supabase = getSupabaseClient();
  const data = await fetchAllPages((from, to) =>
    supabase.from("efo_exit_scenarios").select("*").order("date", { ascending: true }).range(from, to),
  );
  if (data.length === 0) return { rows: [], syncedAt: null };
  const rows: EfoExitScenarioRow[] = data.map((r) => ({
    date: r.date ?? "",
    profileName: r.profile_name ?? "",
    adCode: r.ad_code ?? "",
    exitScenario: r.exit_scenario ?? "",
    sessionCount: r.session_count ?? 0,
  }));
  logger.info({ rowCount: rows.length }, "Fetched efo_exit_scenarios from Supabase");
  return { rows, syncedAt: data[0]?.synced_at ?? null };
}

export async function fetchEcfAdAccessCvFromSupabase(): Promise<EcfAdAccessCvRow[]> {
  const supabase = getSupabaseClient();
  const data = await fetchAllPages((from, to) =>
    supabase.from("ecf_ad_access_cv").select("ad_url,ad_date,access_count").order("ad_date", { ascending: true }).range(from, to),
  );
  const rows: EcfAdAccessCvRow[] = data.map((r) => ({
    adUrl: r.ad_url ?? "",
    adDate: r.ad_date ?? "",
    lpAccessCount: r.access_count ?? 0,
  }));
  logger.info({ rowCount: rows.length }, "Fetched ecf_ad_access_cv from Supabase");
  return rows;
}
