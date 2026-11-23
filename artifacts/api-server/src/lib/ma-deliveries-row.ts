/**
 * `ma_deliveries` の1行を分析に使える配信イベントに変換する。
 *
 * Supabaseクライアントを読み込まないので単体で試験できる。
 * 「届いた1通」の定義がここに1箇所だけあるようにしておく。
 */

/** 1件＝1顧客×1ノードの「メール・完了」配信。届かなかった分はここに入れない。 */
export interface DeliveryEvent {
  customerCode: string;
  /**
   * 配信日（JST）。`delivered_at` の時刻まで持たないのは、解除日が日単位の推定値で、
   * 同じ日の中の前後を判定できないため。時刻を持つと精度があるように見えてしまう。
   */
  date: string;
  templateName: string;
  nodeId: string;
  scenarioName: string;
}

export type DeliveryRowOutcome =
  | { kind: "delivered"; event: DeliveryEvent }
  /** 配信不可・スキップ・メール以外。受信通数に数えてはいけない。 */
  | { kind: "excluded" }
  /** 顧客番号か配信日が欠けていて、どの顧客の何日の配信か決められない。 */
  | { kind: "invalid" };

const text = (value: unknown): string => String(value ?? "").trim();

export function classifyDeliveryRow(row: Record<string, unknown>): DeliveryRowOutcome {
  // 「完了」以外は届いていない。「配信不可」「スキップ」を受信通数に足すと解除率が薄まる。
  if (text(row.delivery_status) !== "完了" || text(row.delivery_method) !== "メール") {
    return { kind: "excluded" };
  }
  const customerCode = text(row.customer_code);
  const date = text(row.delivery_date).slice(0, 10);
  if (!customerCode || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { kind: "invalid" };
  return {
    kind: "delivered",
    event: {
      customerCode,
      date,
      templateName: text(row.template_name),
      nodeId: text(row.node_id),
      scenarioName: text(row.scenario_name),
    },
  };
}
