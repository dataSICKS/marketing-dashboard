import type {
  OptoutMailAnalysis,
  OptoutMailFrequencyBucket,
  OptoutMailNodeItem,
  OptoutMailSequenceBucket,
  OptoutMailLtvCohort,
} from "@workspace/api-zod";
import type { DeliverySnapshot, DeliveryEvent } from "./ma-deliveries-supabase.js";
import type { NewsletterRow } from "./newsletter-types.js";
import type { LtvRow } from "./ltv-types.js";
import type { OptoutRow } from "./newsletter-types.js";

/**
 * 「配信とオプトアウトの関係」をハザード率で出す。
 *
 * 全体を通しての約束事:
 *
 * - **解除日当日の配信は「解除前」に数えない。** 解除日は日次スナップショットから推定した日付で、
 *   同じ日の中の前後が分からない（`optout-date-precision` のメモ参照）。
 * - **分母を必ず持つ。** 件数だけでは「よく送るテンプレ」が常に悪く見える。
 * - **コホートを `optoutFrom` 以降に初めて配信された顧客に限る。** オプトアウトのデータは
 *   2025-12-31 以降しかないため、それ以前に配信が始まった顧客は「解除したが見えない」状態が混ざる。
 */

/** テンプレートがMA側で削除されると名称が失われるので、シナリオ名とノードで見分ける。 */
const DELETED_TEMPLATE = "削除されたテンプレート";

const DAY_MS = 86400000;

/**
 * 日付は `YYYY-MM-DD` に正規化済みで渡す約束にしている（表記ゆれの吸収は呼び出し側の
 * `normalizeAnalysisDate`）。ここでは形だけ確かめ、崩れている値は黙って捨てずに集計から外す。
 * この約束のおかげで、このファイルは他のモジュールを実行時に読み込まずに単体で試験できる。
 */
const asDate = (value: string | null | undefined): string | null =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

const dayDiff = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** 月末日。コホートの成熟判定に使う。 */
const monthEnd = (month: string): string => {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, index, 0)).toISOString().slice(0, 10);
};

const FREQUENCY_BUCKETS: { bucket: OptoutMailFrequencyBucket["bucket"]; label: string; max: number }[] = [
  { bucket: "d0_3", label: "0-3日", max: 3 },
  { bucket: "d4_7", label: "4-7日", max: 7 },
  { bucket: "d8_14", label: "8-14日", max: 14 },
  { bucket: "d15_30", label: "15-30日", max: 30 },
  { bucket: "d31_plus", label: "31日以上", max: Infinity },
];

const bucketOf = (gap: number) => FREQUENCY_BUCKETS.find((item) => gap <= item.max) ?? FREQUENCY_BUCKETS.at(-1)!;

const rate = (numerator: number, denominator: number): number => (denominator > 0 ? numerator / denominator : 0);

const mean = (values: number[]): number =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * 個票（`ma_deliveries`）が集計側（`newsletter_rows`）の何割を覆っているかを出す。
 *
 * MAのCSVはシナリオ1本ずつ手で書き出すため、書き出していないシナリオの配信は個票に存在しない。
 * そのぶん顧客の受信通数が実際より少なく見え、「何通目」も前にずれる。
 * どのシナリオを出し直せばよいかを画面に出せるように、テンプレート名で突き合わせる。
 */
