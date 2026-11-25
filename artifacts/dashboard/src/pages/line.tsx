import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLineData, useGetLineDeliveries, useSyncLine,
  getGetLineDataQueryKey, getGetLineDeliveriesQueryKey,
} from "@workspace/api-client-react";
import type {
  GetLineDataParams, GetLineDataGrain, LineDataResponse, LineZonePeriod,
} from "@workspace/api-client-react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { RefreshCw, Info, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import LineDeliveryBlocks from "@/components/LineDeliveryBlocks";
import { formatNumber, formatDate } from "@/lib/format";

const YELLOW = "#FBBF24";
const CARD = { border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };
const inputCls = "rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus-visible:outline-2 focus-visible:outline-amber-500";

/** ゾーンの色。左から右へ粒度が細かくなるシートの並びに合わせて固定する。 */
const ZONE_COLORS: Record<string, string> = {
  overall: "#1A1A1A", tagged: "#6B7280", qrNew: "#4285F4", qrOld: "#EA4335",
  site: "#34A853", noah: "#A855F7", cosfesOsaka: "#F97316", cosfesFukuoka: "#0EA5E9",
  richMenu: "#FBBC04", other: "#9CA3AF",
};

const GRAINS: { value: GetLineDataGrain; label: string }[] = [
  { value: "day", label: "日別" },
  { value: "week", label: "週別" },
  { value: "month", label: "月別" },
];

const pct = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
const nn = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : formatNumber(value);
const periodLabel = (period: string, grain: GetLineDataGrain) =>
  grain === "month" ? period.slice(0, 7).replace("-", "/") : period.slice(5).replace("-", "/");

