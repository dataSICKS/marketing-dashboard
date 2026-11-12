import type { LtvRow } from "./ltv-types.js";

/** 内訳の軸。`none` は全体1本（LTVレポートのシートと同じ形）。 */
export type LtvSplitBy = "none" | "optout" | "offer" | "firstProduct" | "subsStatus" | "adGroup";

export interface LtvMetrics {
  /** 初回購入月（YYYY/MM） */
  label: string;
  /** 内訳の値。split が none のときは「全体」 */
  segment: string;
  /** 定期購入件数 */
  count: number;
  /** 平均LTV（円）。シートのLTVレポートと同じく定期1件あたりの平均 */
  ltv95: number;
  ltv180: number;
  ltv365: number;
}

export interface LtvSummary {
  count: number;
  ltv95: number;
  ltv180: number;
  ltv365: number;
}

export interface LtvFilters {
  offers: string[];
  firstProducts: string[];
  subsStatuses: string[];
  adGroups: string[];
}

export const OPTOUT_YES = "オプトアウトあり";
export const OPTOUT_NO = "オプトアウトなし";
export const OVERALL = "全体";
const UNSET = "未設定";

/** `2024-06-01` → `2024/06`。LTVレポートのシートは `2024/06/01` 表記だが、月粒度なので年月までに揃える。 */
export function monthLabel(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const m = isoDate.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}` : null;
}

export interface LtvQuery {
  /** 初回購入月の下限・上限（YYYY-MM-DD） */
  monthFrom?: string;
  monthTo?: string;
  offers?: string[];
  firstProducts?: string[];
  subsStatuses?: string[];
  adGroups?: string[];
  /** `yes` = オプトアウトした顧客のみ / `no` = していない顧客のみ */
  optout?: "all" | "yes" | "no";
}

/**
 * オプトアウトした顧客番号の集合。
 * `newsletter_optouts` は 2025-12-31 以降しか無いので、それ以前に初回購入した定期は
 * 実際に解除していても「なし」に入る。画面側で注記を出すこと。
 */
export function optoutCustomerSet(customerCodes: string[]): Set<string> {
  return new Set(customerCodes.map((code) => code.trim()).filter(Boolean));
}

export function filterLtvRows(rows: LtvRow[], query: LtvQuery, optedOut: Set<string>): LtvRow[] {
  const has = (list: string[] | undefined) => Array.isArray(list) && list.length > 0;
  return rows.filter((row) => {
    if (query.monthFrom && (!row.firstOrderMonth || row.firstOrderMonth < query.monthFrom)) return false;
    if (query.monthTo && (!row.firstOrderMonth || row.firstOrderMonth > query.monthTo)) return false;
    if (has(query.offers) && !query.offers!.includes(row.offerName || UNSET)) return false;
    if (has(query.firstProducts) && !query.firstProducts!.includes(row.firstProduct || UNSET)) return false;
    if (has(query.subsStatuses) && !query.subsStatuses!.includes(row.subsStatus || UNSET)) return false;
    if (has(query.adGroups) && !query.adGroups!.includes(row.adGroupName || UNSET)) return false;
    if (query.optout && query.optout !== "all") {
      const isOut = optedOut.has(row.customerCode);
      if (query.optout === "yes" && !isOut) return false;
      if (query.optout === "no" && isOut) return false;
    }
    return true;
  });
}

export function segmentOf(row: LtvRow, splitBy: LtvSplitBy, optedOut: Set<string>): string {
  switch (splitBy) {
    case "optout": return optedOut.has(row.customerCode) ? OPTOUT_YES : OPTOUT_NO;
    case "offer": return row.offerName || UNSET;
    case "firstProduct": return row.firstProduct || UNSET;
    case "subsStatus": return row.subsStatus || UNSET;
    case "adGroup": return row.adGroupName || UNSET;
    default: return OVERALL;
  }
}

/** 平均は「定期1件あたり」。小数は出さず円単位に丸める（シートの表示に合わせる）。 */
const average = (total: number, count: number) => (count > 0 ? Math.round(total / count) : 0);

/**
 * 初回購入月 × 内訳 で集計する。
 * 件数が0の月は行を作らない（シートのLTVレポートも実績のある月だけ並んでいる）。
 */
export function aggregateLtv(rows: LtvRow[], splitBy: LtvSplitBy, optedOut: Set<string>): LtvMetrics[] {
  const map = new Map<string, { label: string; segment: string; count: number; s95: number; s180: number; s365: number }>();

  for (const row of rows) {
    const label = monthLabel(row.firstOrderMonth);
    if (!label) continue;
    const segment = segmentOf(row, splitBy, optedOut);
    const key = `${label}|${segment}`;
    const entry = map.get(key) ?? { label, segment, count: 0, s95: 0, s180: 0, s365: 0 };
    entry.count++;
    entry.s95 += row.ltv95;
    entry.s180 += row.ltv180;
    entry.s365 += row.ltv365;
    map.set(key, entry);
  }

  return Array.from(map.values())
    .sort((a, b) => a.label.localeCompare(b.label) || a.segment.localeCompare(b.segment, "ja"))
    .map((e) => ({
      label: e.label,
      segment: e.segment,
      count: e.count,
      ltv95: average(e.s95, e.count),
      ltv180: average(e.s180, e.count),
      ltv365: average(e.s365, e.count),
    }));
}

export function summarizeLtv(rows: LtvRow[]): LtvSummary {
  let s95 = 0, s180 = 0, s365 = 0;
  for (const row of rows) {
    s95 += row.ltv95;
    s180 += row.ltv180;
    s365 += row.ltv365;
  }
  return {
    count: rows.length,
    ltv95: average(s95, rows.length),
    ltv180: average(s180, rows.length),
    ltv365: average(s365, rows.length),
  };
}

/** 絞り込みに使える値の一覧。件数の多い順に並べる（選びやすさ優先）。 */
export function collectFilters(rows: LtvRow[]): LtvFilters {
  const pick = (get: (row: LtvRow) => string) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = get(row) || UNSET;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
      .map(([value]) => value);
  };
  return {
    offers: pick((r) => r.offerName),
    firstProducts: pick((r) => r.firstProduct),
    subsStatuses: pick((r) => r.subsStatus),
    adGroups: pick((r) => r.adGroupName),
  };
}

/**
 * LTV365 が「まだ揃っていない」月かどうか。
 * 初回購入から365日経っていない月は、集計期間が足りないぶん必ず小さく出る。
 * （シートのLTVレポートでも直近月は LTV95=LTV180=LTV365 になっている）
 */
export function maturedThrough(days: number, today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