export function coverageAgainstAggregate(
  deliveries: DeliverySnapshot,
  aggregate: readonly NewsletterRow[],
  normalizeDate: (value: string) => string | null,
) {
  const from = deliveries.from;
  const to = deliveries.to;
  if (!from || !to) return { aggregateDeliveries: null, coverageRatio: null, missingScenarios: [] };
  const haveTemplates = new Set(deliveries.events.map((event) => event.templateName));
  const total = new Map<string, { deliveries: number; missingDeliveries: number }>();
  let aggregateDeliveries = 0;
  for (const row of aggregate) {
    const date = normalizeDate(row.deliveryDate);
    // 個票が覆っている期間だけで比べる。期間外を入れると網羅率が実際より低く出る。
    if (!date || date < from || date > to) continue;
    const count = row.deliveryCount || 0;
    aggregateDeliveries += count;
    const entry = total.get(row.scenarioName) ?? { deliveries: 0, missingDeliveries: 0 };
    entry.deliveries += count;
    if (!haveTemplates.has(row.templateName)) entry.missingDeliveries += count;
    total.set(row.scenarioName, entry);
  }
  const missingScenarios = [...total]
    .filter(([, entry]) => entry.missingDeliveries > 0)
    .map(([scenarioName, entry]) => ({ scenarioName, ...entry }))
    .sort((a, b) => b.missingDeliveries - a.missingDeliveries);
  return {
    aggregateDeliveries,
    coverageRatio: aggregateDeliveries > 0 ? deliveries.events.length / aggregateDeliveries : null,
    missingScenarios,
  };
}

export interface OptoutMailOptions {
  minEvents?: number;
  /**
   * オプトアウトのデータが始まる日。コホートの境目に使う。
   * 「いちばん早い解除日」で代用すると、たまたま解除が遅い抽出だったときに
   * 全員が除外されてしまうので、抽出条件として分かっている日を渡す。
   * 省略時は観測された最小の解除日にする。
   */
  optoutDataFrom?: string;
  /** 頻度の比較を出す通目。生存者と新規を混ぜないため通目ごとに分けて見る。 */
  frequencySequences?: number[];
  /** ノードを通目で層別して比べる範囲。 */
  nodeSequences?: number[];
  /** 成熟判定の基準日。既定は実行日。 */
  today?: string;
}

interface NodeAccumulator {
  templateName: string;
  nodeId: string;
  scenarioName: string;
  events: number;
  customers: Set<string>;
  churned: number;
  sequences: number[];
}

/** 同じテンプレ名が複数ノードで使われている場合があるので、必要なときだけノードを足して見分ける。 */
function buildLabels(source: Iterable<NodeAccumulator>): Map<string, string> {
  // イテレータは一度回すと空になるので、2周する前に配列にしておく。
  const nodes = [...source];
  const byTemplate = new Map<string, number>();
  for (const node of nodes) {
    if (node.templateName === DELETED_TEMPLATE) continue;
    byTemplate.set(node.templateName, (byTemplate.get(node.templateName) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const node of nodes) {
    const short = node.nodeId.slice(0, 8);
    const label = node.templateName === DELETED_TEMPLATE
      ? `${node.scenarioName || "シナリオ不明"}／テンプレ削除済 ${short}`
      : (byTemplate.get(node.templateName) ?? 0) > 1
        ? `${node.templateName}（${short}）`
        : node.templateName || `テンプレート名なし ${short}`;
    labels.set(`${node.templateName}\u0000${node.nodeId}`, label);
  }
  return labels;
}

const toItem = (node: NodeAccumulator, label: string): OptoutMailNodeItem => ({
  label,
  templateName: node.templateName,
  nodeId: node.nodeId,
  scenarioName: node.scenarioName,
  events: node.events,
  customers: node.customers.size,
  churned: node.churned,
  hazard: rate(node.churned, node.events),
  medianSequence: median(node.sequences),
});

/** 顧客ごとの購入。複数定期があるときは最も早い初回購入月の定期に寄せ、二重計上しない。 */
function firstSubscriptionByCustomer(purchases: readonly LtvRow[]) {
  const first = new Map<string, { month: string; ltv95: number; ltv180: number; ltv365: number }>();
  for (const row of purchases) {
    const code = row.customerCode.trim();
    const month = asDate(row.firstOrderMonth)?.slice(0, 7);
    if (!code || !month) continue;
    const current = first.get(code);
    if (!current || month < current.month) {
      first.set(code, { month, ltv95: row.ltv95, ltv180: row.ltv180, ltv365: row.ltv365 });
    }
  }
  return first;
}

interface CohortRow {
  ltv95: number;
  ltv180: number;
  ltv365: number;
}

function ltvCohorts(
  purchases: readonly LtvRow[],
  optedOut: ReadonlySet<string>,
  today: string,
): OptoutMailLtvCohort[] {
  const groups = new Map<string, { without: CohortRow[]; with: CohortRow[] }>();
  for (const [code, entry] of firstSubscriptionByCustomer(purchases)) {
    const group = groups.get(entry.month) ?? { without: [] as CohortRow[], with: [] as CohortRow[] };
    (optedOut.has(code) ? group.with : group.without).push(entry);
    groups.set(entry.month, group);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohortMonth, group]) => {
      const total = group.with.length + group.without.length;
      const end = monthEnd(cohortMonth);
      return {
        cohortMonth,
        withoutCount: group.without.length,
        withoutLtv95: mean(group.without.map((row) => row.ltv95)),
        withoutLtv180: mean(group.without.map((row) => row.ltv180)),
        withoutLtv365: mean(group.without.map((row) => row.ltv365)),
        withCount: group.with.length,
        withLtv95: mean(group.with.map((row) => row.ltv95)),
        withLtv180: mean(group.with.map((row) => row.ltv180)),
        withLtv365: mean(group.with.map((row) => row.ltv365)),
        optoutRate: rate(group.with.length, total),
        mature180: addDays(end, 180) <= today,
        mature365: addDays(end, 365) <= today,
      };
    });
}