export default function LinePage() {
  const queryClient = useQueryClient();
  const [grain, setGrain] = useState<GetLineDataGrain>("day");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [zones, setZones] = useState<string[]>(["overall"]);

  const params: GetLineDataParams = useMemo(() => ({
    grain,
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
    ...(zones.length && { zones: zones.join("|") }),
  }), [grain, dateFrom, dateTo, zones]);
  const deliveryParams = useMemo(() => ({
    ...(dateFrom && { dateFrom }),
    ...(dateTo && { dateTo }),
  }), [dateFrom, dateTo]);

  const query = useGetLineData(params, {
    query: { queryKey: getGetLineDataQueryKey(params), staleTime: 300000, refetchOnWindowFocus: false },
  });
  const deliveries = useGetLineDeliveries(deliveryParams, {
    query: { queryKey: getGetLineDeliveriesQueryKey(deliveryParams), staleTime: 300000, refetchOnWindowFocus: false },
  });
  const sync = useSyncLine({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/line/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/line/deliveries"] });
      },
    },
  });

  const data = query.data;
  const rangeError = dateFrom && dateTo && dateFrom > dateTo ? "期間の開始が終了より後です。" : null;
  const toggleZone = (key: string) =>
    setZones((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white px-4 md:px-8 h-14 flex items-center justify-between shrink-0 gap-2" style={{ borderBottom: "1px solid #EBEBEB" }}>
        <div className="min-w-0">
          <div className="hidden sm:block text-xs" style={{ color: "#9CA3AF" }}>O2O×SICKS／LINE実績レポート</div>
          <div className="text-sm md:text-base font-bold leading-tight truncate" style={{ color: "#1A1A1A" }} data-testid="heading-title">LINE分析</div>
        </div>
        <button onClick={() => sync.mutate(undefined)} disabled={sync.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
          style={{ background: YELLOW, color: "#fff", boxShadow: `0 1px 4px ${YELLOW}66` }} data-testid="button-sync-line"
          title="LINE実績レポートのスプレッドシートを読み直してDBへ入れ直します。">
          <RefreshCw size={12} className={sync.isPending ? "animate-spin" : ""} />
          <span className="hidden sm:inline">スプレッドシートから更新</span><span className="sm:hidden">更新</span>
        </button>
      </div>

      <main className="flex-1 overflow-auto p-4 md:p-8" style={{ background: "#F8F8F8" }}>
        <div className="flex flex-col gap-4 md:gap-5">
          {sync.isError && (
            <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs leading-5 text-red-700" style={{ border: "1px solid #FECACA" }} data-testid="alert-line-sync-error">
              <AlertTriangle size={14} className="inline mr-1" />
              取り込みに失敗しました。表示中のデータは前回取り込み分です。
              {sync.error?.data?.error && <span className="break-all">（{sync.error.data.error}）</span>}
            </div>
          )}
          {sync.isSuccess && !sync.isPending && (
            <div role="status" className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs leading-5 text-amber-900" style={{ border: "1px solid #FDE68A" }} data-testid="status-line-sync">
              {formatDate(sync.data.syncedAt)} に取り込みました。
              日実績 {formatNumber(sync.data.dailyRows)}日分 ／ 経路行 {formatNumber(sync.data.zoneRows)} ／
              識別子 {formatNumber(sync.data.masterRows)}本 ／ CV {formatNumber(sync.data.cvRows)}行。
              {sync.data.masterSkipped > 0 && <> パラメURLが未発行の行 {formatNumber(sync.data.masterSkipped)} 件は取り込んでいません。</>}
              {sync.data.columnCountWarning && <div className="mt-1 font-semibold">{sync.data.columnCountWarning}</div>}
              {sync.data.issues.length > 0 && (
                <div className="mt-1">
                  <span className="font-semibold">検算に合わない行が {formatNumber(sync.data.issues.length)} 件あります。</span>
                  {" "}列がずれたか、列を持たない流入経路が増えた可能性があります。
                </div>
              )}
            </div>
          )}

          {/* 絞り込み */}
          <div className="bg-white rounded-xl px-4 md:px-5 py-3 md:py-4 flex flex-col gap-3" style={{ border: "1px solid #EBEBEB" }} data-testid="line-filters">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-gray-500">表示単位
                <select value={grain} onChange={(event) => setGrain(event.target.value as GetLineDataGrain)} className={inputCls} data-testid="select-line-grain">
                  {GRAINS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">期間
                <span className="flex items-center gap-1.5">
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={inputCls} aria-label="期間の開始" data-testid="input-line-date-from" />
                  <span className="text-gray-400">〜</span>
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={inputCls} aria-label="期間の終了" data-testid="input-line-date-to" />
                </span>
              </label>
              {(dateFrom || dateTo) && (
                <button type="button" className="text-xs text-amber-700 underline" onClick={() => { setDateFrom(""); setDateTo(""); }} data-testid="button-line-clear-range">期間をクリア</button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500 mr-1">経路</span>
              {(data?.zones ?? []).map((zone) => {
                const active = zones.includes(zone.key);
                return (
                  <button key={zone.key} type="button" onClick={() => toggleZone(zone.key)} aria-pressed={active}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${active ? "text-white" : "border border-gray-200 bg-white text-gray-600"}`}
                    style={active ? { background: ZONE_COLORS[zone.key] ?? YELLOW } : undefined}
                    data-testid={`toggle-zone-${zone.key}`}>
                    {zone.label}
                  </button>
                );
              })}
            </div>
            {rangeError && <p className="text-xs text-red-600" role="alert">{rangeError}</p>}
            {zones.length === 0 && <p className="text-xs text-amber-700" role="status">経路を1つ以上選ぶと表示されます。</p>}
            <p className="text-[11px] leading-5 text-gray-400">
              「全体」はLINEアカウント全体、「タグ計」は流入経路のタグが付いている人の合計です。
              タグ網羅率は約半分なので、両方を並べると「タグ付き層 vs タグなし層」の比較になります。
            </p>
          </div>

          {query.isLoading ? (
            <div className="flex flex-col gap-4" data-testid="line-loading">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-24 w-full" />)}</div>
              <Skeleton className="h-72 w-full" /><Skeleton className="h-64 w-full" />
            </div>
          ) : query.isError || !data ? (
            <div className="bg-white rounded-xl p-10 text-center text-sm text-red-500" role="alert" style={CARD} data-testid="line-error">
              LINEのデータを取得できませんでした。
              {query.error?.data?.error && <div className="mt-1 text-xs break-all">{query.error.data.error}</div>}
              <div className="mt-3 flex items-center justify-center gap-2">
                <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700" onClick={() => query.refetch()} data-testid="button-line-retry">再読み込み</button>
                <button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: YELLOW }} onClick={() => sync.mutate(undefined)} data-testid="button-line-sync-empty">スプレッドシートから更新</button>
              </div>
            </div>
          ) : data.items.length === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center text-sm text-gray-500" style={CARD} data-testid="line-empty">
              {zones.length === 0 ? "経路を選んでください。" : "この条件に合うデータがありません。まだ取り込んでいない場合は「スプレッドシートから更新」を押してください。"}
            </div>
          ) : (
            <Results data={data} grain={grain} zones={zones} fetching={query.isFetching} />
          )}

          {/* 配信別（経路の絞り込みは関係ない。期間だけ効く） */}
          {deliveries.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : deliveries.isError || !deliveries.data ? (
            <div className="bg-white rounded-xl p-8 text-center text-sm text-red-500" role="alert" style={CARD} data-testid="line-deliveries-error">
              配信別のデータを取得できませんでした。上の経路別は表示できています。
              {deliveries.error?.data?.error && <div className="mt-1 text-xs break-all">{deliveries.error.data.error}</div>}
              <div className="mt-3"><button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700" onClick={() => deliveries.refetch()} data-testid="button-line-deliveries-retry">再読み込み</button></div>
            </div>
          ) : (
            <LineDeliveryBlocks data={deliveries.data} />
          )}
        </div>
      </main>
    </div>
  );
}

function Results({ data, grain, zones, fetching }: {
  data: LineDataResponse; grain: GetLineDataGrain; zones: string[]; fetching: boolean;
}) {
  const labelOf = (key: string) => data.zones.find((zone) => zone.key === key)?.label ?? key;
  const periods = [...new Set(data.items.map((item) => item.period))].sort();
  const chart = periods.map((period) => {
    const point: Record<string, string | number | null> = { period: periodLabel(period, grain) };
    for (const key of zones) {
      const found = data.items.find((item) => item.period === period && item.zone === key);
      point[`active_${key}`] = found?.active ?? null;
      point[`cv_${key}`] = found?.cv ?? null;
      point[`lp_${key}`] = found?.lpAccess ?? null;
    }
    return point;
  });
  const balanceZones = zones.filter((key) => data.zones.find((zone) => zone.key === key)?.hasBalance);
  const cvZones = zones.filter((key) => data.zones.find((zone) => zone.key === key)?.hasCv);
  const summary = data.summary;

  return (
    <div className={`flex flex-col gap-4 md:gap-5 transition-opacity ${fetching ? "opacity-60" : ""}`} aria-busy={fetching}>
      {data.issues.length > 0 && (
        <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900" style={{ border: "1px solid #FDE68A" }} data-testid="alert-line-issues">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <strong>元シートの検算に合わない行が {formatNumber(data.issues.length)} 件あります。</strong>
              列がずれたか、列を持たない流入経路が増えた可能性があります。経路別の内訳を信用する前に確認してください。
              <ul className="mt-1.5 space-y-0.5">
                {data.issues.slice(0, 5).map((issue, index) => (
                  <li key={index} className="tabular-nums break-words">
                    {issue.date.replaceAll("-", "/")} — {issue.check}：{issue.detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" data-testid="line-kpis">
        <Kpi label={`友だち数（${zones.length === 1 ? labelOf(zones[0]) : "全体"}・残存）`} value={nn(summary.activeLatest)} unit="人" accent
          sub={summary.activeLatestDate ? `${summary.activeLatestDate.replaceAll("-", "/")} 時点` : "残高の記録なし"} testId="kpi-line-active" />
        <Kpi label="期間の新規" value={formatNumber(summary.newCount)} unit="人"
          sub={`即ブロック ${formatNumber(summary.instantBlock)}人（${pct(summary.instantBlockRate)}）`} testId="kpi-line-new" />
        <Kpi label="LPアクセス" value={formatNumber(summary.lpAccess)} unit="件"
          sub={`ブロック率 ${pct(summary.blockRateLatest)}（累計）`} testId="kpi-line-lp" />
        <Kpi label="サブスクCV" value={formatNumber(summary.cv)} unit="件"
          sub={`CVR(LP) ${pct(summary.cvrLp)} ／ 対新規 ${pct(summary.convRate)}`} testId="kpi-line-cv" />
      </div>

      {balanceZones.length > 0 && (
        <section className="bg-white rounded-xl p-4 md:p-6 min-w-0" style={CARD} data-testid="card-line-active">
          <h2 className="text-sm font-bold text-gray-900">友だち数（残存）の推移</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            人数(累計) − ブロック数(累計)。各期間の<strong>最終日の残高</strong>で、期間の合計ではありません。
          </p>
          <div className="mt-3" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              <ComposedChart data={chart} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="period" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} width={52} tickFormatter={(value) => formatNumber(value as number)} />
                <Tooltip formatter={(value) => formatNumber(value as number)} isAnimationActive={false}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {balanceZones.map((key) => (
                  <Line key={key} type="monotone" dataKey={`active_${key}`} name={labelOf(key)} stroke={ZONE_COLORS[key] ?? YELLOW}
                    strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {cvZones.length > 0 && (
        <section className="bg-white rounded-xl p-4 md:p-6 min-w-0" style={CARD} data-testid="card-line-cv">
          <h2 className="text-sm font-bold text-gray-900">LPアクセスとサブスクCV</h2>
          <p className="mt-0.5 text-xs text-gray-400">棒＝LPアクセス（左軸）、線＝CV（右軸）。どちらも期間の合計です。</p>
          <div className="mt-3" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%" debounce={0}>
              <ComposedChart data={chart} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="period" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis yAxisId="left" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} width={48} tickFormatter={(value) => formatNumber(value as number)} />
                <YAxis yAxisId="right" orientation="right" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false} width={40} tickFormatter={(value) => formatNumber(value as number)} />
                <Tooltip formatter={(value) => formatNumber(value as number)} isAnimationActive={false}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {cvZones.map((key) => (
                  <Bar key={`lp-${key}`} yAxisId="left" dataKey={`lp_${key}`} name={`${labelOf(key)} LPアクセス`}
                    fill={ZONE_COLORS[key] ?? YELLOW} fillOpacity={0.35} maxBarSize={28} isAnimationActive={false} />
                ))}
                {cvZones.map((key) => (
                  <Line key={`cv-${key}`} yAxisId="right" type="monotone" dataKey={`cv_${key}`} name={`${labelOf(key)} CV`}
                    stroke={ZONE_COLORS[key] ?? YELLOW} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <PeriodTable data={data} grain={grain} labelOf={labelOf} />

      <section className="bg-white rounded-xl p-4 md:p-5" style={CARD} data-testid="card-line-notes">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900"><Info size={14} className="text-gray-400" />数字の読み方</h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-gray-500">
          {data.notes.map((note, index) => <li key={index} className="break-words">{note}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-gray-400">
          データの期間: {data.dateMin ? data.dateMin.replaceAll("-", "/") : "—"} 〜 {data.dateMax ? data.dateMax.replaceAll("-", "/") : "—"}
          {data.lastSyncedAt && <> ／ 最終取り込み: {formatDate(data.lastSyncedAt)}</>}
        </p>
      </section>
    </div>
  );
}

function PeriodTable({ data, grain, labelOf }: {
  data: LineDataResponse; grain: GetLineDataGrain; labelOf: (key: string) => string;
}) {
  const rows = [...data.items].sort((a, b) => b.period.localeCompare(a.period) || a.zone.localeCompare(b.zone));
  return (
    <section className="bg-white rounded-xl overflow-hidden" style={CARD} data-testid="card-line-table">
      <div className="px-4 md:px-6 py-3" style={{ borderBottom: "1px solid #F3F4F6" }}>
        <h2 className="text-sm font-bold text-gray-900">期間 × 経路の明細 <span className="ml-1 text-xs font-normal text-gray-400">{formatNumber(rows.length)} 行</span></h2>
        <p className="mt-0.5 text-xs text-gray-400">新しい期間が上。残高は期末、フローは合計です。</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">期間</th>
              <th className="px-3 py-2 font-medium">経路</th>
              <th className="px-3 py-2 font-medium text-right">残存</th>
              <th className="px-3 py-2 font-medium text-right">純増</th>
              <th className="px-3 py-2 font-medium text-right">新規</th>
              <th className="px-3 py-2 font-medium text-right">即ブロック率</th>
              <th className="px-3 py-2 font-medium text-right">ブロック率</th>
              <th className="px-3 py-2 font-medium text-right">LPアクセス</th>
              <th className="px-3 py-2 font-medium text-right">CV</th>
              <th className="px-3 py-2 font-medium text-right">CVR(LP)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item: LineZonePeriod) => (
              <tr key={`${item.period}|${item.zone}`} className="border-t border-gray-100" data-testid={`row-line-${item.period}-${item.zone}`}>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{grain === "month" ? item.period.slice(0, 7).replace("-", "/") : item.period.replaceAll("-", "/")}</td>
                <td className="px-3 py-2 whitespace-nowrap">{labelOf(item.zone)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{nn(item.active)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${(item.activeDelta ?? 0) < 0 ? "text-red-600" : ""}`}>
                  {item.activeDelta === null ? "—" : `${item.activeDelta > 0 ? "+" : ""}${formatNumber(item.activeDelta)}`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{nn(item.newCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(item.instantBlockRate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(item.blockRate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{nn(item.lpAccess)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{nn(item.cv)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(item.cvrLp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kpi({ label, value, unit, sub, accent, testId }: {
  label: string; value: string; unit: string; sub?: string; accent?: boolean; testId: string;
}) {
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
