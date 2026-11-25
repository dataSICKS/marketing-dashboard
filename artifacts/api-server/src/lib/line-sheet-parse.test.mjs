import assert from "node:assert/strict";
import test from "node:test";
import {
  LINE_ZONES, LINE_ROW_LENGTH, parseLineNumber, parseLineDate, parseLineRow, verifyLineRow,
  parseUrlMaster, parseCvMatrix, aggregateDeliveries, findMasterHeader, identifierFromUrl, circledNumber,
} from "./line-sheet-parse.ts";

/** 用語タブ⑤が示す列レター。読み取り位置がずれていないかの固定点。 */
const LETTER = {
  overallLpAccess: "L", overallCv: "M",
  taggedCv: "Z",
  qrNewLpAccess: "AN", qrNewCv: "AO",
  qrOldLpAccess: "BD", qrOldCv: "BE",
  siteLpAccess: "BR", siteCv: "BS",
  richLpAccess: "CZ", richCv: "DA",
  otherLpAccess: "DC", otherCv: "DD",
};

const indexOfLetter = (letter) =>
  [...letter].reduce((total, char) => total * 26 + (char.charCodeAt(0) - 64), 0) - 1;

const blank = () => Array.from({ length: LINE_ROW_LENGTH }, () => "");

const zoneOf = (row, key) => row.zones.find((zone) => zone.zone === key);

test("the documented zone ranges add up to the sheet's 109 columns without overlapping", () => {
  const widths = { base: 10, full: 14, tagged: 12, qr: 16, cvOnly: 3 };
  let cursor = 1; // A列は日付
  for (const zone of LINE_ZONES) {
    assert.equal(zone.start, cursor, `${zone.label} の開始列`);
    cursor += widths[zone.kind];
  }
  assert.equal(cursor, LINE_ROW_LENGTH, "合計109列");
});

test("LP access and CV are read from the exact columns the glossary pins them to", () => {
  const row = blank();
  const expected = {
    overallLpAccess: 11, overallCv: 12, taggedCv: 13,
    qrNewLpAccess: 14, qrNewCv: 15, qrOldLpAccess: 16, qrOldCv: 17,
    siteLpAccess: 18, siteCv: 19, richLpAccess: 20, richCv: 21,
    otherLpAccess: 22, otherCv: 23,
  };
  for (const [name, value] of Object.entries(expected)) row[indexOfLetter(LETTER[name])] = String(value);
  const parsed = parseLineRow(["2026/11/23", ...row.slice(1)]);
  assert.equal(zoneOf(parsed, "overall").lpAccess, expected.overallLpAccess);
  assert.equal(zoneOf(parsed, "overall").cv, expected.overallCv);
  assert.equal(zoneOf(parsed, "tagged").cv, expected.taggedCv);
  assert.equal(zoneOf(parsed, "tagged").lpAccess, null, "タグ計はLPアクセスを持たない");
  assert.equal(zoneOf(parsed, "qrNew").lpAccess, expected.qrNewLpAccess);
  assert.equal(zoneOf(parsed, "qrNew").cv, expected.qrNewCv);
  assert.equal(zoneOf(parsed, "qrOld").lpAccess, expected.qrOldLpAccess);
  assert.equal(zoneOf(parsed, "qrOld").cv, expected.qrOldCv);
  assert.equal(zoneOf(parsed, "site").cv, expected.siteCv);
  assert.equal(zoneOf(parsed, "richMenu").lpAccess, expected.richLpAccess);
  assert.equal(zoneOf(parsed, "richMenu").cv, expected.richCv);
  assert.equal(zoneOf(parsed, "other").cv, expected.otherCv);
  assert.equal(zoneOf(parsed, "noah").cv, null, "NOAHはCV列を持たない");
});

test("thousands separators, percentages and blanks are distinguished from zero", () => {
  assert.equal(parseLineNumber("50,920"), 50920);
  assert.equal(parseLineNumber("28.10%"), 0.281);
  assert.equal(parseLineNumber("0"), 0);
  assert.equal(parseLineNumber("-12"), -12);
  for (const value of ["", "  ", "-", "#N/A", "#DIV/0!", null, undefined]) {
    assert.equal(parseLineNumber(value), null, `空欄扱い: ${value}`);
  }
});

