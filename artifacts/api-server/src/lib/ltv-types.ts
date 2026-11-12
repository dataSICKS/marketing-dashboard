/**
 * LTV分析のデータ型。
 * 出典は Google Sheet `10wmBYd...`（LTV集計-Sicks共有）の `RAW_定期ID別購入商品_LTV95_180_365` タブ。
 * 1行 = 1定期購入番号（顧客1人が複数の定期を持つことがあるので、顧客単位ではない）。
 */
export interface LtvRow {
  /** 定期購入番号。行の一意キー */
  subsOrderCode: string;
  /** 顧客番号。newsletter_optouts.customer_code と突き合わせてオプトアウト有無を出す */
  customerCode: string;
  /** 初回購入月（YYYY-MM-01） */
  firstOrderMonth: string | null;
  /** 初回購入の商品ラベル */
  firstProduct: string;
  /** 広告グループ名 */
  adGroupName: string;
  /** サブスク状態（継続中 / 解約 など） */
  subsStatus: string;
  product2: string;
  product3: string;
  product4: string;
  /** 初回購入日から95日/180日/365日以内の利益合計 */
  ltv95: number;
  ltv180: number;
  ltv365: number;
  /** 販売URL（広告URL） */
  sellingUrl: string;
  /** オファー名（1〜4回目の商品の組み合わせに対する呼び名） */
  offerName: string;
}
