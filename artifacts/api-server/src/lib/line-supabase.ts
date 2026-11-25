import { createClient } from "@supabase/supabase-js";
import type { LineDailyRow, LineUrlMaster, LineUrlCv } from "./line-sheet-parse.js";
import { LINE_ZONES } from "./line-sheet-parse.js";
import { logger } from "./logger.js";

/**
 * LINE実績レポートの保存。テーブルは3つ。
 *
 * - `line_zone_daily` … 日付 × 経路ゾーンの実績（日実績タブの縦持ち）
 * - `line_url_master` … 識別子 → 経路・セグメント・メッセージパック
 * - `line_url_cv`     … 日付 × 識別子 の CV（0は保存しない）
 *
 * `line_url_cv` は**全消し→入れ直し**。0を保存しない作りなので、
 * CVが1→0に直ったとき upsert だと古い1が残ってしまう。
 */

const BATCH = 500;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type Client = ReturnType<typeof getSupabaseClient>;

async function insertBatches(
  supabase: Client,
  table: string,
  records: Record<string, unknown>[],
  onConflict?: string,
): Promise<void> {
  for (let index = 0; index < records.length; index += BATCH) {
    const batch = records.slice(index, index + BATCH);
    const query = supabase.from(table);
    const { error } = onConflict
      ? await query.upsert(batch, { onConflict, ignoreDuplicates: false })
      : await query.insert(batch);
    if (error) {
      logger.error({ error, table }, "Supabase LINE write failed");
      throw new Error(`${table} への書き込みに失敗しました: ${error.message}`);
    }
  }
}

export async function saveLineSnapshot(
  daily: readonly LineDailyRow[],
  master: readonly LineUrlMaster[],
  cv: readonly LineUrlCv[],
  syncedAt: string,
): Promise<{ zoneRows: number; masterRows: number; cvRows: number }> {
  const supabase = getSupabaseClient();

  const zoneRecords: Record<string, unknown>[] = [];
  for (const row of daily) {
    for (const zone of row.zones) {
      // 全部 null の行は保存しない（CVしか持たない経路の残高列など）。
      const hasValue = [
        zone.people, zone.newCount, zone.instantBlock, zone.blockDelta,
        zone.blockTotal, zone.active, zone.scenarioCount, zone.lpAccess, zone.cv,
      ].some((value) => value !== null);
      if (!hasValue) continue;
      zoneRecords.push({
        report_date: row.date,
        zone: zone.zone,
        people: zone.people,
        new_count: zone.newCount,
        instant_block: zone.instantBlock,
        block_delta: zone.blockDelta,
        block_total: zone.blockTotal,
        active: zone.active,
        scenario_count: zone.scenarioCount,
        lp_access: zone.lpAccess,
        cv: zone.cv,
        synced_at: syncedAt,
      });
    }
  }

  const masterRecords = master.map((row) => ({
    identifier: row.identifier,
    route: row.route,
    segment_subscription: row.segmentSubscription,
    segment_child: row.segmentChild,
    message_pack: row.messagePack,
    step_number: row.stepNumber,
    ad_group: row.adGroup,
    has_coupon: row.hasCoupon,
    url: row.url,
    synced_at: syncedAt,
  }));

  const cvRecords = cv.map((row) => ({
    report_date: row.date,
    identifier: row.identifier,
    cv: row.cv,
    synced_at: syncedAt,
  }));

  await insertBatches(supabase, "line_zone_daily", zoneRecords, "report_date,zone");
  await insertBatches(supabase, "line_url_master", masterRecords, "identifier");

  // 0を保存しない作りなので、消えたCVが残らないように入れ直す。
  const { error: deleteError } = await supabase.from("line_url_cv").delete().neq("identifier", "");
  if (deleteError) {
    logger.error({ error: deleteError }, "Supabase line_url_cv delete failed");
    throw new Error(`line_url_cv の消去に失敗しました: ${deleteError.message}`);
  }
  await insertBatches(supabase, "line_url_cv", cvRecords);

  logger.info({ zoneRecords: zoneRecords.length, masterRecords: masterRecords.length, cvRecords: cvRecords.length },
    "Saved LINE snapshot");
  return { zoneRows: zoneRecords.length, masterRows: masterRecords.length, cvRows: cvRecords.length };
}

async function fetchAll(supabase: Client, table: string, select: string, order: string) {
  const PAGE = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).order(order, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      logger.error({ error, table }, "Supabase LINE fetch failed");
      throw new Error(`${table} の取得に失敗しました: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export async function fetchLineFromSupabase(): Promise<{
  daily: LineDailyRow[];
  master: LineUrlMaster[];
  cv: LineUrlCv[];
  syncedAt: string | null;
}> {
  const supabase = getSupabaseClient();
  const [zoneRows, masterRows, cvRows] = await Promise.all([
    fetchAll(supabase, "line_zone_daily", "*", "report_date"),
    fetchAll(supabase, "line_url_master", "*", "identifier"),
    fetchAll(supabase, "line_url_cv", "*", "report_date"),
  ]);

  const byDate = new Map<string, LineDailyRow>();
  const order = new Map(LINE_ZONES.map((zone, index) => [zone.key, index]));
  for (const row of zoneRows) {
    const date = String(row.report_date ?? "").slice(0, 10);
    if (!date) continue;
    const entry = byDate.get(date) ?? { date, zones: [] };
    entry.zones.push({
      zone: String(row.zone ?? ""),
      people: num(row.people),
      newCount: num(row.new_count),
      instantBlock: num(row.instant_block),
      blockDelta: num(row.block_delta),
      blockTotal: num(row.block_total),
      active: num(row.active),
      scenarioCount: num(row.scenario_count),
      lpAccess: num(row.lp_access),
      cv: num(row.cv),
    });
    byDate.set(date, entry);
  }
  const daily = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      // 画面の並びがシートの左→右（粒度の粗い→細かい）と一致するようにそろえる。
      zones: row.zones.sort((a, b) => (order.get(a.zone) ?? 99) - (order.get(b.zone) ?? 99)),
    }));

  return {
    daily,
    master: masterRows.map((row) => ({
      identifier: String(row.identifier ?? ""),
      route: String(row.route ?? ""),
      segmentSubscription: String(row.segment_subscription ?? ""),
      segmentChild: String(row.segment_child ?? ""),
      messagePack: String(row.message_pack ?? ""),
      stepNumber: num(row.step_number),
      adGroup: String(row.ad_group ?? ""),
      hasCoupon: row.has_coupon === null || row.has_coupon === undefined ? null : Boolean(row.has_coupon),
      url: String(row.url ?? ""),
    })),
    cv: cvRows.map((row) => ({
      date: String(row.report_date ?? "").slice(0, 10),
      identifier: String(row.identifier ?? ""),
      cv: Number(row.cv ?? 0),
    })),
    syncedAt: (zoneRows[0]?.synced_at as string) ?? null,
  };
}