test("only real calendar dates are accepted as rows", () => {
  assert.equal(parseLineDate("2026/11/23"), "2026-11-23");
  assert.equal(parseLineDate("2026-7-3"), "2026-07-03");
  for (const value of ["2026/02/30", "2026/13/01", "11月23日", "", "合計"]) {
    assert.equal(parseLineDate(value), null, `不正な日付: ${value}`);
  }
  // 表示形式のままだと「2月1日」で年が落ちるため、値は連番で取って変換する
  assert.equal(parseLineDate(46349), "2026-11-23");
  assert.equal(parseLineDate("46349"), "2026-11-23");
  for (const value of [0, 1, 500, 150000]) {
    assert.equal(parseLineDate(value), null, `日付でない数値: ${value}`);
  }
  assert.equal(parseLineRow(["合計", ...blank().slice(1)]), null, "日付でない行は読まない");
});

/** 2026/11/23 の全体ゾーン（実データ）。人数−ブロック累計=残存 が成立する組み合わせ。 */
test("a real day's overall zone reproduces the active-friend identity", () => {
  const row = blank();
  row[1] = "50,920";  // 人数(累計)
  row[2] = "46";      // 当日新規
  row[3] = "0";       // 即ブロック数
  row[5] = "25";      // 当日ブロック数(前日差)
  row[6] = "14,309";  // ブロック数(累計)
  row[8] = "36,611";  // 残存(active)
  row[11] = "22";     // LPアクセス
  row[12] = "0";      // サブスクCV
  const parsed = parseLineRow(["2026/11/23", ...row.slice(1)]);
  const overall = zoneOf(parsed, "overall");
  assert.equal(overall.people, 50920);
  assert.equal(overall.active, 36611);
  assert.equal(overall.blockTotal, 14309);
  assert.equal(overall.people - overall.blockTotal, overall.active);
  assert.deepEqual(verifyLineRow(parsed).filter((issue) => issue.check.startsWith("人数")), []);
});

test("a broken friend-count identity is reported instead of being averaged away", () => {
  const row = blank();
  row[1] = "100";
  row[6] = "30";
  row[8] = "60"; // 本当は70
  const issues = verifyLineRow(parseLineRow(["2026/11/23", ...row.slice(1)]));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].check, "人数=残存+ブロック累計");
  assert.match(issues[0].detail, /overall/);
});

test("CV that does not split into its routes is flagged, because that means a new route exists", () => {
  const row = blank();
  row[indexOfLetter(LETTER.overallCv)] = "10";
  row[indexOfLetter(LETTER.taggedCv)] = "4";
  row[indexOfLetter(LETTER.richCv)] = "3";
  row[indexOfLetter(LETTER.otherCv)] = "1"; // 合計8 ≠ 10
  row[indexOfLetter(LETTER.qrOldCv)] = "2";
  row[indexOfLetter(LETTER.qrNewCv)] = "1";
  row[indexOfLetter(LETTER.siteCv)] = "1"; // 合計4 = タグ計4 なのでこちらは通る
  const issues = verifyLineRow(parseLineRow(["2026/11/23", ...row.slice(1)]));
  assert.deepEqual(issues.map((issue) => issue.check), ["全体CV=タグ計+リッチ+他"]);
});

test("the tagged zone's stock must equal the sum of its routes", () => {
  const row = blank();
  row[15] = "100"; // タグ計 人数
  row[27] = "40";  // 新QR 人数
  row[43] = "50";  // 旧QR 人数（合計90 ≠ 100）
  const issues = verifyLineRow(parseLineRow(["2026/11/23", ...row.slice(1)]));
  assert.ok(issues.some((issue) => issue.check === "タグ計people=経路別合計"), JSON.stringify(issues));
});

test("an all-blank zone raises no identity complaint, so unconfirmed days stay quiet", () => {
  const parsed = parseLineRow(["2026/11/24", ...blank().slice(1)]);
  assert.deepEqual(verifyLineRow(parsed), []);
  assert.equal(zoneOf(parsed, "overall").people, null);
});

