import { useMemo, useState } from "react";
import "./_group.css";
import LatestTable from "./LatestTable";
import { metrics, periods, sampleSeries } from "./sample-data";

export default function LatestPreview() {
  const [scenarioFilter, setScenarioFilter] = useState("all");
  const [segmentSearch, setSegmentSearch] = useState("");

  const visibleSeries = useMemo(() => {
    const search = segmentSearch.trim().toLocaleLowerCase("ja-JP");
    return sampleSeries.filter((entry) => {
      const matchesScenario = scenarioFilter === "all" || entry.key === scenarioFilter;
      const matchesSegment =
        !search ||
        entry.segments.some((segment) => segment.toLocaleLowerCase("ja-JP").includes(search));
      return matchesScenario && matchesSegment;
    });
  }, [scenarioFilter, segmentSearch]);

  return (
    <main className="matrix-segment-preview min-h-[100dvh] bg-[#f5f5f4] px-4 py-6 text-gray-800 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-1 text-xs text-gray-400">マーケティングダッシュボード&nbsp; / &nbsp;メール</div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-800">
              メルマガ分析 <span className="mx-1 text-gray-300">/</span> マトリクス
            </h1>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-sm">
            <button
              type="button"
              aria-current="page"
              data-testid="tab-matrix"
              className="rounded-md bg-amber-300 px-3 py-1.5 font-medium text-gray-800"
            >
              マトリクス
            </button>
            <span className="px-3 py-1.5 text-gray-400">グラフ</span>
          </div>
        </div>

        <section aria-label="表示条件" className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[205px]">
                <label className="mb-1.5 block text-[11px] font-medium text-gray-500" htmlFor="period-range">
                  集計期間
                </label>
                <div
                  id="period-range"
                  data-testid="text-period-range"
                  className="flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-xs text-gray-700"
                >
                  {periods[0]} <span className="mx-2 text-gray-300">—</span> {periods[periods.length - 1]}
                </div>
              </div>
              <div className="min-w-[240px]">
                <label className="mb-1.5 block text-[11px] font-medium text-gray-500" htmlFor="scenario-filter">
                  シナリオ
                </label>
                <select
                  id="scenario-filter"
                  data-testid="select-scenario-filter"
                  value={scenarioFilter}
                  onChange={(event) => setScenarioFilter(event.target.value)}
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none focus:border-amber-400"
                >
                  <option value="all">すべてのシナリオ</option>
                  {sampleSeries.map((entry) => (
                    <option key={entry.key} value={entry.key}>{entry.key}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[210px]">
                <label className="mb-1.5 block text-[11px] font-medium text-gray-500" htmlFor="segment-search">
                  セグメント検索
                </label>
                <input
                  id="segment-search"
                  data-testid="input-segment-search"
                  type="search"
                  value={segmentSearch}
                  onChange={(event) => setSegmentSearch(event.target.value)}
                  placeholder="セグメント名"
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none placeholder:text-gray-300 focus:border-amber-400"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 self-start text-[11px] text-gray-400 md:self-end md:pb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              最新セグメントを表示
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">シナリオ別実績</h2>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">
                最新セグメントは、現在選択中の条件に基づく最新の抽出結果です。期間ごとの履歴ではありません。
              </p>
            </div>
            <span data-testid="text-visible-count" className="shrink-0 text-[11px] text-gray-400">
              {visibleSeries.length} 件
            </span>
          </div>
          <div className="overflow-x-auto">
            <LatestTable series={visibleSeries} periods={periods} metrics={metrics} />
          </div>
          <div className="border-t border-gray-100 px-5 py-2.5 text-right text-[10px] text-gray-400">
            デザイン確認用・数値は表示例
          </div>
        </section>
      </div>
    </main>
  );
}
