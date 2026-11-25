import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseShindanPack, parseSurveyTag, parseSurveyProgressTag,
  hasReachedDay, pivotWindows, BRANCH_MAPPINGS, SCENARIO_STEPS,
} from "./liny-scenario.ts";

test("診断シナリオの配信URLからDayと分岐を取る", () => {
  assert.deepEqual(parseShindanPack("20d_q3_毛先広がり_shindan"), { day: 20, branch: "q3", content: "毛先広がり" });
  assert.deepEqual(parseShindanPack("4d_all_選ばれる理由_shindan"), { day: 4, branch: "all", content: "選ばれる理由" });
  assert.deepEqual(parseShindanPack("0d_result_ラクしたい_shindan"), { day: 0, branch: "result", content: "ラクしたい" });
  // 内容に _ が入っても最後の _shindan だけを落とす
  assert.deepEqual(parseShindanPack("24d_all_UGC＆定期訴求_shindan"), { day: 24, branch: "all", content: "UGC＆定期訴求" });
});

test("旧シナリオのURLは診断シナリオとして拾わない", () => {
  assert.equal(parseShindanPack("13_クーポン_use0-ch0"), null);
  assert.equal(parseShindanPack("⑥_クーポン_sub0-ch0"), null);
  assert.equal(parseShindanPack("リッチメニュー_all　70％OFF"), null);
  assert.equal(parseShindanPack(""), null);
  assert.equal(parseShindanPack(null), null);
});

test("診断タグ名を設問と選択肢に割る", () => {
  assert.deepEqual(parseSurveyTag("診断Q1：磨き残し対策"), { question: "q1", choice: "磨き残し対策" });
  assert.deepEqual(parseSurveyTag("診断Q5：買いに行かなくていい"), { question: "q5", choice: "買いに行かなくていい" });
  assert.equal(parseSurveyTag("診断回答"), null);
  assert.equal(parseSurveyTag("ステップ配信①_奇跡の歯ブラシとは"), null);
});

test("何問目まで答えたかのタグ", () => {
  assert.equal(parseSurveyProgressTag("診断3回答"), 3);
  assert.equal(parseSurveyProgressTag("診断回答"), null);
  assert.equal(parseSurveyProgressTag("診断Q3：1ヶ月"), null);
});

test("Day到達は追加日からの経過日数で決まる", () => {
  const added = "2026-11-24T10:00:00+09:00";
  assert.equal(hasReachedDay(added, 0, "2026-11-24T10:00:00+09:00"), true);
  assert.equal(hasReachedDay(added, 2, "2026-11-26T09:59:00+09:00"), false);
  assert.equal(hasReachedDay(added, 2, "2026-11-26T10:00:00+09:00"), true);
  assert.equal(hasReachedDay("", 2, "2026-11-26T10:00:00+09:00"), false);
});

test("前後の窓は必ず同じ日数になる", () => {
  const w = pivotWindows("2026-11-24", "2026-11-26");
  assert.equal(w.days, 3);
  assert.deepEqual(w.after, { from: "2026-11-24", to: "2026-11-26" });
  assert.deepEqual(w.before, { from: "2026-11-21", to: "2026-11-23" });
  // 基準日当日は後ろの窓が1日
  assert.deepEqual(pivotWindows("2026-11-24", "2026-11-24"), {
    before: { from: "2026-11-23", to: "2026-11-23" }, after: { from: "2026-11-24", to: "2026-11-24" }, days: 1,
  });
  // 基準日が未来なら窓を作らない
  assert.equal(pivotWindows("2026-12-01", "2026-11-26"), null);
});

test("分岐の対応表はタグも配信内容も重複しない4件ずつ", () => {
  for (const [question, rows] of Object.entries(BRANCH_MAPPINGS)) {
    assert.equal(rows.length, 4, `${question} は4件のはず`);
    assert.equal(new Set(rows.map((r) => r.tag)).size, 4, `${question} のタグが重複`);
    assert.equal(new Set(rows.map((r) => r.content)).size, 4, `${question} の配信内容が重複`);
  }
});

test("工程の定義に分岐つきの日が揃っている", () => {
  const branched = SCENARIO_STEPS.filter((s) => s.branch !== "all" && s.branch !== "result");
  assert.deepEqual(branched.map((s) => s.day), [2, 7, 20]);
  // 分岐つきの工程はアマギフ経路には流れない
  assert.ok(branched.every((s) => !s.amagift));
});