/* ===================== 配信（メッセージパック）別 ===================== */

const MASTER_HEADER = [
  "No", "経路名", "経路", "セグメント名", "セグメント", "内容", "メッセージパック名",
  "配信名", "ステップ配信番号", "広告G名", "識別子", "テンプレ", "URL（LINE用）", "パラメURL", "クーポンあり無",
];
const masterRow = (over = {}) => {
  const base = {
    No: "1", 経路名: "旧QR", 経路: "A", セグメント名: "サブスク経験あり", セグメント: "子どもあり",
    内容: "sub1-ch1", メッセージパック名: "ステップ配信⑥_クーポン", 配信名: "⑥_クーポン_sub1-ch1",
    ステップ配信番号: "6", 広告G名: "奇跡の歯ブラシ/LINE公式アカウント", 識別子: "id",
    テンプレ: "531", "URL（LINE用）": "https://ssr.abemashopping.jp/lp?u=",
    パラメURL: "https://ssr.abemashopping.jp/lp?u=kisekino_haburashi_LINE_A_sub1-ch16",
    クーポンあり無: "あり", ...over,
  };
  return MASTER_HEADER.map((name) => base[name] ?? "");
};
const NOTE_ROW = ["◼︎ダイレクトに遷移するURLに振るパラメ", "", ""];

test("the parameter-URL sheet is read by header name, below the free-text note row", () => {
  const { rows, skipped, duplicates } = parseUrlMaster([NOTE_ROW, MASTER_HEADER, masterRow()]);
  assert.equal(findMasterHeader([NOTE_ROW, MASTER_HEADER]), 1);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    identifier: "kisekino_haburashi_LINE_A_sub1-ch16",
    route: "旧QR",
    segmentSubscription: "サブスク経験あり",
    segmentChild: "子どもあり",
    messagePack: "ステップ配信⑥_クーポン",
    stepNumber: 6,
    adGroup: "奇跡の歯ブラシ/LINE公式アカウント",
    hasCoupon: true,
    url: "https://ssr.abemashopping.jp/lp?u=kisekino_haburashi_LINE_A_sub1-ch16",
  });
  assert.equal(skipped, 0);
  assert.equal(duplicates, 0);
});

test("the identifier comes from the URL, so an unnamed identifier column cannot shift it", () => {
  assert.equal(identifierFromUrl("https://x/lp?u=abc_123"), "abc_123");
  assert.equal(identifierFromUrl("https://x/lp?a=1&u=abc&b=2"), "abc");
  assert.equal(identifierFromUrl("https://x/lp"), null);
  assert.equal(identifierFromUrl(""), null);
  // URLが未発行の行は、識別子が作れないので取り込まずに数える
  const { rows, skipped } = parseUrlMaster([MASTER_HEADER, masterRow({ パラメURL: "" }), masterRow()]);
  assert.equal(rows.length, 1);
  assert.equal(skipped, 1);
});

test("the step number falls back to the circled numeral when the column is missing or wrong", () => {
  assert.equal(circledNumber("ステップ配信⑥_クーポン"), 6);
  assert.equal(circledNumber("⑳番目"), 20);
  assert.equal(circledNumber("クーポン"), null);
  const noColumn = MASTER_HEADER.filter((name) => name !== "ステップ配信番号");
  const row = masterRow();
  const trimmed = noColumn.map((name) => row[MASTER_HEADER.indexOf(name)]);
  assert.equal(parseUrlMaster([noColumn, trimmed]).rows[0].stepNumber, 6, "丸数字から拾う");
  const bad = parseUrlMaster([MASTER_HEADER, masterRow({ ステップ配信番号: "①_クーポン_sub1-ch1" })]);
  assert.equal(bad.rows[0].stepNumber, 6, "列がずれていてもパック名の丸数字が勝つ");
});

test("coupon presence distinguishes unknown from absent", () => {
  const read = (value) => parseUrlMaster([MASTER_HEADER, masterRow({ クーポンあり無: value })]).rows[0].hasCoupon;
  assert.equal(read("あり"), true);
  assert.equal(read("無"), false);
  assert.equal(read("なし"), false);
  assert.equal(read(""), null, "空欄は『無し』と断定しない");
});

