import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLtvData,
  useGetLtvFilters,
  useSyncLtv,
  getGetLtvDataQueryKey,
} from "@workspace/api-client-react";
import type { GetLtvDataSplitBy, LtvMetrics } from "@workspace/api-client-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer,
} from "recharts";
import { RefreshCw, Info } from "lucide-react";
import MultiSelectCombobox from "@/components/MultiSelectCombobox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatDate } from "@/lib/format";

const YELLOW = "#FBBF24";

/** LTVレポート（スプレッドシート）と同じ配色。Googleスプレッドシートの既定パレット。 */
const LTV_COLORS = {
  ltv95: "#4285F4",
  ltv180: "#EA4335",
  ltv365: "#FBBC04",
  count: "#34A853",
} as const;

/** 内訳を付けたときの系列色。 */
const SEGMENT_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853", "#A855F7", "#F97316", "#0EA5E9", "#EC4899"];

const LTV_METRICS = [
  { value: "ltv95", label: "LTV95", color: LTV_COLORS.ltv95 },
  { value: "ltv180", label: "LTV180", color: LTV_COLORS.ltv180 },
  { value: "ltv365", label: "LTV365", color: LTV_COLORS.ltv365 },
] as const;
type LtvMetricKey = typeof LTV_METRICS[number]["value"];

const SPLIT_OPTIONS: { value: GetLtvDataSplitBy; label: string }[] = [
  { value: "none", label: "なし（全体）" },
  { value: "optout", label: "オプトアウト有無" },
  { value: "offer", label: "オファー" },
  { value: "firstProduct", label: "初回商品" },
  { value: "subsStatus", label: "サブスク状態" },
  { value: "adGroup", label: "広告グループ" },
];

const OPTOUT_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "yes", label: "オプトアウトした顧客のみ" },
  { value: "no", label: "していない顧客のみ" },
] as const;
type OptoutFilter = typeof OPTOUT_OPTIONS[number]["value"];

const yen = (value: number | null | undefined) =>
  value == null ? "—" : `¥${formatNumber(Math.round(value))}`;

