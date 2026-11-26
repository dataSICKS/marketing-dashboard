import type { DeliveryEvent } from "./ma-deliveries-supabase.js";
import type { OptoutRow } from "./newsletter-types.js";

/**
 * MAのシナリオを「一斉配信」と「ステップ配信」に分ける。
 *
 * **CSVにもDBにも種別のフラグが無い**（`シナリオ説明` は空）。判別できるのは
 * **配信日の広がり**だけ。一斉配信は1〜2日に全部出し切り、ステップ配信は顧客ごとに
 * 起動するので何ヶ月にも分散する。
 *
 * **ノード数や「1人あたり通数」では判別できない。** ステップでも1ノード・1通/人の
 * シナリオが多数あり（起点日からN日後に1通だけ送る形）、逆に一斉配信でも
 * セグメント別にノードが分かれていることがある。
 *
 * 混ぜてはいけない理由: 2026-05-31の一斉配信は11.2万人＝ほぼ全顧客に当たっているため、
 * オプトアウト者との一致率は上がるが、それは「誰にでも当たるから」であって
 * どのメールが解除を生んだかの証拠にはならない。
 *
 * 実行時importを持たない（型のみ）ので単体で試験できる。
 */

export type ScenarioKind = "blast" | "step";

/** 配信がこの日数以内に収まっていれば一斉配信とみなす。 */
export const BLAST_MAX_SPAN_DAYS = 3;

const DAY_MS = 86400000;

const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export interface ScenarioSummary {
  scenarioName: string;
  kind: ScenarioKind;
  deliveries: number;
  customers: number;
  /** 1顧客あたりの通数。判別には使わないが、種別の妥当性を画面で確かめられるように出す。 */
  perCustomer: number;
  nodes: number;
  firstDate: string;
  lastDate: string;
  spanDays: number;
}

export function summarizeScenarios(events: readonly DeliveryEvent[]): ScenarioSummary[] {
  const acc = new Map<string, { customers: Set<string>; nodes: Set<string>; dates: string[] }>();
  for (const event of events) {
    const name = event.scenarioName || "(シナリオ名なし)";
    const entry = acc.get(name) ?? { customers: new Set<string>(), nodes: new Set<string>(), dates: [] };
    entry.customers.add(event.customerCode);
    entry.nodes.add(event.nodeId);
    entry.dates.push(event.date);
    acc.set(name, entry);
  }
  return [...acc]
    .map(([scenarioName, entry]) => {
      const dates = entry.dates.sort();
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      const spanDays = dayDiff(firstDate, lastDate) + 1;
      return {
        scenarioName,
        kind: (spanDays <= BLAST_MAX_SPAN_DAYS ? "blast" : "step") as ScenarioKind,
        deliveries: dates.length,
        customers: entry.customers.size,
        perCustomer: entry.customers.size ? dates.length / entry.customers.size : 0,
        nodes: entry.nodes.size,
        firstDate,
        lastDate,
        spanDays,
      };
    })
    .sort((a, b) => b.deliveries - a.deliveries);
}

export function scenarioKinds(summaries: readonly ScenarioSummary[]): Map<string, ScenarioKind> {
  return new Map(summaries.map((item) => [item.scenarioName, item.kind]));
}

/** 指定した種別の配信だけを残す。シナリオ名が一覧に無いものは step 扱い（長期配信の可能性が高い）。 */
export function filterByKind(
  events: readonly DeliveryEvent[],
  kinds: ReadonlyMap<string, ScenarioKind>,
  keep: ScenarioKind,
): DeliveryEvent[] {
  return events.filter((event) => (kinds.get(event.scenarioName || "(シナリオ名なし)") ?? "step") === keep);
}

export interface BlastDay {
  date: string;
  /** 配信初日からの経過日数。 */
  offset: number;
  optouts: number;
}

export interface BlastResponse {
  scenarioName: string;
  sendFrom: string;
  sendTo: string;
  deliveries: number;
  customers: number;
  /** 配信前28日のオプトアウト件数の中央値。比較の基準線。 */
  baselineDaily: number;
  /** 配信初日の前3日から後7日まで。 */
  daily: BlastDay[];
  /** 配信初日〜+3日の合計。 */
  windowOptouts: number;
  /** 同じ日数を平常日の基準線で置き換えた期待値。 */
  expectedOptouts: number;
  excessOptouts: number;
  /** 超過ぶんを配信数で割ったもの。「この一斉配信で増えた解除の率」。 */
  excessRate: number;
}

const WINDOW_DAYS = 4;   // 配信初日＋3日
const BEFORE_DAYS = 3;   // 表に出す配信前の日数
const AFTER_DAYS = 7;    // 表に出す配信後の日数
const BASELINE_DAYS = 28;

/**
 * これ未満の一斉配信は効果を測らない。
 *
 * 配信数が日々の解除の揺れより小さいと、超過ぶんは配信と無関係な変動をそのまま拾う。
 * 実データのテスト配信（2通）は、同じ窓に本番の一斉配信が入ったせいで超過率29550%になった。
 * シナリオ一覧には残すので、配信があった事実は消えない。
 */
const MIN_BLAST_DELIVERIES = 100;

/**
 * 一斉配信ごとに、配信日を起点にした日別のオプトアウトを出す。
 *
 * 一斉配信は全員に同じ日に届くので、**配信日からの経過日数でしか効果が見えない**。
 * ステップ配信と同じ「何通目」の枠では測れないため、別の形にしている。
 */
export function blastResponses(
  summaries: readonly ScenarioSummary[],
  optouts: readonly OptoutRow[],
  options: { excludeDates?: readonly string[] } = {},
): BlastResponse[] {
  const excluded = new Set(options.excludeDates ?? []);
  const perDay = new Map<string, number>();
  for (const row of optouts) {
    const date = (row.optoutDate ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || excluded.has(date)) continue;
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
  }
  const count = (date: string) => perDay.get(date) ?? 0;

  return summaries
    .filter((item) => item.kind === "blast" && item.deliveries >= MIN_BLAST_DELIVERIES)
    .map((item) => {
      const baselineDays: number[] = [];
      for (let back = 1; back <= BASELINE_DAYS; back++) {
        const date = addDays(item.firstDate, -back);
        if (!excluded.has(date)) baselineDays.push(count(date));
      }
      const baselineDaily = median(baselineDays);
      const daily: BlastDay[] = [];
      for (let offset = -BEFORE_DAYS; offset <= AFTER_DAYS; offset++) {
        const date = addDays(item.firstDate, offset);
        daily.push({ date, offset, optouts: count(date) });
      }
      let windowOptouts = 0;
      for (let offset = 0; offset < WINDOW_DAYS; offset++) windowOptouts += count(addDays(item.firstDate, offset));
      const expectedOptouts = Math.round(baselineDaily * WINDOW_DAYS);
      const excessOptouts = windowOptouts - expectedOptouts;
      return {
        scenarioName: item.scenarioName,
        sendFrom: item.firstDate,
        sendTo: item.lastDate,
        deliveries: item.deliveries,
        customers: item.customers,
        baselineDaily,
        daily,
        windowOptouts,
        expectedOptouts,
        excessOptouts,
        excessRate: item.deliveries > 0 ? excessOptouts / item.deliveries : 0,
      };
    })
    .sort((a, b) => b.deliveries - a.deliveries);
}
