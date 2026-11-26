import assert from "node:assert/strict";
import { test } from "node:test";
import {
  summarizeScenarios, scenarioKinds, filterByKind, blastResponses, BLAST_MAX_SPAN_DAYS,
} from "./ma-scenario-kind.ts";

const event = (scenarioName, customerCode, date, nodeId = "n1") =>
  ({ scenarioName, customerCode, date, nodeId, templateName: "t" });

test("配信が1〜2日に収まるシナリオは一斉配信", () => {
  const [item] = summarizeScenarios([
    event("一斉", "a", "2026-05-31"), event("一斉", "b", "2026-05-31"), event("一斉", "c", "2026-06-01"),
  ]);
  assert.equal(item.kind, "blast");
  assert.equal(item.spanDays, 2);
  assert.equal(item.perCustomer, 1);
});

test("1通/人・1ノードでも長期間に分散していればステップ配信", () => {
  // 実データの 260130_スタートガイドメルマガ がこの形。ノード数や通数では判別できない。
  const [item] = summarizeScenarios([
    event("ステップ", "a", "2026-01-30"), event("ステップ", "b", "2026-04-01"), event("ステップ", "c", "2026-07-17"),
  ]);
  assert.equal(item.kind, "step");
  assert.equal(item.perCustomer, 1);
  assert.equal(item.nodes, 1);
});

test("境目はちょうど3日まで", () => {
  const within = summarizeScenarios([event("x", "a", "2026-05-01"), event("x", "b", "2026-05-03")])[0];
  const beyond = summarizeScenarios([event("y", "a", "2026-05-01"), event("y", "b", "2026-05-04")])[0];
  assert.equal(within.spanDays, BLAST_MAX_SPAN_DAYS);
  assert.equal(within.kind, "blast");
  assert.equal(beyond.kind, "step");
});

test("種別で配信を分けられる。未知のシナリオはステップ扱い", () => {
  const events = [
    event("一斉", "a", "2026-05-31"), event("一斉", "b", "2026-06-01"),
    event("ステップ", "a", "2026-01-30"), event("ステップ", "b", "2026-07-17"),
  ];
  const kinds = scenarioKinds(summarizeScenarios(events));
  assert.equal(filterByKind(events, kinds, "blast").length, 2);
  assert.equal(filterByKind(events, kinds, "step").length, 2);
  assert.equal(filterByKind([event("未知", "z", "2026-01-01")], kinds, "step").length, 1);
  assert.equal(filterByKind([event("未知", "z", "2026-01-01")], kinds, "blast").length, 0);
});

test("一斉配信の反応を配信日からの経過日数で出す", () => {
  // 100通未満は測らない仕様なので、測れる規模にしておく
  const events = Array.from({ length: 200 }, (_, i) => event("一斉", `c${i}`, "2026-05-31"));
  const summaries = summarizeScenarios(events);
  const optouts = [];
  // 平常日は1日2件
  for (let day = 1; day <= 28; day++) {
    const date = new Date(Date.parse("2026-05-31T00:00:00Z") - day * 86400000).toISOString().slice(0, 10);
    optouts.push({ customerCode: `x${day}a`, optoutDate: date }, { customerCode: `x${day}b`, optoutDate: date });
  }
  // 配信当日に10件
  for (let i = 0; i < 10; i++) optouts.push({ customerCode: `blast${i}`, optoutDate: "2026-05-31" });

  const [response] = blastResponses(summaries, optouts);
  assert.equal(response.baselineDaily, 2);
  assert.equal(response.windowOptouts, 10);        // 当日10件・以降0件
  assert.equal(response.expectedOptouts, 8);       // 2件 × 4日
  assert.equal(response.excessOptouts, 2);
  assert.equal(response.daily.length, 11);         // 前3日 + 当日 + 後7日
  assert.equal(response.daily.find((d) => d.offset === 0).optouts, 10);
  assert.equal(response.daily.find((d) => d.offset === -1).optouts, 2);
});

test("一括処理の日は基準線からも窓からも外す", () => {
  const events = Array.from({ length: 100 }, (_, i) => event("一斉", `c${i}`, "2026-05-31"));
  const summaries = summarizeScenarios(events);
  const optouts = [
    { customerCode: "p", optoutDate: "2026-05-31" },
    { customerCode: "q", optoutDate: "2026-05-31" },
  ];
  const kept = blastResponses(summaries, optouts);
  const dropped = blastResponses(summaries, optouts, { excludeDates: ["2026-05-31"] });
  assert.equal(kept[0].windowOptouts, 2);
  assert.equal(dropped[0].windowOptouts, 0);
});

test("ステップ配信は一斉配信の表に出てこない", () => {
  const summaries = summarizeScenarios([event("ステップ", "a", "2026-01-01"), event("ステップ", "b", "2026-07-01")]);
  assert.deepEqual(blastResponses(summaries, []), []);
});

test("規模が小さすぎる一斉配信は効果を測らない", () => {
  // 実データのテスト配信は2通。本番の一斉配信と窓が重なって超過率29550%になった。
  const events = [event("テスト", "a", "2026-05-30"), event("テスト", "b", "2026-05-30")];
  const summaries = summarizeScenarios(events);
  assert.equal(summaries[0].kind, "blast");          // 種別の判定はされる
  assert.deepEqual(blastResponses(summaries, [{ customerCode: "x", optoutDate: "2026-05-30" }]), []);
});

test("100通以上の一斉配信は測る", () => {
  const events = Array.from({ length: 100 }, (_, i) => event("本番", `c${i}`, "2026-05-31"));
  const [response] = blastResponses(summarizeScenarios(events), []);
  assert.equal(response.deliveries, 100);
});
