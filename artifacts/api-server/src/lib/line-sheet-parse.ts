/**
 * LINE実績レポート（`O2O×SICKS／LINE実績レポート`）の読み取り。
 *
 * **このファイルは実行時importを持たない。** `node --experimental-strip-types --test` は
 * `./x.js` を `x.ts` に読み替えないため、純粋ロジックをここに集めてローカルで試験できるようにしている
 * （認証まわりと同じ方針。CODE.md参照）。Supabase や Sheets の通信は `line-sheets.ts` 側。
 *
 * 前半＝`日実績` タブ（経路ゾーン×指標の109列）。後半＝配信別（パラメURL × CV）。
 *
 * ---
 *
 * `日実績` タブの列構成。
 *
 * **列は見出し文字列ではなく位置で読む。** 元シートの見出しはセル内改行が入っていて
 * （コスフェス大阪・福岡のブロック率と残存だけ改行位置が違う）、文字列で照合すると外れる。
 * 代わりに、シートの用語タブが保証している**検算式**で読み取りの正しさを確認する（`verifyLineRow`）。
 *
 * 1行 = 1日 × 109列。ゾーンが左から右へ粒度の細かい順に並ぶ。
 * 新しい流入経路が増えるとゾーンが挿入されるので、列数が変わったら気づけるようにする。
 */

export const LINE_ROW_LENGTH = 109;

/** ゾーンが持つ指標の形。経路によって持つ列が違う。 */
export type LineZoneKind =
  /** 残高10列のみ（CVを取らない経路） */
  | "base"
  /** 残高10列 ＋ LPアクセス・CV・CVR(LP)・サブスク転換率 */
  | "full"
  /** 残高10列 ＋ CV・サブスク転換率（LPアクセスに対応する母集団が無い） */
  | "tagged"
  /** 残高10列 ＋ シナリオ分類2列 ＋ LPアクセス以下4列 */
  | "qr"
  /** LPアクセス・CV・CVR(LP) のみ（友だちの残高を持たない経路） */
  | "cvOnly";

export interface LineZone {
  key: string;
  label: string;
  /** 0起点の開始列。A列=0（日付）なので全体はB=1から。 */
  start: number;
  kind: LineZoneKind;
}

/** 用語タブ⑤のゾーンレンジと一致させている。順序も画面の並び順に使う。 */
export const LINE_ZONES: readonly LineZone[] = [
  { key: "overall", label: "全体", start: 1, kind: "full" },
  { key: "tagged", label: "タグ計", start: 15, kind: "tagged" },
  { key: "qrNew", label: "新QR", start: 27, kind: "qr" },
  { key: "qrOld", label: "旧QR", start: 43, kind: "qr" },
  { key: "site", label: "ブランドサイト", start: 59, kind: "full" },
  { key: "noah", label: "NOAH", start: 73, kind: "base" },
  { key: "cosfesOsaka", label: "コスフェス大阪", start: 83, kind: "base" },
  { key: "cosfesFukuoka", label: "コスフェス福岡", start: 93, kind: "base" },
  { key: "richMenu", label: "リッチメニュー", start: 103, kind: "cvOnly" },
  { key: "other", label: "他経路", start: 106, kind: "cvOnly" },
] as const;

/** ゾーン内の相対位置。率の列は読まずに自分で計算する（分母を持つ形にそろえるため）。 */
const OFFSETS = {
  base: { people: 0, newCount: 1, instantBlock: 2, blockDelta: 4, blockTotal: 5, active: 7 },
  extra: {
    base: {},
    full: { lpAccess: 10, cv: 11 },
    tagged: { cv: 10 },
    qr: { scenarioCount: 10, lpAccess: 12, cv: 13 },
    cvOnly: { lpAccess: 0, cv: 1 },
  },
} as const;

