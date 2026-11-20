import type { LtvOptoutAnalysis, LtvOptoutCustomer } from "@workspace/api-zod";
import type { LtvRow } from "./ltv-types.js";
import type { OptoutRow } from "./newsletter-types.js";

export interface ObservedMail {
  customerCode: string;
  date: string;
}

export interface MailHistory {
  rows: ObservedMail[];
  from: string | null;
  to: string | null;
  rawRows: number;
  excludedRows: number;
  duplicateRows: number;
  invalidRows: number;
  available: boolean;
  error: string | null;
}

/** Date-only source values are Japanese calendar dates, not UTC instants. */
export function normalizeAnalysisDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const instant = new Date(text);
    if (!Number.isFinite(instant.getTime())) return null;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  }
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T])/);
  if (!match) return null;
  const [, y, m, d] = match;
  const result = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result ? result : null;
}

/** Count completed email events, never target-count flags or LINE deliveries. */
export function parseMailHistory(header: string[], values: unknown[][]): MailHistory {
  const column = (label: string) => {
    const index = header.findIndex((item) => String(item).trim() === label);
    if (index < 0) throw new Error(`メール配信実績に「${label}」列がありません`);
    return index;
  };
  const at = {
    customer: column("顧客番号"), timestamp: column("配信日時"), method: column("配信方法"),
    status: column("配信ステータス"), scenario: column("シナリオID"), node: column("ノードID"), template: column("テンプレート名"),
  };
  // One event can have repeated exports/statuses; a completed record takes precedence.
  const events = new Map<string, { customerCode: string; date: string; completed: boolean; email: boolean }>();
  let rawRows = 0, invalidRows = 0, duplicateRows = 0;
  for (const row of values) {
    const cell = (index: number) => String(row[index] ?? "").trim();
    if (![at.customer, at.timestamp, at.status, at.method].some((index) => cell(index))) continue;
    rawRows++;
    const customerCode = cell(at.customer);
    const date = normalizeAnalysisDate(cell(at.timestamp));
    if (!customerCode || !date) { invalidRows++; continue; }
    const key = JSON.stringify([customerCode, cell(at.timestamp), cell(at.method), cell(at.scenario), cell(at.node), cell(at.template)]);
    const completed = cell(at.status) === "完了";
    const previous = events.get(key);
    if (previous) {
      duplicateRows++;
      if (completed) previous.completed = true;
      continue;
    }
    events.set(key, { customerCode, date, completed, email: cell(at.method) === "メール" });
  }
  const dates = [...events.values()].filter((event) => event.email).map((event) => event.date).sort();
  const rows = [...events.values()].filter((event) => event.email && event.completed)
    .map(({ customerCode, date }) => ({ customerCode, date }));
  return {
    rows, from: dates[0] ?? null, to: dates.at(-1) ?? null, rawRows, invalidRows, duplicateRows,
    excludedRows: events.size - rows.length, available: true, error: null,
  };
}

export interface OptoutAnalysisFilters {
  monthFrom?: string;
  monthTo?: string;
  optoutFrom?: string;
  optoutTo?: string;
  customerCode?: string;
  page?: number;
  pageSize?: number;
}