test("a repeated identifier keeps the later row, matching how fixes are appended", () => {
  const first = masterRow({ メッセージパック名: "ステップ配信①_旧" });
  const second = masterRow({ メッセージパック名: "ステップ配信②_新" });
  const { rows, duplicates } = parseUrlMaster([MASTER_HEADER, first, second]);
  assert.equal(rows.length, 1);
  assert.equal(duplicates, 1);
  assert.equal(rows[0].messagePack, "ステップ配信②_新");
});

test("the wide CV sheet melts into rows, dropping zeros and the total column", () => {
  const header = ["日付", "total", "id_a", "id_b", ""];
  const values = [header, [46349, 3, 2, 1, 9], [46350, 0, 0, 0, 0], ["合計", 5, 5, 0, 0]];
  const { rows, identifiers, invalidDates } = parseCvMatrix(values);
  assert.deepEqual(identifiers, ["id_a", "id_b"], "total と無名列は識別子にしない");
  assert.deepEqual(rows, [
    { date: "2026-11-23", identifier: "id_a", cv: 2 },
    { date: "2026-11-23", identifier: "id_b", cv: 1 },
  ]);
  assert.equal(invalidDates, 1, "『合計』行は日付として読めないので数える");
  assert.deepEqual(parseCvMatrix([]).rows, []);
});

test("CV is grouped by message pack and route, and unmatched identifiers are surfaced", () => {
  const master = parseUrlMaster([
    MASTER_HEADER,
    masterRow(),
    masterRow({
      セグメント: "子どもなし", メッセージパック名: "ステップ配信⑥_クーポン",
      パラメURL: "https://x/lp?u=pack6_b",
    }),
    masterRow({
      経路名: "新QR", メッセージパック名: "ステップ配信①_奇跡の歯ブラシとは", ステップ配信番号: "1",
      パラメURL: "https://x/lp?u=pack1", クーポンあり無: "無",
    }),
  ]).rows;
  const cv = [
    { date: "2026-10-01", identifier: "kisekino_haburashi_LINE_A_sub1-ch16", cv: 2 },
    { date: "2026-10-05", identifier: "pack6_b", cv: 1 },
    { date: "2026-10-02", identifier: "pack1", cv: 4 },
    { date: "2026-10-03", identifier: "未登録の識別子", cv: 7 },
  ];
  const result = aggregateDeliveries(master, cv);
  assert.equal(result.totalCv, 14, "寄せられなかった分も総数には入れる");
  assert.deepEqual(result.unmatched, [{ identifier: "未登録の識別子", cv: 7 }]);
  const pack6 = result.items.find((item) => item.route === "旧QR");
  assert.equal(pack6.cv, 3);
  assert.equal(pack6.variants, 2, "セグメント違いの識別子2本をまとめた");
  assert.equal(pack6.stepNumber, 6);
  assert.equal(pack6.firstCvDate, "2026-10-01");
  assert.equal(pack6.lastCvDate, "2026-10-05");
  assert.deepEqual(result.items.map((item) => item.cv), [4, 3], "CVの多い順");
  assert.deepEqual(result.byChild, [{ key: "子どもあり", label: "子どもあり", cv: 6 }, { key: "子どもなし", label: "子どもなし", cv: 1 }]);
  assert.deepEqual(result.byRoute.map((item) => item.key), ["新QR", "旧QR"]);
});

test("the date filter applies before grouping, and an empty range yields empty output", () => {
  const master = parseUrlMaster([MASTER_HEADER, masterRow()]).rows;
  const cv = [
    { date: "2026-09-30", identifier: "kisekino_haburashi_LINE_A_sub1-ch16", cv: 5 },
    { date: "2026-10-01", identifier: "kisekino_haburashi_LINE_A_sub1-ch16", cv: 2 },
  ];
  assert.equal(aggregateDeliveries(master, cv, { dateFrom: "2026-10-01" }).totalCv, 2);
  assert.equal(aggregateDeliveries(master, cv, { dateTo: "2026-09-30" }).totalCv, 5);
  const empty = aggregateDeliveries(master, cv, { dateFrom: "2026-11-01" });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.totalCv, 0);
});
