import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLtvOptoutAnalysis, useRefreshLtvOptoutAnalysis, getGetLtvOptoutAnalysisQueryKey,
  useGetOptoutMailAnalysis, getGetOptoutMailAnalysisQueryKey,
} from "@workspace/api-client-react";
import type {
  GetLtvOptoutAnalysisParams, GetOptoutMailAnalysisParams, GetOptoutMailAnalysisScenarioKind,
  LtvOptoutCustomerMailStatus, LtvOptoutAnalysis, OptoutMailAnalysis,
} from "@workspace/api-client-react";
import { ArrowLeft, RefreshCw, Info, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthDistributionChart, MailDistributionChart } from "@/components/LtvOptoutCharts";
import { OptoutMailBlocks } from "@/components/OptoutMailBlocks";
import { formatNumber, formatDate } from "@/lib/format";

const YELLOW = "#FBBF24";
const CARD = { border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };

const MAIL_STATUS: Record<LtvOptoutCustomerMailStatus, { label: string; desc: string }> = {
  history_incomplete: { label: "履歴が不完全", desc: "解除前日までの配信記録はありますが、取得できている配信履歴は一部期間・一部シナリオのみのため、実際の配信数はこれより多い可能性があります。" },
  same_day_only: { label: "同日の配信のみ", desc: "解除推定日と同じ日の配信記録のみです。同日内の前後関係が分からないため、解除前に届いたかは判定できません。" },
  outside_period: { label: "配信履歴の期間外", desc: "解除推定日が配信履歴の取得期間外です。記録がある分の通数は表示しますが、解除前の配信全体を網羅するものではありません。" },
  no_matching_history: { label: "該当する記録なし", desc: "取得期間内にこの顧客の配信完了記録が見つかりません。0通だったとは限りません（対象外シナリオや取得漏れの可能性）。" },
  unavailable: { label: "配信履歴を取得不可", desc: "配信履歴データを取得できなかったため判定できません。" },
};

const PAGE_SIZES = [25, 50, 100];

interface Draft { monthFrom: string; monthTo: string; optoutFrom: string; optoutTo: string; customerCode: string }
const EMPTY: Draft = { monthFrom: "", monthTo: "", optoutFrom: "", optoutTo: "", customerCode: "" };

const nn = (v: number | null | undefined) => (v == null ? "判定不可" : formatNumber(v));
const dateText = (v: string | null | undefined) => (v ? v.replace(/-/g, "/") : "不明");

