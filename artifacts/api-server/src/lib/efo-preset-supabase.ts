import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

export interface EfoPresetSegment {
  dateFrom: string | null;
  dateTo: string | null;
  profileNames: string[];
  adCodes: string[];
}

export interface EfoPreset {
  id: number;
  name: string;
  groupBy: string;
  segmentA: EfoPresetSegment;
  segmentB: EfoPresetSegment;
  createdAt: string;
}

export interface EfoPresetInput {
  name: string;
  groupBy: string;
  segmentA: EfoPresetSegment;
  segmentB: EfoPresetSegment;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return createClient(url, key, { auth: { persistSession: false } });
}

function toPreset(r: Record<string, unknown>): EfoPreset {
  return {
    id: r.id as number,
    name: r.name as string,
    groupBy: r.group_by as string,
    segmentA: r.segment_a as EfoPresetSegment,
    segmentB: r.segment_b as EfoPresetSegment,
    createdAt: r.created_at as string,
  };
}

export async function listEfoPresets(): Promise<EfoPreset[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("efo_presets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    logger.error({ error }, "Failed to list efo_presets");
    throw new Error(`efo_presets取得失敗: ${error.message}`);
  }
  return (data ?? []).map(toPreset);
}

export async function createEfoPreset(input: EfoPresetInput): Promise<EfoPreset> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("efo_presets")
    .insert({
      name: input.name,
      group_by: input.groupBy,
      segment_a: input.segmentA,
      segment_b: input.segmentB,
    })
    .select()
    .single();
  if (error) {
    logger.error({ error }, "Failed to create efo_preset");
    throw new Error(`efo_preset作成失敗: ${error.message}`);
  }
  return toPreset(data);
}

export async function deleteEfoPreset(id: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("efo_presets").delete().eq("id", id);
  if (error) {
    logger.error({ error }, "Failed to delete efo_preset");
    throw new Error(`efo_preset削除失敗: ${error.message}`);
  }
}
