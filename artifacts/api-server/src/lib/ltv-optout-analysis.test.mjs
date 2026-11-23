import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAnalysisDate, analyzeOptoutTiming } from "./ltv-optout-analysis.ts";

// 配信履歴は ma_deliveries（Supabase）から来る。1行＝メール・完了の1通。
const mailHistory = (events) => {
  const dates = events.map(([, date]) => date).sort();
  return {
    rows: events.map(([customerCode, date]) => ({ customerCode, date })),
    from: dates[0] ?? null, to: dates.at(-1) ?? null,
    rawRows: events.length, excludedRows: 0, duplicateRows: 0, invalidRows: 0,
    available: true, error: null,
  };
};
const purchase = (customer, month, sub = customer) => ({
  customerCode: customer, subsOrderCode: sub, firstOrderMonth: month,
  firstProduct: "", product2: "", product3: "", product4: "", offerName: "",
  adGroupName: "", subsStatus: "", sellingUrl: "", ltv95: 0, ltv180: 0, ltv365: 0,
});
const out = (customer, date) => ({ customerCode: customer, optoutDate: date });
const emptyMail = () => mailHistory([]);
const metadata = { purchaseSyncedAt: "2026-11-01T00:00:00Z", fetchedAt: "2026-11-20T00:00:00Z" };
const analyze = (purchases, optouts, mail = emptyMail(), filters = {}) =>
  analyzeOptoutTiming(purchases, optouts, mail, filters, metadata);

test("valid calendar dates and Japanese timezone boundaries are normalized without accepting impossible dates", () => {
  assert.equal(normalizeAnalysisDate("2026/1/2 03:04:05"), "2026-01-02");
  assert.equal(normalizeAnalysisDate("2026-11-03T23:30:00Z"), "2026-11-04");
  assert.equal(normalizeAnalysisDate("2026-11-04T01:00:00+09:00"), "2026-11-04");
  assert.equal(normalizeAnalysisDate("2024-02-29"), "2024-02-29");
  for (const value of ["2026-02-29", "2026-11-31", "2026-13-01", "不明", "", null]) {
    assert.equal(normalizeAnalysisDate(value), null);
  }
});

test("customer joins preserve leading zeroes, use earliest observed month, and never count multiple subscriptions twice", () => {
  const purchases = [
    purchase("001", "2026-03-01", "sub-later"), purchase("001", "2026-01-01", "sub-first"),
    purchase("001", "2026-01-01", "sub-first"), purchase("1", "2026-02-01"),
  ];
  const original = JSON.stringify(purchases);
  const report = analyze(purchases, [
    out("001", "2025-12-31"), out("001", "2026-02-28"), out("001", "2026-02-28"),
    out("001", "2026-03-03"), out("1", "2026-02-01"),
  ]);
  assert.equal(report.summary.purchaseCustomers, 2);
  assert.equal(report.summary.analyzedCustomers, 2);
  const a = report.customers.find((row) => row.customerCode === "001");
  assert.equal(a.firstPurchaseMonth, "2026-01");
  assert.equal(a.subscriptionCount, 2);
  assert.equal(a.optoutDate, "2026-02-28");
  assert.equal(a.monthIndex, 2);
  assert.equal(report.customers.find((row) => row.customerCode === "1").monthIndex, 1);
  assert.equal(JSON.stringify(purchases), original);
});

test("first eligible opt-out is selected before filters, and cohort filters do not reset a customer's first month", () => {
  const purchases = [purchase("a", "2026-01-01", "1"), purchase("a", "2026-03-01", "2")];
  const optouts = [out("a", "2026-02-01"), out("a", "2026-04-01")];
  assert.equal(analyze(purchases, optouts, emptyMail(), { optoutFrom: "2026-03-01" }).summary.analyzedCustomers, 0);
  assert.equal(analyze(purchases, optouts, emptyMail(), { monthFrom: "2026-03" }).summary.analyzedCustomers, 0);
  const yearBoundary = analyze([purchase("a", "2025-12-01")], [out("a", "2026-01-01")]);
  assert.equal(yearBoundary.customers[0].monthIndex, 2);
});