export default function LtvOptoutsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params: GetLtvOptoutAnalysisParams = {
    ...(applied.monthFrom && { monthFrom: applied.monthFrom }),
    ...(applied.monthTo && { monthTo: applied.monthTo }),
    ...(applied.optoutFrom && { optoutFrom: applied.optoutFrom }),
    ...(applied.optoutTo && { optoutTo: applied.optoutTo }),
    ...(applied.customerCode.trim() && { customerCode: applied.customerCode.trim() }),
    page, pageSize,
  };
  const query = useGetLtvOptoutAnalysis(params, {
    query: { queryKey: getGetLtvOptoutAnalysisQueryKey(params), staleTime: 300000, refetchOnWindowFocus: false },
  });
  // 配信×解除の分析は上の絞り込みの影響を受けない（全体の傾向を見るもの）ので、別の問い合わせにする。
  // 片方が落ちてももう片方は表示できる。
  //
  // 既定をステップ配信だけにしているのは、一斉配信が1日でほぼ全顧客に当たるため。
  // 混ぜるとどのテンプレートにも等しく解除がぶら下がり、順番も頻度も意味を失う。
  const [scenarioKind, setScenarioKind] = useState<GetOptoutMailAnalysisScenarioKind>("step");
  const mailParams: GetOptoutMailAnalysisParams = { minEvents: 200, scenarioKind };
  const mailQuery = useGetOptoutMailAnalysis(mailParams, {
    query: { queryKey: getGetOptoutMailAnalysisQueryKey(mailParams), staleTime: 300000, refetchOnWindowFocus: false },
  });
  const refresh = useRefreshLtvOptoutAnalysis({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/ltv/optout-analysis"] });
        queryClient.invalidateQueries({ queryKey: ["/api/ltv/optout-mail-analysis"] });
      },
    },
  });

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const rangeError = (draft.monthFrom && draft.monthTo && draft.monthFrom > draft.monthTo)
    ? "初回購入月の開始が終了より後です。"
    : (draft.optoutFrom && draft.optoutTo && draft.optoutFrom > draft.optoutTo) ? "解除推定日の開始が終了より後です。" : null;
  const apply = () => { if (rangeError) return; setApplied(draft); setPage(1); };
  const reset = () => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); };
  const data = query.data;

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white px-4 md:px-8 h-14 flex items-center justify-between shrink-0 gap-2" style={{ borderBottom: "1px solid #EBEBEB" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 md:hidden" />
          <Link href="/ltv" className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-700 shrink-0" data-testid="link-back-ltv">
            <ArrowLeft size={14} /> <span className="hidden sm:inline">LTV分析へ戻る</span>
          </Link>
          <div className="min-w-0">
            <div className="hidden sm:block text-xs" style={{ color: "#9CA3AF" }}>LTV分析 · 全経路</div>
            <div className="text-sm md:text-base font-bold leading-tight truncate" style={{ color: "#1A1A1A" }} data-testid="heading-title">解除タイミング分析</div>
          </div>
        </div>
        <button onClick={() => refresh.mutate(undefined)} disabled={refresh.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
          style={{ background: YELLOW, color: "#fff", boxShadow: `0 1px 4px ${YELLOW}66` }} data-testid="button-refresh-optouts"
          title="配信履歴と解除データのみ再取得します。購入データは更新しません。">
          <RefreshCw size={12} className={refresh.isPending ? "animate-spin" : ""} />
          <span className="hidden sm:inline">配信・解除データを再取得</span><span className="sm:hidden">再取得</span>
        </button>
      </div>

      <main className="flex-1 overflow-auto p-4 md:p-8" style={{ background: "#F8F8F8" }}>
        <div className="flex flex-col gap-4 md:gap-5">
          {refresh.isError && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700" style={{ border: "1px solid #FECACA" }} data-testid="alert-refresh-error">
              <AlertTriangle size={14} /> 配信・解除データの再取得に失敗しました。表示中のデータは前回取得分です。
              {refresh.error?.data?.error && <span className="break-all">（{refresh.error.data.error}）</span>}
              <button className="underline" onClick={() => refresh.mutate(undefined)} data-testid="button-retry-refresh">再試行</button>
            </div>
          )}
          {refresh.isSuccess && !refresh.isPending && (
            <div role="status" className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-800" style={{ border: "1px solid #FDE68A" }} data-testid="status-refresh-success">
              {formatDate(refresh.data.fetchedAt)} に配信・解除データを再取得しました（購入データは対象外）。
              {!refresh.data.mailAvailable && " ただし配信履歴は取得できませんでした。"}
            </div>
          )}

          {/* Filters */}
          <form className="bg-white rounded-xl px-4 md:px-5 py-3 md:py-4 flex flex-wrap items-end gap-3" style={{ border: "1px solid #EBEBEB" }}
            onSubmit={(e) => { e.preventDefault(); apply(); }} data-testid="optout-filters">
            <Field label="初回購入月（観測上）">
              <input type="month" value={draft.monthFrom} onChange={(e) => setDraft({ ...draft, monthFrom: e.target.value })} className={inputCls} data-testid="input-month-from" aria-label="初回購入月の開始" />
              <span className="text-gray-400">〜</span>
              <input type="month" value={draft.monthTo} onChange={(e) => setDraft({ ...draft, monthTo: e.target.value })} className={inputCls} data-testid="input-month-to" aria-label="初回購入月の終了" />
            </Field>
            <Field label="解除推定日">
              <input type="date" value={draft.optoutFrom} onChange={(e) => setDraft({ ...draft, optoutFrom: e.target.value })} className={inputCls} data-testid="input-optout-from" aria-label="解除推定日の開始" />
              <span className="text-gray-400">〜</span>
              <input type="date" value={draft.optoutTo} onChange={(e) => setDraft({ ...draft, optoutTo: e.target.value })} className={inputCls} data-testid="input-optout-to" aria-label="解除推定日の終了" />
            </Field>
            <Field label="顧客番号（部分一致）">
              <input type="text" value={draft.customerCode} onChange={(e) => setDraft({ ...draft, customerCode: e.target.value })}
                placeholder="顧客番号を入力" className={`${inputCls} w-36 font-mono`} data-testid="input-customer-code" />
            </Field>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={!!rangeError}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${dirty ? "bg-amber-400 text-white" : "border border-gray-200 bg-white text-gray-600"}`}
                data-testid="button-apply-filters">条件を適用</button>
              <button type="button" onClick={reset} className="text-xs text-amber-700 underline" data-testid="button-reset-filters">条件をクリア</button>
            </div>
            {rangeError && <p className="w-full text-xs text-red-600" role="alert">{rangeError}</p>}
            {dirty && !rangeError && <p className="w-full text-[11px] text-amber-700" role="status">未適用の条件があります。「条件を適用」で反映されます。</p>}
            <p className="w-full text-[11px] leading-5 text-gray-400">
              この画面はLTV分析の絞り込みとは独立しており、全経路のデータのみを対象にします。解除日の絞り込みは、各顧客の最初の対象解除を選んだ後に適用されます。
            </p>
          </form>

          {query.isLoading ? (
            <div className="flex flex-col gap-4" data-testid="optouts-loading">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
              <Skeleton className="h-72 w-full" /><Skeleton className="h-64 w-full" />
            </div>
          ) : query.isError || !data ? (
            <div className="bg-white rounded-xl p-10 text-center text-sm text-red-500" role="alert" style={{ border: "1px solid #EBEBEB" }} data-testid="optouts-error">
              解除タイミング分析のデータを取得できませんでした。
              {query.error?.data?.error && <div className="mt-1 text-xs break-all">{query.error.data.error}</div>}
              <div className="mt-3"><button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700" onClick={() => query.refetch()} data-testid="button-retry-query">再読み込み</button></div>
            </div>
          ) : (
            <Results data={data} fetching={query.isFetching} pageSize={pageSize}
              onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} onReset={reset} hasFilters={JSON.stringify(applied) !== JSON.stringify(EMPTY)}
              mail={mailQuery.data} mailLoading={mailQuery.isLoading} mailError={mailQuery.isError}
              mailErrorText={mailQuery.error?.data?.error} onRetryMail={() => mailQuery.refetch()}
              scenarioKind={scenarioKind} onScenarioKind={setScenarioKind} />
          )}
        </div>
      </main>
    </div>
  );
}

const inputCls = "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus-visible:outline-2 focus-visible:outline-amber-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-gray-500">
      <span>{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Results({ data, fetching, pageSize, onPage, onPageSize, onReset, hasFilters, mail, mailLoading, mailError, mailErrorText, onRetryMail, scenarioKind, onScenarioKind }: {
  data: LtvOptoutAnalysis; fetching: boolean; pageSize: number; onPage: (p: number) => void; onPageSize: (s: number) => void; onReset: () => void; hasFilters: boolean;
  mail?: OptoutMailAnalysis; mailLoading: boolean; mailError: boolean; mailErrorText?: string; onRetryMail: () => void;
  scenarioKind: GetOptoutMailAnalysisScenarioKind; onScenarioKind: (kind: GetOptoutMailAnalysisScenarioKind) => void;
}) {
  const { sources: src, summary: s } = data;
  const empty = s.analyzedCustomers === 0;
  return (
    <div className={`flex flex-col gap-4 md:gap-5 transition-opacity ${fetching ? "opacity-60" : ""}`} aria-busy={fetching}>
      {!src.mailAvailable && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs leading-5 text-red-700" style={{ border: "1px solid #FECACA" }} data-testid="alert-mail-unavailable">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>配信履歴を取得できませんでした。初回購入からの月数の分析は利用できますが、解除前の配信数はすべて「判定不可」です。
            {src.mailError && <span className="block break-all text-red-600/80">詳細: {src.mailError}</span>}</div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" data-testid="optout-kpis">
        <Kpi label="分析対象の解除顧客" value={formatNumber(s.analyzedCustomers)} unit="人" accent sub={`条件適用前の照合済み ${formatNumber(s.matchedCustomers)} 人`} testId="kpi-analyzed" />
        <Kpi label="解除前日までに配信記録あり" value={formatNumber(s.observedMailCustomers)} unit="人" sub="取得できた履歴の範囲内" testId="kpi-observed-mail" />
        <Kpi label="解除当日の配信記録あり" value={formatNumber(s.sameDayMailCustomers)} unit="人" sub="解除との前後は不明" testId="kpi-same-day" />
        <Kpi label="累計配信数が判定不可" value={formatNumber(s.cumulativeUnknownCustomers)} unit="人" sub="履歴が部分的なため" testId="kpi-cumulative-unknown" />
      </div>

      {/* Source-wide diagnostics */}
      <section className="bg-white rounded-xl p-4 md:p-5" style={CARD} data-testid="section-diagnostics">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-bold text-gray-900">データ全体の照合状況</h2>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">データ全体・絞り込み条件の影響なし</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <Stat label="購入顧客（全経路）" value={s.purchaseCustomers} testId="diag-purchase" />
          <Stat label="解除顧客" value={s.optoutCustomers} testId="diag-optout" />
          <Stat label="購入データと照合できない解除" value={s.unmatchedOptoutCustomers} testId="diag-unmatched" />
          <Stat label="初回購入月が不明" value={s.unknownPurchaseMonthCustomers} testId="diag-unknown-month" />
          <Stat label="初回購入前の解除のみ" value={s.beforePurchaseOnlyCustomers} testId="diag-before-purchase" />
        </dl>
        <p className="mt-3 text-[11px] leading-5 text-gray-400">件数はすべて顧客単位（定期の件数ではありません）。1顧客1行で、初回購入以降の最初の解除を採用しています。</p>
      </section>

      {empty ? (
        <div className="bg-white rounded-xl p-10 text-center text-sm text-gray-500" style={CARD} data-testid="optouts-empty">
          条件に一致する解除顧客はいません。
          {hasFilters && <div className="mt-3"><button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700" onClick={onReset} data-testid="button-empty-reset">条件をクリア</button></div>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
            <section className="bg-white rounded-xl p-4 md:p-6 min-w-0" style={CARD} data-testid="card-month-distribution">
              <h2 className="text-sm font-bold text-gray-900">初回購入から何ヶ月目に解除したか</h2>
              <p className="mt-0.5 text-xs text-gray-400">解除顧客の人数（初回購入月＝1ヶ月目）。割合は分析対象 {formatNumber(s.analyzedCustomers)} 人に占める比率で、解除率ではありません。</p>
              <div className="mt-3">{data.monthDistribution.length ? <MonthDistributionChart buckets={data.monthDistribution} /> : <NoChart />}</div>
            </section>
            <section className="bg-white rounded-xl p-4 md:p-6 min-w-0" style={CARD} data-testid="card-mail-distribution">
              <h2 className="text-sm font-bold text-gray-900">解除前日までに記録された配信数</h2>
              <p className="mt-0.5 text-xs text-gray-400">取得済み履歴内の配信完了数で、累計何通目かではありません。灰色は記録がなく判定不可（0通とは限りません）。</p>
              <div className="mt-3">{data.mailDistribution.length ? <MailDistributionChart buckets={data.mailDistribution} /> : <NoChart />}</div>
            </section>
          </div>
          <CustomerTable data={data} pageSize={pageSize} onPage={onPage} onPageSize={onPageSize} />
        </>
      )}

      {/* 配信とオプトアウトの関係（絞り込みの影響を受けない全体の傾向） */}
      {mailLoading ? (
        <div className="flex flex-col gap-4" data-testid="optout-mail-loading">
          <Skeleton className="h-72 w-full" /><Skeleton className="h-64 w-full" />
        </div>
      ) : mailError || !mail ? (
        <div className="bg-white rounded-xl p-8 text-center text-sm text-red-500" role="alert" style={CARD} data-testid="optout-mail-error">
          配信とオプトアウトの関係を集計できませんでした。上の分析は表示できています。
          {mailErrorText && <div className="mt-1 text-xs break-all">{mailErrorText}</div>}
          <div className="mt-3"><button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700" onClick={onRetryMail} data-testid="button-retry-mail">再読み込み</button></div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" data-testid="filter-scenario-kind">
            <span className="text-xs text-gray-500">集計する配信</span>
            {([
              { value: "step", label: "ステップ配信のみ", hint: "既定。顧客ごとに起動して長期間に分散する配信" },
              { value: "blast", label: "一斉配信のみ", hint: "1〜2日で出し切る配信" },
              { value: "all", label: "すべて", hint: "混ぜると一斉配信がどのテンプレートにも等しくぶら下がります" },
            ] as const).map((option) => (
              <button
                key={option.value}
                title={option.hint}
                onClick={() => onScenarioKind(option.value)}
                data-testid={`button-kind-${option.value}`}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  scenarioKind === option.value
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <OptoutMailBlocks data={mail} />
        </>
      )}

      <MailStatusLegend />
      <Sources data={data} />
    </div>
  );
}

function NoChart() { return <div className="h-64 flex items-center justify-center text-sm text-gray-300">表示できる分布がありません</div>; }

function CustomerTable({ data, pageSize, onPage, onPageSize }: { data: LtvOptoutAnalysis; pageSize: number; onPage: (p: number) => void; onPageSize: (s: number) => void }) {
  const { page, totalPages } = data;
  return (
    <section className="bg-white rounded-xl overflow-hidden" style={CARD} data-testid="card-customers">
      <div className="px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: "1px solid #F3F4F6" }}>
        <h2 className="text-sm font-bold text-gray-900">顧客別の明細 <span className="ml-1 text-xs font-normal text-gray-400">{formatNumber(data.summary.analyzedCustomers)} 人</span></h2>
        <label className="flex items-center gap-2 text-xs text-gray-500">表示件数
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className={inputCls} data-testid="select-page-size">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}件</option>)}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium">顧客番号</th>
              <th className="px-3 py-2 font-medium">初回購入月（観測上）</th>
              <th className="px-3 py-2 font-medium">解除推定日</th>
              <th className="px-3 py-2 font-medium text-right">何ヶ月目</th>
              <th className="px-3 py-2 font-medium text-right">定期件数</th>
              <th className="px-3 py-2 font-medium text-right">前日までの配信記録</th>
              <th className="px-3 py-2 font-medium text-right">同日の配信</th>
              <th className="px-3 py-2 font-medium text-right">累計何通目</th>
              <th className="px-4 py-2 font-medium">配信履歴の状態</th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((c) => (
              <tr key={c.customerCode} className="border-t border-gray-100" data-testid={`row-customer-${c.customerCode}`}>
                <td className="px-4 py-2 font-mono text-gray-800 whitespace-nowrap">{c.customerCode}</td>
                <td className="px-3 py-2 tabular-nums">{c.firstPurchaseMonth.replace("-", "/")}</td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{dateText(c.optoutDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.monthIndex}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.subscriptionCount)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${c.observedBeforeCount == null ? "text-gray-400" : ""}`}>{nn(c.observedBeforeCount)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${c.sameDayCount == null ? "text-gray-400" : ""}`}>{nn(c.sameDayCount)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${c.cumulativeCount == null ? "text-gray-400" : ""}`}>{nn(c.cumulativeCount)}</td>
                <td className="px-4 py-2" title={MAIL_STATUS[c.mailStatus]?.desc}>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800 whitespace-nowrap">{MAIL_STATUS[c.mailStatus]?.label ?? c.mailStatus}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-3 text-xs text-gray-500" style={{ borderTop: "1px solid #F3F4F6" }}>
        <span data-testid="text-page">{formatNumber(page)} / {formatNumber(Math.max(totalPages, 1))} ページ</span>
        <div className="flex gap-1">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 disabled:opacity-40" data-testid="button-prev-page"><ChevronLeft size={12} />前へ</button>
          <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 disabled:opacity-40" data-testid="button-next-page">次へ<ChevronRight size={12} /></button>
        </div>
      </div>
    </section>
  );
}