export interface LineZoneMetrics {
  zone: string;
  /** 保有者数の合計。ブロック済みも含むので「累計流入」に近い。 */
  people: number | null;
  /** その日に新しく友だちになった実数（created_atベース）。翌朝確定。 */
  newCount: number | null;
  /** その日の新規のうち翌朝時点でブロックしていた人数。 */
  instantBlock: number | null;
  /** ブロック累計の前日差（ブロック日時が無いための代理値）。 */
  blockDelta: number | null;
  blockTotal: number | null;
  /** 人数 − ブロック累計。KPIの「友だち数」はこれ。 */
  active: number | null;
  /** セグメント分類できている人数（新QR・旧QRのみ）。 */
  scenarioCount: number | null;
  /** 識別子ベースのLP到達数。友だち追加でもメッセージ開封でもない。 */
  lpAccess: number | null;
  /** LINE経由のサブスク登録数（ECforce由来）。 */
  cv: number | null;
}

export interface LineDailyRow {
  date: string;
  zones: LineZoneMetrics[];
}

/** `50,920` `28.10%` `` → 数値。空欄は null にする（0と区別する）。 */
export function parseLineNumber(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (text === "" || text === "-" || text === "#N/A" || text === "#DIV/0!") return null;
  const percent = text.endsWith("%");
  const cleaned = text.replace(/[,¥\s]/g, "").replace(/%$/, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return percent ? parsed / 100 : parsed;
}

/**
 * `2026/11/23` `2026-11-23` `46349`（シートの連番）→ `2026-11-23`。解釈できない値は null。
 *
 * 連番に対応しているのは、値を `UNFORMATTED_VALUE` で取るため。
 * 表示形式のままだと `2月1日` のように**年が落ちた文字列**で返ってくるタブがあり、
 * どの年か決められない。連番なら年が確定する。
 */
export function parseLineDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const serial = Number(text);
    // 1=1899-12-31。1万未満（1927年より前）や10万超は日付ではなく件数の取り違え。
    if (serial < 10000 || serial > 100000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
  }
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function parseLineRow(row: readonly unknown[]): LineDailyRow | null {
  const date = parseLineDate(row[0]);
  if (!date) return null;
  const at = (index: number) => parseLineNumber(row[index]);
  const zones = LINE_ZONES.map((zone): LineZoneMetrics => {
    const extra = OFFSETS.extra[zone.kind] as Partial<Record<string, number>>;
    const pick = (name: string) => {
      const offset = extra[name];
      return offset === undefined ? null : at(zone.start + offset);
    };
    if (zone.kind === "cvOnly") {
      return {
        zone: zone.key, people: null, newCount: null, instantBlock: null, blockDelta: null,
        blockTotal: null, active: null, scenarioCount: null,
        lpAccess: pick("lpAccess"), cv: pick("cv"),
      };
    }
    const base = OFFSETS.base;
    return {
      zone: zone.key,
      people: at(zone.start + base.people),
      newCount: at(zone.start + base.newCount),
      instantBlock: at(zone.start + base.instantBlock),
      blockDelta: at(zone.start + base.blockDelta),
      blockTotal: at(zone.start + base.blockTotal),
      active: at(zone.start + base.active),
      scenarioCount: pick("scenarioCount"),
      lpAccess: pick("lpAccess"),
      cv: pick("cv"),
    };
  });
  return { date, zones };
}

export interface LineRowIssue {
  date: string;
  check: string;
  detail: string;
}

const zoneOf = (row: LineDailyRow, key: string) => row.zones.find((zone) => zone.zone === key);

/**
 * 用語タブに書かれている恒等式で読み取りを確認する。
 * ずれたら列がずれたか、**列を持たない新しい流入経路が増えた**合図。黙って通さず画面に出す。
 */
export function verifyLineRow(row: LineDailyRow): LineRowIssue[] {
  const issues: LineRowIssue[] = [];
  const add = (check: string, detail: string) => issues.push({ date: row.date, check, detail });
  // 全部nullなら「未確定」としてnullを返す。1つでも値があれば欠けは0として足す。
  // reduce の累積値を number に固定しないと、配列の要素型から null が混ざると推論される。
  const sum = (values: (number | null)[]) =>
    values.every((value) => value === null)
      ? null
      : values.reduce<number>((total, value) => total + (value ?? 0), 0);

  for (const zone of row.zones) {
    if (zone.people === null || zone.blockTotal === null || zone.active === null) continue;
    if (zone.people !== zone.active + zone.blockTotal) {
      add("人数=残存+ブロック累計", `${zone.zone}: ${zone.people} ≠ ${zone.active}+${zone.blockTotal}`);
    }
  }

  const overall = zoneOf(row, "overall");
  const tagged = zoneOf(row, "tagged");
  const rich = zoneOf(row, "richMenu");
  const other = zoneOf(row, "other");
  const qrNew = zoneOf(row, "qrNew");
  const qrOld = zoneOf(row, "qrOld");
  const site = zoneOf(row, "site");

  // 全体CV = タグ計CV + リッチメニューCV + 他経路CV
  const overallParts = sum([tagged?.cv ?? null, rich?.cv ?? null, other?.cv ?? null]);
  if (overall?.cv != null && overallParts !== null && overall.cv !== overallParts) {
    add("全体CV=タグ計+リッチ+他", `${overall.cv} ≠ ${overallParts}`);
  }
  // タグ計CV = 旧QR + 新QR + ブランドサイト
  const taggedParts = sum([qrOld?.cv ?? null, qrNew?.cv ?? null, site?.cv ?? null]);
  if (tagged?.cv != null && taggedParts !== null && tagged.cv !== taggedParts) {
    add("タグ計CV=旧QR+新QR+サイト", `${tagged.cv} ≠ ${taggedParts}`);
  }
  // タグ計の残高 = 経路別の合計（人数・ブロック累計・残存・当日新規・即ブロック数）
  const routes = ["qrNew", "qrOld", "site", "noah", "cosfesOsaka", "cosfesFukuoka"]
    .map((key) => zoneOf(row, key))
    .filter((zone): zone is LineZoneMetrics => !!zone);
  const stock: (keyof LineZoneMetrics)[] = ["people", "blockTotal", "active", "newCount", "instantBlock"];
  for (const field of stock) {
    const expected = sum(routes.map((zone) => zone[field] as number | null));
    const actual = tagged?.[field] as number | null | undefined;
    if (actual != null && expected !== null && actual !== expected) {
      add(`タグ計${field}=経路別合計`, `${actual} ≠ ${expected}`);
    }
  }
  return issues;
}

/* ======================================================================
 * 配信（メッセージパック）別
 * ====================================================================== */

/**
 * 配信別の成果を出すための2タブの読み取り。
 *
 * - `SICKS作成用_パラメURL` … 識別子 → 経路・セグメント・メッセージパック・ステップ番号の対応表
 * - `LINE_ECFCV（URL_日別）` … 日付 × 識別子 の CV（横持ち）
 *
 * **こちらはヘッダー名で読む。** 日実績と違って見出しにセル内改行が無く、
 * 列が足される運用（「経路を足すときは末尾に挿入」）なので、位置で読むと壊れる。
 *
 * LPアクセスの識別子別タブ（`LINE_ECFアクセス（URL_日別）`）は現在このファイルに存在しないため、
 * **配信別はCVだけ**。分母が無いので配信別のCVRは出せない。
 */

export interface LineUrlMaster {
  /** パラメURLの `?u=` 以降。CV側の列名と突き合わせるキー。 */
  identifier: string;
  route: string;
  /** サブスク経験あり/なし。 */
  segmentSubscription: string;
  /** 子どもあり/なし。 */
  segmentChild: string;
  messagePack: string;
  /** ステップ配信の通数。分からないときは null（0にしない）。 */
  stepNumber: number | null;
  adGroup: string;
  hasCoupon: boolean | null;
  url: string;
}

export interface LineUrlCv {
  date: string;
  identifier: string;
  cv: number;
}

const text = (value: unknown): string => String(value ?? "").trim();

/**
 * メッセージパック名の**先頭**から通数を読む。`①_奇跡の歯ブラシとは` → 1、`13_クーポン` → 13。
 *
 * **先頭に限るのが肝。** 名前の途中の丸数字は通数ではない。
 * 「アンケート回答後①　旧QR300_all」の①はリッチメニューのクーポン導線の**パターン番号**で、
 * ここを拾うとリッチメニュー経由のCVが「1通目のCV」として混ざる（実データで211件が誤って1通目に入っていた）。
 */
export function stepFromPackName(value: string): number | null {
  const text = value.trim();
  const code = text.codePointAt(0) ?? 0;
  if (code >= 0x2460 && code <= 0x2473) return code - 0x2460 + 1;
  const digits = text.match(/^(\d{1,2})[_\s]/);
  if (digits) {
    const parsed = Number(digits[1]);
    if (parsed >= 1 && parsed <= 99) return parsed;
  }
  return null;
}

/** `https://ssr.abemashopping.jp/lp?u=kisekino_...` → `kisekino_...`。 */
export function identifierFromUrl(url: string): string | null {
  const match = url.match(/[?&]u=([^&\s]+)/);
  return match ? decodeURIComponent(match[1]).trim() || null : null;
}

/** 「あり」=true、「無」「なし」=false、それ以外は null（空欄を false にしない）。 */
function parseHasCoupon(value: string): boolean | null {
  if (/^あり$/.test(value)) return true;
  if (/^(無|なし|無し)$/.test(value)) return false;
  return null;
}

const HEADERS = {
  route: "経路名",
  segmentSubscription: "セグメント名",
  segmentChild: "セグメント",
  messagePack: "メッセージパック名",
  stepNumber: "ステップ配信番号",
  adGroup: "広告G名",
  url: "パラメURL",
  hasCoupon: "クーポンあり無",
} as const;

type MasterField = keyof typeof HEADERS;

/**
 * ヘッダー行を探す。1行目はメモ書き（`◼︎ダイレクトに遷移する…`）なので、
 * 「経路名」が入っている行を見つけてそこから読む。
 */
export function findMasterHeader(values: readonly unknown[][]): number {
  return values.findIndex((row) => row.some((cell) => text(cell) === HEADERS.route));
}

export function parseUrlMaster(values: readonly unknown[][]): {
  rows: LineUrlMaster[];
  skipped: number;
  duplicates: number;
} {
  const headerIndex = findMasterHeader(values);
  if (headerIndex < 0) {
    throw new Error(`パラメURLのヘッダーを認識できません（「${HEADERS.route}」列が見つかりません）`);
  }
  const header = values[headerIndex].map(text);
  const at: Partial<Record<MasterField, number>> = {};
  for (const [field, label] of Object.entries(HEADERS) as [MasterField, string][]) {
    const index = header.indexOf(label);
    if (index >= 0) at[field] = index;
  }
  if (at.url === undefined) {
    throw new Error(`パラメURLのヘッダーに「${HEADERS.url}」列がありません`);
  }

  const seen = new Map<string, LineUrlMaster>();
  let skipped = 0;
  let duplicates = 0;
  for (const row of values.slice(headerIndex + 1)) {
    const cell = (field: MasterField) => {
      const index = at[field];
      return index === undefined ? "" : text(row[index]);
    };
    const url = cell("url");
    const identifier = identifierFromUrl(url);
    if (!identifier) {
      // URLが未発行の行（企画中・欠番）。識別子が無いとCVと結べないので数えて落とす。
      if (row.some((value) => text(value) !== "")) skipped++;
      continue;
    }
    const pack = cell("messagePack");
    const declared = parseLineNumber(cell("stepNumber"));
    const step = declared !== null && Number.isInteger(declared) && declared >= 1 && declared <= 99
      ? declared
      // 列がずれていても先頭の番号から拾えるので、こちらを控えにする。
      : stepFromPackName(pack);
    const entry: LineUrlMaster = {
      identifier,
      route: cell("route"),
      segmentSubscription: cell("segmentSubscription"),
      segmentChild: cell("segmentChild"),
      messagePack: pack,
      stepNumber: step,
      adGroup: cell("adGroup"),
      hasCoupon: parseHasCoupon(cell("hasCoupon")),
      url,
    };
    if (seen.has(identifier)) duplicates++;
    // 同じ識別子が複数行にあるときは後の行を採る（修正後のテンプレが下に積まれる運用）。
    seen.set(identifier, entry);
  }
  return { rows: [...seen.values()], skipped, duplicates };
}

/** 合計列。識別子ではないので取り込まない。 */
const TOTAL_COLUMN = "total";

export function parseCvMatrix(values: readonly unknown[][]): {
  rows: LineUrlCv[];
  identifiers: string[];
  invalidDates: number;
} {
  if (!values.length) return { rows: [], identifiers: [], invalidDates: 0 };
  const header = values[0].map(text);
  const columns: { index: number; identifier: string }[] = [];
  for (let index = 1; index < header.length; index++) {
    const name = header[index];
    if (!name || name === TOTAL_COLUMN) continue;
    columns.push({ index, identifier: name });
  }
  const rows: LineUrlCv[] = [];
  let invalidDates = 0;
  for (const row of values.slice(1)) {
    const date = parseLineDate(row[0]);
    if (!date) {
      if (text(row[0]) !== "") invalidDates++;
      continue;
    }
    for (const column of columns) {
      const cv = parseLineNumber(row[column.index]);
      // 0は保存しない。識別子の存在はマスタ側が持っているので、0行を積む意味がない。
      if (cv !== null && cv !== 0) rows.push({ date, identifier: column.identifier, cv });
    }
  }
  return { rows, identifiers: columns.map((column) => column.identifier), invalidDates };
}

export interface LineDeliveryItem {
  messagePack: string;
  route: string;
  stepNumber: number | null;
  /** そのパックに紐づく識別子の数（セグメント×経路の枝の数）。 */
  variants: number;
  cv: number;
  hasCoupon: boolean | null;
  firstCvDate: string | null;
  lastCvDate: string | null;
}

/** CVがどの識別子にも紐づかなかった分。パラメURLに未登録の識別子が増えた合図。 */
export interface LineDeliveryUnmatched {
  identifier: string;
  cv: number;
}

export interface LineDeliverySplit {
  key: string;
  label: string;
  cv: number;
}

/**
 * 識別子ごとのCVを、マスタの属性で寄せ直す。
 * 寄せられなかったCVは捨てずに `unmatched` として返す（合計が合わなくなるのを隠さない）。
 */
export function aggregateDeliveries(
  master: readonly LineUrlMaster[],
  cv: readonly LineUrlCv[],
  filters: { dateFrom?: string; dateTo?: string } = {},
) {
  const byIdentifier = new Map(master.map((row) => [row.identifier, row]));
  const packs = new Map<string, LineDeliveryItem & { identifiers: Set<string> }>();
  const unmatched = new Map<string, number>();
  const bySubscription = new Map<string, number>();
  const byChild = new Map<string, number>();
  const byRoute = new Map<string, number>();
  let total = 0;

  for (const entry of cv) {
    if (filters.dateFrom && entry.date < filters.dateFrom) continue;
    if (filters.dateTo && entry.date > filters.dateTo) continue;
    const found = byIdentifier.get(entry.identifier);
    total += entry.cv;
    if (!found) {
      unmatched.set(entry.identifier, (unmatched.get(entry.identifier) ?? 0) + entry.cv);
      continue;
    }
    const key = `${found.route}\u0000${found.messagePack}`;
    const current = packs.get(key) ?? {
      messagePack: found.messagePack, route: found.route, stepNumber: found.stepNumber,
      variants: 0, cv: 0, hasCoupon: found.hasCoupon, firstCvDate: null, lastCvDate: null,
      identifiers: new Set<string>(),
    };
    current.cv += entry.cv;
    current.identifiers.add(entry.identifier);
    if (!current.firstCvDate || entry.date < current.firstCvDate) current.firstCvDate = entry.date;
    if (!current.lastCvDate || entry.date > current.lastCvDate) current.lastCvDate = entry.date;
    packs.set(key, current);
    const bump = (map: Map<string, number>, name: string) => {
      if (name) map.set(name, (map.get(name) ?? 0) + entry.cv);
    };
    bump(bySubscription, found.segmentSubscription);
    bump(byChild, found.segmentChild);
    bump(byRoute, found.route);
  }

  const toSplit = (map: Map<string, number>): LineDeliverySplit[] =>
    [...map].map(([key, value]) => ({ key, label: key, cv: value })).sort((a, b) => b.cv - a.cv);

  return {
    items: [...packs.values()]
      .map(({ identifiers, ...item }) => ({ ...item, variants: identifiers.size }))
      .sort((a, b) => b.cv - a.cv || (a.stepNumber ?? 99) - (b.stepNumber ?? 99)),
    unmatched: [...unmatched]
      .map(([identifier, value]) => ({ identifier, cv: value }))
      .sort((a, b) => b.cv - a.cv),
    bySubscription: toSplit(bySubscription),
    byChild: toSplit(byChild),
    byRoute: toSplit(byRoute),
    totalCv: total,
  };
}
