import type { LineDailyRow, LineZoneMetrics } from "./line-sheet-parse.js";

/**
 * 日次の経路ゾーン実績を日/週/月にまとめる。
 *
 * **ストックとフローを混ぜない。** これがこのファイルの要点。
 *
 * - フロー（当日新規・即ブロック数・LPアクセス・CV・ブロック増）は期間で**足す**
 * - ストック（人数累計・ブロック累計・残存・シナリオ分類数）は期間の**最終日の値**を採る
 *
 * 足してはいけない残高を足すと、週の友だち数が7倍になる。元シートの週実績・月実績も
 * 「残高は期末行を参照」という作りなので、そこに合わせている（用語タブ⑤）。
 *
 * 実行時importを持たない（型のみ）ので単体で試験できる。
 */

export type LineGrain = "day" | "week" | "month";

const DAY_MS = 86400000;

/** 週は月曜始まり（用語タブの定義）。ラベルはその週の月曜日の日付。 */
export function linePeriod(date: string, grain: LineGrain): string {
  if (grain === "month") return `${date.slice(0, 7)}-01`;
  if (grain === "day") return date;
  const time = Date.parse(`${date}T00:00:00Z`);
  const weekday = new Date(time).getUTCDay(); // 0=日
  const offset = (weekday + 6) % 7; // 月曜までの戻り日数
  return new Date(time - offset * DAY_MS).toISOString().slice(0, 10);
}

export interface LineZonePeriod {
  period: string;
  zone: string;
  /** 期間内で値が入っていた日数。歯抜けに気づけるように出す。 */
  days: number;
  newCount: number | null;
  instantBlock: number | null;
  blockDelta: number | null;
  lpAccess: number | null;
  cv: number | null;
  people: number | null;
  blockTotal: number | null;
  active: number | null;
  scenarioCount: number | null;
  /** 期末の残存 − 前期末の残存。純増。 */
  activeDelta: number | null;
  instantBlockRate: number | null;
  blockRate: number | null;
  scenarioRate: number | null;
  cvrLp: number | null;
  /** CV ÷ その期間の新規。同一コホートの転換率ではない。 */
  convRate: number | null;
}

const FLOW = ["newCount", "instantBlock", "blockDelta", "lpAccess", "cv"] as const;
const STOCK = ["people", "blockTotal", "active", "scenarioCount"] as const;

const ratio = (numerator: number | null, denominator: number | null): number | null =>
  numerator === null || denominator === null || denominator === 0 ? null : numerator / denominator;

interface Accumulator {
  days: Set<string>;
  flow: Record<string, number | null>;
  stock: Record<string, number | null>;
  stockDate: string | null;
}

export interface LineAggregateFilters {
  dateFrom?: string;
  dateTo?: string;
  zones?: readonly string[];
}