function MailStatusLegend() {
  return (
    <section className="bg-white rounded-xl p-4 md:p-5" style={CARD} data-testid="section-mail-status-legend">
      <h2 className="text-sm font-bold text-gray-900">配信数の読み方</h2>
      <ul className="mt-2 space-y-1 text-[11px] leading-5 text-gray-500">
        <li>「前日までの配信記録」は、解除推定日の<strong>前日まで</strong>に取得済み履歴へ記録された配信完了数です。生涯の配信数や実際の受信・開封を意味しません。</li>
        <li>「同日の配信」は解除推定日と同じ日の配信で、同日内の前後関係は分からないため別に数えています。</li>
        <li>「累計何通目」は配信履歴が一部期間・一部シナリオのみのため、現在は判定不可です。</li>
        <li>この分析は解除の時期と配信記録の分布を示すもので、配信が解除の原因であることを示すものではありません。</li>
      </ul>
      <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] leading-5">
        {Object.entries(MAIL_STATUS).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-gray-50 px-3 py-2"><dt className="font-semibold text-gray-700">{v.label}</dt><dd className="text-gray-500">{v.desc}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function Sources({ data }: { data: LtvOptoutAnalysis }) {
  const src = data.sources;
  return (
    <section className="bg-white rounded-xl p-4 md:p-5" style={CARD} data-testid="section-sources">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><Info size={14} className="text-gray-400" />データの出どころと期間</h2>
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-xs">
        <Row k="購入データの最終取り込み" v={src.purchaseSyncedAt ? formatDate(src.purchaseSyncedAt) : "未取り込み"} />
        <Row k="配信・解除データの取得時刻" v={formatDate(src.fetchedAt)} />
        <Row k="配信履歴の期間" v={src.mailFrom || src.mailTo ? `${dateText(src.mailFrom)} 〜 ${dateText(src.mailTo)}` : "不明"} />
        <Row k="解除データの期間" v={src.optoutFrom || src.optoutTo ? `${dateText(src.optoutFrom)} 〜 ${dateText(src.optoutTo)}` : "不明"} />
        <Row k="配信履歴の行数" v={`${formatNumber(src.mailRows)} 行（うち配信完了 ${formatNumber(src.completedMailRows)}）`} />
        <Row k="除外した行" v={`対象外 ${formatNumber(src.excludedMailRows)} / 重複 ${formatNumber(src.duplicateMailRows)} / 不正 ${formatNumber(src.invalidMailRows)}`} />
      </dl>
      <p className="mt-3 text-[11px] leading-5 text-gray-400">解除日は日次スナップショットの差分から推定した日付で、正確な解除時刻ではありません。初回購入月は保存済みの全経路データで観測できる最も早い月で、生涯の初回とは限りません。</p>
      {data.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-4 space-y-1 text-[11px] leading-5 text-gray-500" data-testid="list-notes">
          {data.notes.map((n, i) => <li key={i} className="break-words">{n}</li>)}
        </ul>
      )}
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="min-w-0"><dt className="text-gray-400">{k}</dt><dd className="text-gray-700 tabular-nums break-words">{v}</dd></div>;
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return <div className="rounded-lg bg-gray-50 px-3 py-2" data-testid={testId}><dt className="text-gray-500">{label}</dt><dd className="mt-0.5 text-base font-bold tabular-nums text-gray-900">{formatNumber(value)}<span className="ml-0.5 text-[11px] font-normal text-gray-400">人</span></dd></div>;
}

function Kpi({ label, value, unit, sub, accent, testId }: { label: string; value: string; unit: string; sub?: string; accent?: boolean; testId: string }) {
  return (
    <div className="bg-white rounded-xl p-4 md:p-5" style={CARD} data-testid={testId}>
      <div className="text-xs font-medium text-gray-400">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-xl md:text-2xl font-bold tabular-nums" style={{ color: accent ? YELLOW : "#1A1A1A" }}>{value}</span>
        <span className="text-xs text-gray-400">{unit}</span>
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}
