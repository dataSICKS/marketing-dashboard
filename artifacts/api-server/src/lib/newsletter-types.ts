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
