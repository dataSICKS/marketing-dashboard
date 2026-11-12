export interface NewsletterRow {
  deliveryYearMonth: string;
  deliveryWeek: string;
  deliveryDate: string;
  scenarioName: string;
  segment: string;
  deliveryMethod: string;
  templateName: string;
  subject: string;
  deliveryCount: number;
  openCount: number;
  clickCount: number;
  cvCount: number;
}

export interface NewsletterMetrics {
  label: string;
  period?: string;
  periodEnd?: string;
  subject: string | null;
  segment: string | null;
  deliveryCount: number;
  openCount: number;
  clickCount: number;
  cvCount: number;
  openRate: number;
  clickRate: number;
  cvr: number;
  prevDeliveryCount: number | null;
  prevOpenRate: number | null;
  prevClickRate: number | null;
  prevCvr: number | null;
  /**
   * 期間内のオプトアウト件数。配信データ（calcシート）には無く newsletter_optouts から
   * 期間ラベルで突き合わせて埋める。シナリオ/テンプレート別の内訳は元データに無いため、
   * groupBy が day/week/month のときだけ値が入り、それ以外は null。
   */
  optoutCount?: number | null;
  prevOptoutCount?: number | null;
}

/** オプトアウト1件（1顧客×1日）。シート「20260101以降のオプトアウトリスト」由来。 */
export interface OptoutRow {
  /** YYYY-MM-DD */
  optoutDate: string;
  customerCode: string;
}

export interface OptoutMetrics {
  label: string;
  optoutCount: number;
  prevOptoutCount: number | null;
}