test("observed counts exclude same-day and later emails; unknown cumulative counts never become lifetime zeroes", () => {
  const mail = mailHistory([
    ["a", "2026-11-04"], ["a", "2026-11-05"], ["a", "2026-11-05"], ["a", "2026-11-06"],
    ["b", "2026-11-05"],
  ]);
  const report = analyze(
    ["a", "b", "c", "d", "e"].map((id) => purchase(id, "2026-01-01")),
    [out("a", "2026-11-05"), out("b", "2026-11-05"), out("c", "2026-11-05"), out("d", "2026-02-01"), out("e", "2026-11-10")],
    mail,
  );
  const get = (id) => report.customers.find((row) => row.customerCode === id);
  assert.equal(get("a").observedBeforeCount, 1);
  assert.equal(get("a").sameDayCount, 2);
  assert.equal(get("a").mailStatus, "history_incomplete");
  assert.equal(get("b").observedBeforeCount, null);
  assert.equal(get("b").sameDayCount, 1);
  assert.equal(get("b").mailStatus, "same_day_only");
  assert.equal(get("c").mailStatus, "no_matching_history");
  assert.equal(get("d").mailStatus, "outside_period");
  assert.equal(get("d").sameDayCount, null);
  assert.equal(get("e").mailStatus, "outside_period");
  assert.ok(report.customers.every((row) => row.cumulativeCount === null));
  assert.equal(report.summary.observedMailCustomers, 1);
  assert.equal(report.summary.sameDayMailCustomers, 2);
  assert.equal(report.summary.cumulativeUnknownCustomers, 5);
  assert.deepEqual(report.mailDistribution.map((bucket) => [bucket.observedCount, bucket.count, bucket.share]), [[1, 1, 0.2], [null, 4, 0.8]]);
});

test("unmatched, invalid-first-month and pre-purchase-only customers are explicit and reconcile to opt-out customers", () => {
  const report = analyze(
    [purchase("yes", "2026-02-01"), purchase("unknown", null), purchase("before", "2026-02-01")],
    [out("yes", "2026-03-01"), out("unknown", "2026-03-01"), out("before", "2026-01-31"), out("missing", "2026-03-01")],
  );
  const s = report.summary;
  assert.equal(s.matchedCustomers, 1);
  assert.equal(s.unmatchedOptoutCustomers, 1);
  assert.equal(s.unknownPurchaseMonthCustomers, 1);
  assert.equal(s.beforePurchaseOnlyCustomers, 1);
  assert.equal(s.optoutCustomers, s.matchedCustomers + s.unmatchedOptoutCustomers + s.unknownPurchaseMonthCustomers + s.beforePurchaseOnlyCustomers);
});

test("distributions use filtered customers rather than page size, and pagination is deterministic and clamped", () => {
  const purchases = Array.from({ length: 5 }, (_, i) => purchase(`00${i}`, "2026-01-01"));
  const optouts = purchases.map((p, i) => out(p.customerCode, `2026-0${i + 1}-01`));
  const full = analyze(purchases, optouts);
  const page = analyze(purchases, optouts, emptyMail(), { page: 2, pageSize: 2 });
  assert.equal(page.summary.analyzedCustomers, 5);
  assert.deepEqual(page.monthDistribution, full.monthDistribution);
  assert.equal(page.monthDistribution.reduce((sum, bucket) => sum + bucket.share, 0), 1);
  assert.equal(page.totalPages, 3);
  assert.deepEqual(page.customers.map((c) => c.customerCode), ["002", "003"]);
  assert.equal(analyze(purchases, optouts, emptyMail(), { page: 99, pageSize: 2 }).page, 3);
  const filtered = analyze(purchases, optouts, emptyMail(), { optoutFrom: "2026-02-01", optoutTo: "2026-04-01", customerCode: "00" });
  assert.equal(filtered.summary.analyzedCustomers, 3);
  assert.equal(filtered.summary.matchedCustomers, 5);
});

test("mail outages preserve valid month analysis and expose unavailable status, never synthetic zero success counts", () => {
  const unavailable = { ...emptyMail(), available: false, error: "メール取得失敗" };
  const report = analyze([purchase("001", "2026-01-01")], [out("001", "2026-02-01")], unavailable);
  assert.equal(report.sources.mailAvailable, false);
  assert.equal(report.sources.mailError, "メール取得失敗");
  assert.equal(report.monthDistribution[0].monthIndex, 2);
  assert.equal(report.customers[0].mailStatus, "unavailable");
  assert.equal(report.customers[0].observedBeforeCount, null);
  assert.equal(report.customers[0].sameDayCount, null);
});

test("empty sources and no-match filters have finite summaries and stable empty pagination", () => {
  const report = analyze([], []);
  assert.deepEqual(report.monthDistribution, []);
  assert.deepEqual(report.mailDistribution, []);
  assert.deepEqual(report.customers, []);
  assert.equal(report.page, 1);
  assert.equal(report.totalPages, 0);
  assert.equal(report.summary.analyzedCustomers, 0);
  assert.equal(report.sources.mailFrom, null);
  const noMatches = analyze([purchase("001", "2026-01-01")], [out("001", "2026-02-01")], emptyMail(), { customerCode: "absent" });
  assert.equal(noMatches.summary.analyzedCustomers, 0);
  assert.equal(noMatches.summary.matchedCustomers, 1);
});
