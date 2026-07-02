import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

export interface Campaign {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignInput {
  title: string;
  startDate: string;
  endDate: string;
  memo?: string | null;
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return createClient(url, key, { auth: { persistSession: false } });
}

function toRow(r: Record<string, unknown>): Campaign {
  return {
    id: r.id as number,
    title: r.title as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    memo: (r.memo as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listCampaigns(): Promise<Campaign[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("*")
    .order("start_date", { ascending: true });
  if (error) {
    logger.error({ error }, "Failed to list campaigns");
    throw new Error(`campaigns取得失敗: ${error.message}`);
  }
  return (data ?? []).map(toRow);
}

export async function createCampaign(input: CampaignInput): Promise<Campaign> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      title: input.title,
      start_date: input.startDate,
      end_date: input.endDate,
      memo: input.memo ?? null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) {
    logger.error({ error }, "Failed to create campaign");
    throw new Error(`campaign作成失敗: ${error.message}`);
  }
  return toRow(data);
}

export async function updateCampaign(id: number, input: CampaignInput): Promise<Campaign> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({
      title: input.title,
      start_date: input.startDate,
      end_date: input.endDate,
      memo: input.memo ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    logger.error({ error }, "Failed to update campaign");
    throw new Error(`campaign更新失敗: ${error.message}`);
  }
  return toRow(data);
}

export async function deleteCampaign(id: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) {
    logger.error({ error }, "Failed to delete campaign");
    throw new Error(`campaign削除失敗: ${error.message}`);
  }
}