export function aggregateLineRows(
  rows: readonly LineDailyRow[],
  grain: LineGrain,
  filters: LineAggregateFilters = {},
): LineZonePeriod[] {
  const wanted = filters.zones && filters.zones.length ? new Set(filters.zones) : null;
  const buckets = new Map<string, Accumulator>();
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  for (const row of ordered) {
    if (filters.dateFrom && row.date < filters.dateFrom) continue;
    if (filters.dateTo && row.date > filters.dateTo) continue;
    const period = linePeriod(row.date, grain);
    for (const zone of row.zones) {
      if (wanted && !wanted.has(zone.zone)) continue;
      const key = `${period}\u0000${zone.zone}`;
      const current = buckets.get(key) ?? {
        days: new Set<string>(), flow: {}, stock: {}, stockDate: null,
      };
      let touched = false;
      for (const field of FLOW) {
        const value = zone[field];
        if (value === null) continue;
        current.flow[field] = (current.flow[field] ?? 0) + value;
        touched = true;
      }
      // ストックは最も新しい日の値で上書きする。欠けている日は飛ばす。
      const hasStock = STOCK.some((field) => zone[field] !== null);
      if (hasStock && (!current.stockDate || row.date >= current.stockDate)) {
        for (const field of STOCK) {
          if (zone[field] !== null) current.stock[field] = zone[field];
        }
        current.stockDate = row.date;
        touched = true;
      }
      if (touched) current.days.add(row.date);
      buckets.set(key, current);
    }
  }

  const periods = [...new Set([...buckets.keys()].map((key) => key.split("\u0000")[0]))].sort();
  const previousActive = new Map<string, number>();
  const result: LineZonePeriod[] = [];

  for (const period of periods) {
    for (const [key, accumulator] of buckets) {
      const [bucketPeriod, zone] = key.split("\u0000");
      if (bucketPeriod !== period) continue;
      const flow = (field: string) => accumulator.flow[field] ?? null;
      const stock = (field: string) => accumulator.stock[field] ?? null;
      const active = stock("active");
      const before = previousActive.get(zone);
      const item: LineZonePeriod = {
        period,
        zone,
        days: accumulator.days.size,
        newCount: flow("newCount"),
        instantBlock: flow("instantBlock"),
        blockDelta: flow("blockDelta"),
        lpAccess: flow("lpAccess"),
        cv: flow("cv"),
        people: stock("people"),
        blockTotal: stock("blockTotal"),
        active,
        scenarioCount: stock("scenarioCount"),
        activeDelta: active !== null && before !== undefined ? active - before : null,
        instantBlockRate: ratio(flow("instantBlock"), flow("newCount")),
        blockRate: ratio(stock("blockTotal"), stock("people")),
        scenarioRate: ratio(stock("scenarioCount"), stock("people")),
        cvrLp: ratio(flow("cv"), flow("lpAccess")),
        convRate: ratio(flow("cv"), flow("newCount")),
      };
      if (active !== null) previousActive.set(zone, active);
      result.push(item);
    }
  }
  return result;
}

export interface LineSummary {
  /** 最新日の残存（友だち数）。期間合計ではない。 */
  activeLatest: number | null;
  activeLatestDate: string | null;
  peopleLatest: number | null;
  blockTotalLatest: number | null;
  blockRateLatest: number | null;
  newCount: number;
  instantBlock: number;
  instantBlockRate: number | null;
  lpAccess: number;
  cv: number;
  cvrLp: number | null;
  convRate: number | null;
}

/** 絞り込み後の1ゾーン分のKPI。残高は最新日、フローは期間合計。 */
export function summarizeLineZone(
  rows: readonly LineDailyRow[],
  zone: string,
  filters: LineAggregateFilters = {},
): LineSummary {
  let latestDate: string | null = null;
  let latest: LineZoneMetrics | null = null;
  const total = { newCount: 0, instantBlock: 0, lpAccess: 0, cv: 0 };
  for (const row of rows) {
    if (filters.dateFrom && row.date < filters.dateFrom) continue;
    if (filters.dateTo && row.date > filters.dateTo) continue;
    const found = row.zones.find((item) => item.zone === zone);
    if (!found) continue;
    total.newCount += found.newCount ?? 0;
    total.instantBlock += found.instantBlock ?? 0;
    total.lpAccess += found.lpAccess ?? 0;
    total.cv += found.cv ?? 0;
    if (found.active !== null && (!latestDate || row.date >= latestDate)) {
      latestDate = row.date;
      latest = found;
    }
  }
  return {
    activeLatest: latest?.active ?? null,
    activeLatestDate: latestDate,
    peopleLatest: latest?.people ?? null,
    blockTotalLatest: latest?.blockTotal ?? null,
    blockRateLatest: ratio(latest?.blockTotal ?? null, latest?.people ?? null),
    newCount: total.newCount,
    instantBlock: total.instantBlock,
    instantBlockRate: ratio(total.instantBlock, total.newCount),
    lpAccess: total.lpAccess,
    cv: total.cv,
    cvrLp: ratio(total.cv, total.lpAccess),
    convRate: ratio(total.cv, total.newCount),
  };
}