export function analyzeOptoutMail(
  deliveries: DeliverySnapshot,
  optouts: readonly OptoutRow[],
  purchases: readonly LtvRow[],
  options: OptoutMailOptions = {},
  metadata: {
    purchaseSyncedAt: string | null;
    fetchedAt: string;
    coverage?: ReturnType<typeof coverageAgainstAggregate>;
  },
): OptoutMailAnalysis {
  const minEvents = Math.max(1, Math.trunc(options.minEvents ?? 200));
  const frequencySequences = options.frequencySequences ?? [2, 3, 4];
  const nodeSequences = options.nodeSequences ?? [1, 2, 3];
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  // 同じ顧客が複数回オフにしている場合は最初の1回だけを見る。
  const optoutDate = new Map<string, string>();
  const optoutDates: string[] = [];
  for (const row of optouts) {
    const code = row.customerCode.trim();
    const date = asDate(row.optoutDate);
    if (!code || !date) continue;
    const current = optoutDate.get(code);
    if (!current || date < current) optoutDate.set(code, date);
    optoutDates.push(date);
  }
  optoutDates.sort();
  const observedFrom = optoutDates[0] ?? null;
  const optoutFrom = asDate(options.optoutDataFrom) ?? observedFrom;

  const byCustomer = new Map<string, DeliveryEvent[]>();
  for (const event of deliveries.events) {
    const list = byCustomer.get(event.customerCode) ?? [];
    list.push(event);
    byCustomer.set(event.customerCode, list);
  }

  const sequenceReached = new Map<number, number>();
  const sequenceChurned = new Map<number, number>();
  const nodes = new Map<string, NodeAccumulator>();
  const nodesBySequenceAcc = new Map<number, Map<string, NodeAccumulator>>();
  const frequencyAcc = new Map<number, Map<string, { events: number; churned: number }>>();
  let cohortCustomers = 0;
  let cohortOptouts = 0;
  let excludedEarlyCustomers = 0;
  let undecidableSameDay = 0;
  let undecidableNoHistory = 0;

  for (const [customerCode, list] of byCustomer) {
    // 日付が同じ場合もノードIDで並びを固定し、集計が実行ごとにぶれないようにする。
    list.sort((a, b) => a.date.localeCompare(b.date) || a.nodeId.localeCompare(b.nodeId));
    // オプトアウトのデータより前から配信が始まっている顧客は「解除が見えない」可能性が残る。
    if (optoutFrom && list[0].date < optoutFrom) {
      excludedEarlyCustomers++;
      continue;
    }
    cohortCustomers++;
    const optedOutAt = optoutDate.get(customerCode) ?? null;
    // 解除日当日と以降の配信は「解除前に届いた」とは言えないので、母数から外す。
    const atRisk = optedOutAt ? list.filter((event) => event.date < optedOutAt) : list;

    for (let index = 1; index <= atRisk.length; index++) {
      sequenceReached.set(index, (sequenceReached.get(index) ?? 0) + 1);
    }
    if (optedOutAt) {
      cohortOptouts++;
      if (atRisk.length > 0) {
        sequenceChurned.set(atRisk.length, (sequenceChurned.get(atRisk.length) ?? 0) + 1);
      } else if (list.some((event) => event.date === optedOutAt)) {
        undecidableSameDay++;
      } else {
        undecidableNoHistory++;
      }
    }

    atRisk.forEach((event, index) => {
      const sequence = index + 1;
      const isLast = optedOutAt !== null && index === atRisk.length - 1;
      const key = `${event.templateName}\u0000${event.nodeId}`;
      const node = nodes.get(key) ?? {
        templateName: event.templateName, nodeId: event.nodeId, scenarioName: event.scenarioName,
        events: 0, customers: new Set<string>(), churned: 0, sequences: [],
      };
      node.events++;
      node.customers.add(customerCode);
      node.sequences.push(sequence);
      if (isLast) node.churned++;
      nodes.set(key, node);

      if (nodeSequences.includes(sequence)) {
        const perSequence = nodesBySequenceAcc.get(sequence) ?? new Map<string, NodeAccumulator>();
        const stratified = perSequence.get(key) ?? {
          templateName: event.templateName, nodeId: event.nodeId, scenarioName: event.scenarioName,
          events: 0, customers: new Set<string>(), churned: 0, sequences: [],
        };
        stratified.events++;
        stratified.customers.add(customerCode);
        stratified.sequences.push(sequence);
        if (isLast) stratified.churned++;
        perSequence.set(key, stratified);
        nodesBySequenceAcc.set(sequence, perSequence);
      }

      // 頻度は「同じ通目の中で」だけ比べる。通目をまたぐと、密に受け取っている人＝
      // すでに解除しなかった人に偏り、送るほど解除が減るという逆の結論が出る。
      if (sequence >= 2 && frequencySequences.includes(sequence)) {
        const gap = dayDiff(atRisk[index - 1].date, event.date);
        const { bucket } = bucketOf(gap);
        const perSequence = frequencyAcc.get(sequence) ?? new Map<string, { events: number; churned: number }>();
        const current = perSequence.get(bucket) ?? { events: 0, churned: 0 };
        current.events++;
        if (isLast) current.churned++;
        perSequence.set(bucket, current);
        frequencyAcc.set(sequence, perSequence);
      }
    });
  }

  const labels = buildLabels(nodes.values());
  const labelOf = (node: NodeAccumulator) => labels.get(`${node.templateName}\u0000${node.nodeId}`) ?? node.templateName;

  let cumulative = 0;
  const sequence: OptoutMailSequenceBucket[] = [...sequenceReached.keys()]
    .sort((a, b) => a - b)
    .map((position) => {
      const reached = sequenceReached.get(position) ?? 0;
      const churned = sequenceChurned.get(position) ?? 0;
      cumulative += churned;
      return {
        sequence: position,
        reached,
        churned,
        hazard: rate(churned, reached),
        cumulativeShare: rate(cumulative, cohortCustomers),
      };
    });

  const listed = [...nodes.values()].filter((node) => node.events >= minEvents);
  const notes = [
    "届いた1通として数えるのは配信方法が「メール」かつ配信ステータスが「完了」の記録だけです。配信不可・スキップは受信していないものとして除きます。",
    "解除日は日次の購読状態の変化から推定した日付で、操作日時ではありません。同じ日の中の前後が分からないため、解除日当日とそれ以降の配信は母数からも外しています。",
    `集計対象はオプトアウトのデータが始まる${optoutFrom ?? "—"}以降に初めて配信された顧客だけです。それより前から配信が始まっている顧客は、解除していても記録に出てこない可能性があるため除いています。`,
    "ハザードは「その通数に到達した顧客」を分母にした、その時点で解除する率です。件数の多いテンプレートが常に悪く見えるのを避けるため、どの表も分母を併記しています。",
    "ノード別の率は配信イベント単位です。同じテンプレート名が複数のノードで使われている場合は、ノードIDを付けて区別します。MAでテンプレートが削除されたものは名称が残っていないため、シナリオ名とノードIDで表示します。",
    "通目を揃えた比較（1通目だけ、2通目だけ…）は、テンプレートの中身の差を配信順の差から切り離すためのものです。全体の表と率が違うのは当然で、こちらのほうが内容の比較には適しています。",
    "頻度は同じ通目の中だけで比べています。通目をまたいで比べると、密に受け取り続けている顧客＝まだ解除していない顧客に偏るため、送るほど解除が減るという逆向きの結論が出ます。",
    "オプトアウトの出所はECforce会員の購読フラグの変化です。メルマガのリンクから解除した人だけでなく、マイページやCS対応で切った人も含みます。メール起因だけを切り出した値ではありません。",
    "LTVの比較は顧客単位で、複数定期がある顧客は最も早い初回購入月の定期に寄せています。解除者のLTVが低いとしても、配信を止めたから下がったのか、解約したついでに配信も止めたのかは、このデータでは区別できません。",
    "MAの保持期間は約13ヶ月で、取得できている配信履歴はそれ以降に限られます。顧客の生涯での累計通数ではありません。",
    "MAのCSVはシナリオ1本ずつ手で書き出すため、書き出していないシナリオの配信は個票に存在しません。網羅率が100%でない間は、「何通目」は取得できている配信の中での順番であり、実際にはそれより前に別のシナリオのメールが届いている可能性があります。",
  ];

  return {
    coverage: {
      deliveryFrom: deliveries.from,
      deliveryTo: deliveries.to,
      optoutFrom,
      optoutTo: optoutDates.at(-1) ?? null,
      deliveryEvents: deliveries.events.length,
      deliveryCustomers: byCustomer.size,
      cohortCustomers,
      cohortOptouts,
      excludedEarlyCustomers,
      undecidableSameDay,
      undecidableNoHistory,
      aggregateDeliveries: metadata.coverage?.aggregateDeliveries ?? null,
      coverageRatio: metadata.coverage?.coverageRatio ?? null,
      purchaseSyncedAt: metadata.purchaseSyncedAt,
      fetchedAt: metadata.fetchedAt,
    },
    missingScenarios: metadata.coverage?.missingScenarios ?? [],
    sequence,
    nodes: listed.map((node) => toItem(node, labelOf(node))).sort((a, b) => b.hazard - a.hazard || b.events - a.events),
    lowVolumeNodes: nodes.size - listed.length,
    nodesBySequence: nodeSequences.map((position) => ({
      sequence: position,
      items: [...(nodesBySequenceAcc.get(position)?.values() ?? [])]
        .filter((node) => node.events >= minEvents)
        .map((node) => toItem(node, labelOf(node)))
        .sort((a, b) => b.hazard - a.hazard || b.events - a.events),
    })),
    frequency: frequencySequences.map((position) => ({
      sequence: position,
      buckets: FREQUENCY_BUCKETS
        .map(({ bucket, label }) => {
          const current = frequencyAcc.get(position)?.get(bucket) ?? { events: 0, churned: 0 };
          return { bucket, label, events: current.events, churned: current.churned, hazard: rate(current.churned, current.events) };
        })
        .filter((item) => item.events > 0),
    })),
    ltvCohorts: ltvCohorts(purchases, new Set(optoutDate.keys()), today),
    notes,
  };
}