/** `2024-06-01` 〜 `2026-11-01` の月初日を並べる。 */
function monthOptions(min: string | null | undefined, max: string | null | undefined): string[] {
  if (!min || !max) return [];
  const out: string[] = [];
  const [y0, m0] = min.split("-").map(Number);
  const [y1, m1] = max.split("-").map(Number);
  let y = y0, m = m0;
  // 取りこぼしを防ぐため上限は 10 年分で打ち切る
  for (let guard = 0; guard < 120 && (y < y1 || (y === y1 && m <= m1)); guard++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const monthText = (iso: string) => iso.slice(0, 7).replace("-", "/");

export default function LtvPage() {
  const queryClient = useQueryClient();

  const [monthFrom, setMonthFrom] = useState<string | undefined>(undefined);
  const [monthTo, setMonthTo] = useState<string | undefined>(undefined);
  const [splitBy, setSplitBy] = useState<GetLtvDataSplitBy>("none");
  const [optout, setOptout] = useState<OptoutFilter>("all");
  const [offers, setOffers] = useState<string[]>([]);
  const [firstProducts, setFirstProducts] = useState<string[]>([]);
  const [subsStatuses, setSubsStatuses] = useState<string[]>([]);
  const [adGroups, setAdGroups] = useState<string[]>([]);
  const [segmentMetric, setSegmentMetric] = useState<LtvMetricKey>("ltv180");

  const { data: filters, isLoading: filtersLoading, isError: filtersError } = useGetLtvFilters();

  /** 候補が空のとき、読み込み中・取得失敗・未取り込みを黙って同じ見た目にしない。 */
  const comboEmptyMessage = filtersLoading ? "読み込み中..."
    : filtersError ? "絞り込み候補を取得できませんでした"
    : (filters?.rowCount ?? 0) === 0 ? "まだ取り込まれていません（右上の「スプレッドシートから更新」）"
    : "候補がありません";

  const params = {
    monthFrom,
    monthTo,
    splitBy,
    optout,
    offers: offers.length ? offers.join("|") : undefined,
    firstProducts: firstProducts.length ? firstProducts.join("|") : undefined,
    subsStatuses: subsStatuses.length ? subsStatuses.join("|") : undefined,
    adGroups: adGroups.length ? adGroups.join("|") : undefined,
  };
  const { data, isLoading, isError } = useGetLtvData(params, {
    query: { queryKey: getGetLtvDataQueryKey(params) },
  });

  const syncMutation = useSyncLtv({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/ltv/data"] });
        queryClient.invalidateQueries({ queryKey: ["/api/ltv/filters"] });
      },
    },
  });

  const items: LtvMetrics[] = useMemo(() => data?.items ?? [], [data]);
  const segments = data?.segments ?? [];
  const isSplit = (data?.splitBy ?? "none") !== "none";
  const months = monthOptions(filters?.monthMin, filters?.monthMax);

  /** 月ごとに1点へ畳む。内訳ありなら系列ごとのキーを持たせる。 */
  const chartData = useMemo(() => {
    const byMonth = new Map<string, Record<string, string | number>>();
    for (const item of items) {
      const point = byMonth.get(item.label) ?? { label: item.label, count: 0 };
      if (isSplit) {
        point[`seg__${item.segment}`] = item[segmentMetric];
        point[`cnt__${item.segment}`] = item.count;
      } else {
        point.ltv95 = item.ltv95;
        point.ltv180 = item.ltv180;
        point.ltv365 = item.ltv365;
      }
      point.count = Number(point.count ?? 0) + item.count;
      byMonth.set(item.label, point);
    }
    return Array.from(byMonth.values()).sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [items, isSplit, segmentMetric]);

  const summary = data?.summary;
  const immatureFrom = data?.matured365Through;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="bg-white px-4 md:px-8 h-14 flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid #EBEBEB" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 md:hidden" />
          <div>
            <div className="hidden sm:block text-xs" style={{ color: "#9CA3AF" }}>定期購入 · 顧客価値</div>
            <div className="text-sm md:text-base font-bold leading-tight" style={{ color: "#1A1A1A" }}
              data-testid="heading-title">LTV分析</div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ border: "1px solid #EBEBEB", color: "#6B7280", background: "#FAFAFA" }}>
            <span style={{ color: "#9CA3AF", fontSize: 11 }} data-testid="text-last-sync">
              最終更新: {formatDate(data?.lastSyncedAt)}
            </span>
          </div>
          <button
            onClick={() => syncMutation.mutate(undefined)}
            disabled={syncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 whitespace-nowrap"
            style={{ background: YELLOW, color: "#fff", boxShadow: `0 1px 4px ${YELLOW}66` }}
            data-testid="button-sync">
            <RefreshCw size={12} className={syncMutation.isPending ? "animate-spin" : ""} />
            <span className="hidden sm:inline">スプレッドシートから更新</span>
            <span className="sm:hidden">更新</span>
          </button>
        </div>
      </div>

      <main className="flex-1 overflow-auto p-4 md:p-8" style={{ background: "#F8F8F8" }}>
        <div className="flex flex-col gap-4 md:gap-5">
          {/* ── Controls ── */}
          <div className="bg-white rounded-xl px-4 md:px-5 py-3 md:py-4 flex flex-wrap items-center gap-2 md:gap-3"
            style={{ border: "1px solid #EBEBEB" }} data-testid="ltv-controls">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              初回購入月
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                aria-label="初回購入月の開始" data-testid="select-month-from"
                value={monthFrom ?? ""} onChange={(e) => setMonthFrom(e.target.value || undefined)}>
                <option value="">最初から</option>
                {months.map((m) => <option key={m} value={m}>{monthText(m)}</option>)}
              </select>
              〜
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                aria-label="初回購入月の終了" data-testid="select-month-to"
                value={monthTo ?? ""} onChange={(e) => setMonthTo(e.target.value || undefined)}>
                <option value="">最後まで</option>
                {months.map((m) => <option key={m} value={m}>{monthText(m)}</option>)}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-500">
              内訳
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                aria-label="内訳の軸" data-testid="select-split"
                value={splitBy} onChange={(e) => setSplitBy(e.target.value as GetLtvDataSplitBy)}>
                {SPLIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <label className="flex items-center gap-2 text-xs text-gray-500">
              オプトアウト
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                aria-label="オプトアウトでの絞り込み" data-testid="select-optout"
                value={optout} onChange={(e) => setOptout(e.target.value as OptoutFilter)}>
                {OPTOUT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              オファー
              <div className="w-48"><MultiSelectCombobox options={filters?.offers ?? []} selected={offers} onChange={setOffers} emptyMessage={comboEmptyMessage} /></div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              初回商品
              <div className="w-48"><MultiSelectCombobox options={filters?.firstProducts ?? []} selected={firstProducts} onChange={setFirstProducts} emptyMessage={comboEmptyMessage} /></div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              サブスク状態
              <div className="w-40"><MultiSelectCombobox options={filters?.subsStatuses ?? []} selected={subsStatuses} onChange={setSubsStatuses} emptyMessage={comboEmptyMessage} /></div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              広告グループ
              <div className="w-40"><MultiSelectCombobox options={filters?.adGroups ?? []} selected={adGroups} onChange={setAdGroups} emptyMessage={comboEmptyMessage} /></div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div className="flex items-start gap-2 text-[11px] leading-5" style={{ color: "#9CA3AF" }}>
            <Info size={13} className="mt-0.5 shrink-0" />
            <div data-testid="ltv-notes">
              <span style={{ color: "#6B7280" }}>
                取り込み済み <strong>{formatNumber(data?.loadedRowCount)}</strong> 件
                {data?.monthMin && data?.monthMax && <>（初回購入月 {data.monthMin} 〜 {data.monthMax}）</>}
              </span>
              <br />
              LTVは売上ではなく<strong>利益</strong>の合計で、<strong>定期1件あたりの平均</strong>です（対象はFB広告経由・2024年6月以降の発送完了分）。
              {immatureFrom && <> <strong>{immatureFrom}</strong> より後に初回購入した月は、まだ365日経っていないぶんLTV365が小さく出ます。</>}
              {data?.optoutAvailable === false
                ? " オプトアウトのデータが取得できないため、内訳と絞り込みは無効です。"
                : <> オプトアウトのデータは<strong>{data?.optoutDataFrom?.replace(/-/g, "/") ?? "2025/12/31"}以降</strong>しかないため、それ以前に初回購入した定期は実際に解除していても「オプトアウトなし」に入ります。</>}
            </div>
          </div>

          {!isLoading && !isError && (data?.loadedRowCount ?? 0) === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center text-sm" style={{ border: "1px solid #EBEBEB", color: "#6B7280" }}
              data-testid="ltv-needs-sync">
              LTVデータがまだ取り込まれていません。<br />
              右上の「スプレッドシートから更新」を押してください（5万行超あるため数分かかります）。
            </div>
          ) : isError ? (
            <div className="bg-white rounded-xl p-10 text-center text-sm text-red-500" role="alert"
              style={{ border: "1px solid #EBEBEB" }}>
              LTVデータの取得に失敗しました。
            </div>
          ) : isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <>
              {/* ── KPI ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" data-testid="ltv-kpi-grid">
                <KpiCard label="定期件数" value={formatNumber(summary?.count)} sub="件"
                  sub2={`顧客 ${formatNumber(data?.customerCount)} 人`} accent testId="kpi-ltv-count" />
                <KpiCard label="平均LTV95" value={yen(summary?.ltv95)} testId="kpi-ltv95" />
                <KpiCard label="平均LTV180" value={yen(summary?.ltv180)} testId="kpi-ltv180" />
                <KpiCard label="平均LTV365" value={yen(summary?.ltv365)} testId="kpi-ltv365" />
              </div>

              {/* ── Chart ── */}
              <div className="bg-white rounded-xl p-4 md:p-6"
                style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                data-testid="card-ltv-chart">
                <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
                  <div>
                    <div className="text-sm font-bold" style={{ color: "#1A1A1A" }}>初回購入月別のLTV</div>
                    <div className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                      棒＝平均LTV（左軸） / 折れ線＝定期件数（右軸）
                    </div>
                  </div>
                  {isSplit && (
                    <label className="flex items-center gap-2 text-xs text-gray-500">
                      棒に出す指標
                      <select className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                        aria-label="棒グラフに出す指標" data-testid="select-segment-metric"
                        value={segmentMetric} onChange={(e) => setSegmentMetric(e.target.value as LtvMetricKey)}>
                        {LTV_METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                {chartData.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-sm" style={{ color: "#bbb" }}>
                    データがありません
                  </div>
                ) : (
                  <div style={{ height: 340 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                        <XAxis dataKey="label" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                          tickMargin={6} interval="preserveStartEnd" />
                        <YAxis yAxisId="left" stroke="#D1D5DB" fontSize={10} tickLine={false} axisLine={false}
                          width={56} tickFormatter={(v) => yen(v as number)} />
                        <YAxis yAxisId="right" orientation="right" stroke="#D1D5DB" fontSize={10}
                          tickLine={false} axisLine={false} width={52}
                          tickFormatter={(v) => formatNumber(v as number)} />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #EBEBEB" }}
                          formatter={(value: number, name: string) =>
                            [name === "件数" ? `${formatNumber(value)} 件` : yen(value), name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {isSplit
                          ? segments.map((segment, index) => (
                            <Bar key={segment} yAxisId="left" dataKey={`seg__${segment}`} name={segment}
                              fill={SEGMENT_COLORS[index % SEGMENT_COLORS.length]} maxBarSize={28} radius={[3, 3, 0, 0]} />
                          ))
                          : LTV_METRICS.map((metric) => (
                            <Bar key={metric.value} yAxisId="left" dataKey={metric.value} name={metric.label}
                              fill={metric.color} maxBarSize={22} radius={[3, 3, 0, 0]}>
                              <LabelList dataKey={metric.value} position="top" offset={6} fontSize={9}
                                fill={metric.color} formatter={(v: unknown) => typeof v === "number" ? yen(v) : ""} />
                            </Bar>
                          ))}
                        <Line yAxisId="right" type="monotone" dataKey="count" name="件数"
                          stroke={LTV_COLORS.count} strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* ── Table ── */}
              <div className="bg-white rounded-xl overflow-hidden"
                style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
                data-testid="card-ltv-table">
                <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between"
                  style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <span className="text-sm font-bold" style={{ color: "#1A1A1A" }}>初回購入月別</span>
                  <span className="text-xs" style={{ color: "#9CA3AF" }}>{items.length} 行</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                        <th scope="col" className="px-4 py-2.5 text-left font-medium whitespace-nowrap"
                          style={{ color: "#6B7280" }}>初回購入月</th>
                        {isSplit && (
                          <th scope="col" className="px-4 py-2.5 text-left font-medium whitespace-nowrap"
                            style={{ color: "#6B7280" }}>内訳</th>
                        )}
                        <th scope="col" className="px-4 py-2.5 text-right font-medium whitespace-nowrap"
                          style={{ color: "#6B7280" }}>件数</th>
                        {LTV_METRICS.map((metric) => (
                          <th key={metric.value} scope="col" className="px-4 py-2.5 text-right font-medium whitespace-nowrap"
                            style={{ color: "#6B7280" }}>{metric.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr><td colSpan={isSplit ? 6 : 5} className="px-4 py-8 text-center" style={{ color: "#bbb" }}>
                          データがありません
                        </td></tr>
                      ) : items.map((item, index) => (
                        <tr key={`${item.label}-${item.segment}`}
                          style={{ background: index % 2 === 0 ? "#fff" : "#FAFAFA", borderTop: "1px solid #F3F4F6" }}>
                          <td className="px-4 py-2 whitespace-nowrap" style={{ color: "#1A1A1A" }}>{item.label}</td>
                          {isSplit && (
                            <td className="px-4 py-2 break-all" style={{ color: "#374151" }}>{item.segment}</td>
                          )}
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(item.count)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{yen(item.ltv95)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{yen(item.ltv180)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{yen(item.ltv365)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function KpiCard({ label, value, sub, sub2, accent, testId }: {
  label: string; value: string; sub?: string; sub2?: string; accent?: boolean; testId?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 md:p-5" data-testid={testId}
      style={{ border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div className="text-xs font-medium" style={{ color: "#9CA3AF" }}>{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="text-xl md:text-2xl font-bold tabular-nums"
          style={{ color: accent ? YELLOW : "#1A1A1A" }}>{value}</span>
        {sub && <span className="text-xs" style={{ color: "#9CA3AF" }}>{sub}</span>}
      </div>
      {sub2 && <div className="mt-0.5 text-[11px]" style={{ color: "#9CA3AF" }}>{sub2}</div>}
    </div>
  );
}