export function analyzeOptoutTiming(
  purchases: readonly LtvRow[],
  optouts: readonly OptoutRow[],
  mail: MailHistory,
  filters: OptoutAnalysisFilters = {},
  metadata: { purchaseSyncedAt: string | null; fetchedAt: string },
): LtvOptoutAnalysis {
  const customers = new Map<string, { firstMonth: string | null; subscriptions: Set<string> }>();
  for (const row of purchases) {
    const code = row.customerCode.trim();
    if (!code) continue;
    const entry = customers.get(code) ?? { firstMonth: null, subscriptions: new Set<string>() };
    const date = normalizeAnalysisDate(row.firstOrderMonth);
    const month = date?.slice(0, 7) ?? null;
    if (month && (!entry.firstMonth || month < entry.firstMonth)) entry.firstMonth = month;
    if (row.subsOrderCode.trim()) entry.subscriptions.add(row.subsOrderCode.trim());
    customers.set(code, entry);
  }
  const events = new Map<string, Set<string>>();
  const optoutDates: string[] = [];
  for (const row of optouts) {
    const code = row.customerCode.trim();
    const date = normalizeAnalysisDate(row.optoutDate);
    if (!code || !date) continue;
    const dates = events.get(code) ?? new Set<string>();
    dates.add(date);
    events.set(code, dates);
    optoutDates.push(date);
  }
  optoutDates.sort();
  const mailByCustomer = new Map<string, string[]>();
  if (mail.available) {
    for (const event of mail.rows) {
      const dates = mailByCustomer.get(event.customerCode) ?? [];
      dates.push(event.date);
      mailByCustomer.set(event.customerCode, dates);
    }
  }
  let unmatchedOptoutCustomers = 0, unknownPurchaseMonthCustomers = 0, beforePurchaseOnlyCustomers = 0;
  const matched: LtvOptoutCustomer[] = [];
  for (const [customerCode, dates] of events) {
    const purchase = customers.get(customerCode);
    if (!purchase) { unmatchedOptoutCustomers++; continue; }
    if (!purchase.firstMonth) { unknownPurchaseMonthCustomers++; continue; }
    // Choose the first eligible event BEFORE applying filters, never a later re-opt-out.
    const optoutDate = [...dates].sort().find((date) => date >= `${purchase.firstMonth}-01`);
    if (!optoutDate) { beforePurchaseOnlyCustomers++; continue; }
    const first = purchase.firstMonth;
    const monthIndex = (Number(optoutDate.slice(0, 4)) - Number(first.slice(0, 4))) * 12
      + Number(optoutDate.slice(5, 7)) - Number(first.slice(5, 7)) + 1;
    const observed = mailByCustomer.get(customerCode) ?? [];
    const before = observed.filter((date) => date < optoutDate).length;
    const sameDay = observed.filter((date) => date === optoutDate).length;
    const inPeriod = mail.available && !!mail.from && !!mail.to && optoutDate >= mail.from && optoutDate <= mail.to;
    const mailStatus: LtvOptoutCustomer["mailStatus"] = !mail.available ? "unavailable"
      : !mail.from || !mail.to ? "no_matching_history"
      : !inPeriod ? "outside_period" : before > 0 ? "history_incomplete"
      : sameDay > 0 ? "same_day_only" : "no_matching_history";
    matched.push({
      customerCode, firstPurchaseMonth: first, optoutDate, monthIndex,
      subscriptionCount: purchase.subscriptions.size,
      // Absence of a matched event is not evidence of lifetime zero delivery.
      observedBeforeCount: mail.available && before > 0 ? before : null,
      sameDayCount: mail.available && (inPeriod || sameDay > 0) ? sameDay : null,
      cumulativeCount: null, mailStatus,
    });
  }
  const filtered = matched.filter((row) =>
    (!filters.monthFrom || row.firstPurchaseMonth >= filters.monthFrom) &&
    (!filters.monthTo || row.firstPurchaseMonth <= filters.monthTo) &&
    (!filters.optoutFrom || row.optoutDate >= filters.optoutFrom) &&
    (!filters.optoutTo || row.optoutDate <= filters.optoutTo) &&
    (!filters.customerCode || row.customerCode.includes(filters.customerCode.trim())),
  ).sort((a, b) => a.optoutDate.localeCompare(b.optoutDate) || a.customerCode.localeCompare(b.customerCode));
  const total = filtered.length;
  const monthCounts = new Map<number, number>();
  const mailCounts = new Map<number | null, number>();
  for (const row of filtered) {
    monthCounts.set(row.monthIndex, (monthCounts.get(row.monthIndex) ?? 0) + 1);
    mailCounts.set(row.observedBeforeCount, (mailCounts.get(row.observedBeforeCount) ?? 0) + 1);
  }
  const share = (count: number) => total ? count / total : 0;
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 25)));
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(Math.max(1, Math.trunc(filters.page ?? 1)), Math.max(1, totalPages));
  return {
    sources: {
      ...metadata, mailAvailable: mail.available, mailFrom: mail.from, mailTo: mail.to,
      optoutFrom: optoutDates[0] ?? null, optoutTo: optoutDates.at(-1) ?? null,
      mailRows: mail.rawRows, completedMailRows: mail.rows.length,
      excludedMailRows: mail.excludedRows, duplicateMailRows: mail.duplicateRows, invalidMailRows: mail.invalidRows,
      mailError: mail.error,
    },
    summary: {
      purchaseCustomers: customers.size, optoutCustomers: events.size, unmatchedOptoutCustomers,
      unknownPurchaseMonthCustomers, beforePurchaseOnlyCustomers, matchedCustomers: matched.length,
      analyzedCustomers: total, observedMailCustomers: filtered.filter((row) => row.observedBeforeCount !== null).length,
      cumulativeUnknownCustomers: total, sameDayMailCustomers: filtered.filter((row) => (row.sameDayCount ?? 0) > 0).length,
    },
    monthDistribution: [...monthCounts].sort(([a], [b]) => a - b)
      .map(([monthIndex, count]) => ({ monthIndex, count, share: share(count) })),
    mailDistribution: [...mailCounts].sort(([a], [b]) => a === null ? 1 : b === null ? -1 : a - b)
      .map(([observedCount, count]) => ({ observedCount, label: observedCount === null ? "判定不可" : `${observedCount}通（確認分）`, count, share: share(count) })),
    customers: filtered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, totalPages,
    notes: [
      "顧客番号で結合し、顧客1人を1件として集計します。複数定期がある顧客は全経路データ内の最も早い初回購入月を使います。2026年以前を含む生涯初回購入とは限りません。",
      "初回購入月を1ヶ月目とする暦月差です。同じ月の解除は1ヶ月目、翌月は2ヶ月目です。初回月以降の最初の解除だけを選び、その後に絞り込みます。",
      "オプトアウト日は日次の状態変化から推定した日付で、操作日時ではありません。初回購入月と同月内の購入・解除の前後関係も不明です。",
      "割合の分母は絞り込み後の解除顧客数です。未解除顧客を含む解除率や、メールが解除を引き起こした割合ではありません。",
      "メールは配信方法が「メール」かつ配信ステータス「完了」の記録だけを数えます。配信不可・スキップは除外します。受信箱への実到達を保証する値ではありません。",
      "確認通数は、確認できる配信履歴の開始から推定解除日の前日までの記録数で、購入後のみに限定していません。解除日当日の配信は前後不明のため別表示です。",
      "配信履歴は全期間・全シナリオの網羅性を確認できません。累計何通目かは全顧客で判定不可です。事前の配信記録が無い顧客も0通とは表示しません。",
      "購入データはLTVの保存済み全経路データ、解除・メール実績は元シートの読取スナップショットを使用します。再取得はDBの購入データを更新しません。",
    ],
  };
}
