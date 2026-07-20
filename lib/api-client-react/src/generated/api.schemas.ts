export type HealthStatus = {
  status: string;
};

export type ErrorResponse = {
  error: string;
};

export type NewsletterRow = {
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
};

export type NewsletterSyncResult = {
  rowCount: number;
  syncedAt: string;
};

export type NewsletterMetrics = {
  label: string;
  subject?: string | null;
  segment?: string | null;
  deliveryCount: number;
  openCount: number;
  clickCount: number;
  cvCount: number;
  openRate: number;
  clickRate: number;
  cvr: number;
  prevDeliveryCount?: number | null;
  prevOpenRate?: number | null;
  prevClickRate?: number | null;
  prevCvr?: number | null;
};

export type NewsletterSegmentGroup = {
  segment: string;
  items: NewsletterMetrics[];
  summary: NewsletterMetrics;
};

export type NewsletterReportResponse = {
  groupBy: string;
  items: NewsletterMetrics[];
  segmentGroups?: NewsletterSegmentGroup[];
  summary: NewsletterMetrics;
  lastSyncedAt: string | null;
  availableSegments: string[];
};

export type NewsletterSegmentsResponse = {
  segments: string[];
};

export type NewsletterTemplatesResponse = {
  templates: string[];
};

export type NewsletterChangeEvent = {
  date: string;
  type: "subject" | "template";
  scenarioName: string;
  before: string;
  after: string;
};

export type NewsletterChangeEventsResponse = {
  events: NewsletterChangeEvent[];
};

export type ClarityAdCodeEntry = {
  adCode: string;
  devices: string[];
};

export type ClarityFilesResponse = {
  dates: string[];
  adCodes: ClarityAdCodeEntry[];
};

export type ClarityScrollPoint = {
  depth: number;
  desktop: number | null;
  mobile: number | null;
};

export type ClarityScrollResponse = {
  adCode: string;
  date: string;
  points: ClarityScrollPoint[];
  pageViews: Record<string, number>;
};

export type EfoFilters = {
  profileNames: string[];
  adCodes: string[];
};

export type EfoSyncResult = {
  accessCvRowCount: number;
  exitScenarioRowCount: number;
  syncedAt: string;
};

export type EfoMetrics = {
  label: string;
  accessCount: number;
  cvCount: number;
  cvr: number;
  lpAccessCount: number | null;
  chatLaunchRate: number | null;
  lpCvr: number | null;
};

export type EfoExitScenarioCount = {
  scenario: string;
  count: number;
};

export type EfoReportResponse = {
  groupBy: string;
  items: EfoMetrics[];
  summary: EfoMetrics;
  exitScenarios: EfoExitScenarioCount[];
  lastSyncedAt: string | null;
};

export type MatrixMetric = "deliveryCount" | "openRate" | "clickRate" | "cvr" | "cvCount";

export type MatrixSeriesRow = {
  key: string;
  type: "scenario" | "template";
  metricValues: Partial<Record<MatrixMetric, Record<string, number>>>;
};

export type MatrixResponse = {
  timePeriods: string[];
  series: MatrixSeriesRow[];
  metrics: MatrixMetric[];
};

export type Campaign = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  memo: string | null;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignInput = {
  title: string;
  startDate: string;
  endDate: string;
  memo?: string | null;
  category?: string | null;
};

export type CampaignListResponse = {
  campaigns: Campaign[];
};

export type CampaignResponse = {
  campaign: Campaign;
};

export type EfoPresetSegment = {
  dateFrom?: string | null;
  dateTo?: string | null;
  profileNames: string[];
  adCodes: string[];
};

export type EfoPreset = {
  id: number;
  name: string;
  groupBy: string;
  segmentA: EfoPresetSegment;
  segmentB: EfoPresetSegment;
  createdAt: string;
};

export type EfoPresetInput = {
  name: string;
  groupBy: string;
  segmentA: EfoPresetSegment;
  segmentB: EfoPresetSegment;
};

export type EfoPresetListResponse = {
  presets: EfoPreset[];
};

export type EfoPresetResponse = {
  preset: EfoPreset;
};

export type AppSettings = {
  clarityTargetUrl: string | null;
};

export type AppSettingsInput = {
  clarityTargetUrl?: string | null;
};
