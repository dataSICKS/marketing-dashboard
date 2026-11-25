/**
 * 2026-11-24に切り替えた「診断シナリオ」の工程定義と、配信URL名の読み取り。
 *
 * **工程の到達人数はタグからしか分からない。** LINY APIに配信実績のエンドポイントが
 * 無いため（配信数・開封・クリックは取得不能）。しかも今のシナリオは各通にタグを
 * 付けていないので、Dayごとの到達は「友だち追加日 + N日 が今日までに来たか」で**理論値**として出す。
 * 実配信数ではないことを画面に必ず出す。
 *
 * 分子のCVはECforce由来（パラメータURLの識別子単位）。友だち単位では突き合わせられない。
 *
 * 実行時importを持たない（型のみ）ので単体で試験できる。
 */

/** 配信URLのメッセージパック名。例 `20d_q3_毛先広がり_shindan` / `4d_all_選ばれる理由_shindan` */
const SHINDAN_PACK = /^(\d+)d_(all|q1|q2|q3|result)_(.+)_shindan$/;

export type ShindanBranch = "all" | "q1" | "q2" | "q3" | "result";

export interface ShindanPack {
  day: number;
  branch: ShindanBranch;
  /** 配信内容の名前。分岐つきの工程では選択肢に対応する */
  content: string;
}

/** 診断シナリオの配信か判定して Day と分岐を取り出す。旧シナリオのURLは null を返す。 */
export function parseShindanPack(pack: string | null | undefined): ShindanPack | null {
  const match = SHINDAN_PACK.exec((pack ?? "").trim());
  if (!match) return null;
  const day = Number(match[1]);
  if (!Number.isInteger(day) || day < 0 || day > 365) return null;
  return { day, branch: match[2] as ShindanBranch, content: match[3] };
}

/**
 * Figmaのフロー図どおりの工程。配信URLの登録とも一致している（2026-11-26に27本で照合）。
 * `amagift` はアマギフQR経路にも同じ内容が流れる工程。診断の分岐はアマギフ経路には無い。
 */
export interface ScenarioStep {
  day: number;
  branch: ShindanBranch;
  label: string;
  amagift: boolean;
}

export const SCENARIO_STEPS: readonly ScenarioStep[] = [
  { day: 0, branch: "result", label: "診断結果", amagift: false },
  { day: 2, branch: "q1", label: "Q1の悩みに答える", amagift: false },
  { day: 4, branch: "all", label: "選ばれる理由", amagift: true },
  { day: 7, branch: "q2", label: "Q2の磨き方に答える", amagift: false },
  { day: 11, branch: "all", label: "定期便紹介", amagift: true },
  { day: 15, branch: "all", label: "定期便FAQ", amagift: true },
  { day: 18, branch: "all", label: "定期訴求", amagift: true },
  { day: 20, branch: "q3", label: "Q3の交換頻度に答える", amagift: false },
  { day: 22, branch: "all", label: "定期訴求", amagift: true },
  { day: 24, branch: "all", label: "UGC＆定期訴求", amagift: true },
  { day: 25, branch: "all", label: "定期引き上げラスト", amagift: true },
] as const;

/**
 * 診断タグ名 → 配信URLの分岐名。タグ側とURL側で言葉が違うので突き合わせが要る。
 *
 * `evidence` は根拠。`figma` はFigmaの診断画面の選択肢と照合できたもの、
 * `elimination` は他が確定した結果の消去法。**消去法のものは画面に印をつける。**
 */
export interface BranchMapping {
  /** LINYのタグ名（`診断Q1：` 以降） */
  tag: string;
  /** 配信URLの content 部分 */
  content: string;
  /** 診断画面での選択肢の文言 */
  choice: string;
  evidence: "figma" | "elimination";
}

export const BRANCH_MAPPINGS: Readonly<Record<"q1" | "q2" | "q3", readonly BranchMapping[]>> = {
  // 診断1「普段の歯磨きで1番気になることとは？」
  q1: [
    { tag: "磨き残し対策", content: "磨き残し対策", choice: "歯と歯の間・奥歯の磨き残し", evidence: "figma" },
    { tag: "力を入れすぎない歯磨き", content: "歯茎ケア", choice: "歯ぐきを傷めないか", evidence: "figma" },
    { tag: "ラクに続ける歯磨き", content: "ラクしたい", choice: "歯みがきを手軽にしたい", evidence: "figma" },
    { tag: "歯ブラシ交換習慣", content: "しっかり派", choice: "特に悩みなし", evidence: "elimination" },
  ],
  // 診断2（磨き方の悩み）
  q2: [
    { tag: "力を入れて磨いてしまう", content: "力入りすぎ", choice: "力を入れて磨いてしまう", evidence: "figma" },
    { tag: "ちゃんと磨けているか不安", content: "丁寧不安", choice: "ちゃんと磨けているか不安", evidence: "figma" },
    { tag: "時間をかけない", content: "ラクしたい", choice: "時間をかけない", evidence: "figma" },
    { tag: "意識したことがない", content: "特になし", choice: "意識したことがない", evidence: "figma" },
  ],
  // 診断3「今使っている歯ブラシ、どのくらいで交換していますか？」
  q3: [
    { tag: "毛先が開いて", content: "毛先広がり", choice: "毛先が開いてきたら", evidence: "figma" },
    { tag: "覚えてない", content: "交換時期忘れ", choice: "いつ交換したかあまり覚えていない", evidence: "figma" },
    { tag: "2〜3ヶ月", content: "同じ歯ブラシ", choice: "2〜3か月くらい", evidence: "elimination" },
    { tag: "1ヶ月", content: "交換サイン", choice: "1か月くらい", evidence: "elimination" },
  ],
} as const;

/** `診断Q1：磨き残し対策` のようなタグ名から設問と選択肢を取り出す。 */
export function parseSurveyTag(name: string): { question: "q1" | "q2" | "q3" | "q4" | "q5"; choice: string } | null {
  const match = /^診断Q([1-5])[：:](.+)$/.exec(name.trim());
  if (!match) return null;
  return { question: `q${match[1]}` as "q1" | "q2" | "q3" | "q4" | "q5", choice: match[2].trim() };
}

/** `診断3回答` のようなタグ名から「何問目まで答えたか」を取り出す。 */
export function parseSurveyProgressTag(name: string): number | null {
  const match = /^診断([1-5])回答$/.exec(name.trim());
  return match ? Number(match[1]) : null;
}

const DAY_MS = 86400000;

/** その友だちが基準時刻までに Day N に到達しているか（追加日 + N日）。 */
export function hasReachedDay(createdAt: string, day: number, asOf: string): boolean {
  const added = Date.parse(createdAt);
  const limit = Date.parse(asOf);
  if (Number.isNaN(added) || Number.isNaN(limit)) return false;
  return added + day * DAY_MS <= limit;
}

/** 対称の前後窓。基準日から後ろに経過した日数ぶんだけ、前にも窓を取る。 */
export interface PivotWindows {
  before: { from: string; to: string };
  after: { from: string; to: string };
  /** 窓の日数。前後で必ず同じにする（揃えないとブロック率も追加数も比べられない） */
  days: number;
}

export function pivotWindows(pivot: string, asOf: string): PivotWindows | null {
  const start = Date.parse(`${pivot}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const days = Math.floor((end - start) / DAY_MS) + 1;
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  return {
    before: { from: iso(start - days * DAY_MS), to: iso(start - DAY_MS) },
    after: { from: pivot, to: iso(start + (days - 1) * DAY_MS) },
    days,
  };
}
