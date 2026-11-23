import { createClient } from "@supabase/supabase-js";
import { classifyDeliveryRow, type DeliveryEvent } from "./ma-deliveries-row.js";
import { logger } from "./logger.js";

/**
 * MA「配信対象者毎」CSV を取り込んだ `ma_deliveries` を読む。
 *
 * 元シートの `ma_raw` タブは直近の一部シナリオしか残っていない（2,000行台）。
 * こちらは 2025-10 以降の全シナリオ分が入っているので、顧客ごとの通数を数えられる。
 * 取り込みは `ma-deliveries-to-supabase/run.py`（手動実行）が行う。
 */

export type { DeliveryEvent };

export interface DeliverySnapshot {
  events: DeliveryEvent[];
  from: string | null;
  to: string | null;
  /** 取得した全行数（配信不可・スキップ・メール以外を含む）。 */
  rawRows: number;
  /** 完了・メール以外として除いた行数。 */
  excludedRows: number;
  /** 顧客番号または配信日が欠けていて使えなかった行数。 */
  invalidRows: number;
  available: boolean;
  error: string | null;
}

const PAGE = 1000;
/** 取り込み件数が想定を超えたら部分集計を返さず止める。2026-11時点で約10万行。 */
const MAX_ROWS = 500000;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function fetchDeliveries(): Promise<DeliverySnapshot> {
  const supabase = getSupabaseClient();
  const events: DeliveryEvent[] = [];
  let rawRows = 0;
  let excludedRows = 0;
  let invalidRows = 0;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("ma_deliveries")
      .select("customer_code,delivery_date,delivery_status,delivery_method,template_name,node_id,scenario_name")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      logger.error({ error }, "Supabase ma_deliveries fetch failed");
      throw new Error(`配信履歴の取得に失敗しました: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data as Record<string, unknown>[]) {
      rawRows++;
      const outcome = classifyDeliveryRow(row);
      if (outcome.kind === "excluded") excludedRows++;
      else if (outcome.kind === "invalid") invalidRows++;
      else events.push(outcome.event);
    }

    if (data.length < PAGE) break;
    from += PAGE;
    if (from > MAX_ROWS) {
      throw new Error("配信履歴が読取上限を超えています。部分集計を避けるため取得を停止しました");
    }
  }

  const dates = events.map((event) => event.date).sort();
  logger.info({ rawRows, delivered: events.length, excludedRows, invalidRows }, "Fetched ma_deliveries");
  return {
    events,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    rawRows,
    excludedRows,
    invalidRows,
    available: true,
    error: null,
  };
}
