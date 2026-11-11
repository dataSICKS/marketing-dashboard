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
