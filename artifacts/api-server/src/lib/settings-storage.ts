import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

const BUCKET = "app-settings";
const FILE = "config.json";

export interface AppSettings {
  clarityTargetUrls: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  clarityTargetUrls: [],
};

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureBucket(supabase: ReturnType<typeof getSupabase>): Promise<void> {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) {
    logger.warn({ error }, "バケット一覧取得失敗。バケット作成を試みます");
  }
  const exists = (buckets ?? []).some((b) => b.name === BUCKET);
  if (!exists) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (createErr) {
      logger.warn({ error: createErr }, "バケット作成失敗（既に存在する可能性あり）");
    }
  }
}

export async function getSettings(): Promise<AppSettings> {
  try {
    const supabase = getSupabase();
    await ensureBucket(supabase);
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE);
    if (error || !data) return { ...DEFAULT_SETTINGS };
    const text = await (data as Blob).text();
    const raw = JSON.parse(text) as Record<string, unknown>;

    // 旧フォーマット移行: clarityTargetUrl (単数) → clarityTargetUrls (複数)
    if (!Array.isArray(raw.clarityTargetUrls) && raw.clarityTargetUrl) {
      raw.clarityTargetUrls = [raw.clarityTargetUrl as string];
    }

    return {
      clarityTargetUrls: Array.isArray(raw.clarityTargetUrls) ? (raw.clarityTargetUrls as string[]) : [],
    };
  } catch (err) {
    logger.warn({ err }, "設定の読み込みに失敗しました。デフォルト値を使用します");
    return { ...DEFAULT_SETTINGS };
  }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const updated: AppSettings = { ...current, ...patch };
  const supabase = getSupabase();
  await ensureBucket(supabase);
  const blob = new Blob([JSON.stringify(updated)], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE, blob, { upsert: true });
  if (error) {
    logger.error({ error }, "設定の保存に失敗しました");
    throw new Error(`設定の保存失敗: ${error.message}`);
  }
  return updated;
}
