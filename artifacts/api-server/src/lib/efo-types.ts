export interface EfoAccessCvRow {
  date: string;
  adCode: string;
  profileName: string;
  accessCount: number;
  cvCount: number;
}

export interface EfoExitScenarioRow {
  date: string;
  profileName: string;
  adCode: string;
  exitScenario: string;
  sessionCount: number;
}

export interface EcfAdAccessCvRow {
  adUrl: string;
  adDate: string; // YYYY-MM-DD
  lpAccessCount: number;
}

export interface EfoMetrics {
  label: string;
  accessCount: number;
  cvCount: number;
  cvr: number;
  lpAccessCount: number | null;
  chatLaunchRate: number | null;
  lpCvr: number | null;
}

export interface EfoExitScenarioCount {
  scenario: string;
  count: number;
}

export interface EfoReportResponse {
  groupBy: string;
  items: EfoMetrics[];
  summary: EfoMetrics;
  exitScenarios: EfoExitScenarioCount[];
  lastSyncedAt: string | null;
}
