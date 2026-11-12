import { useState } from "react";
import type { LtvProductRatios as ProductRatios, LtvProductRatioMonth } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";
import LtvSelect from "@/components/LtvSelect";
import LtvProductRatioMonths from "@/components/LtvProductRatioMonths";
import LtvProductRatioChart from "@/components/LtvProductRatioChart";

interface Props {
  data: ProductRatios | undefined;
  periodLabel: string;
  months: LtvProductRatioMonth[] | undefined;
}

export default function LtvProductRatios({ data, periodLabel, months }: Props) {
  const [mode, setMode] = useState("initial");
  const [isMonthly, setIsMonthly] = useState(true);
  const [breakdown, setBreakdown] = useState("product");
  const isToothpaste = breakdown === "toothpaste";
  const isBrushCount = breakdown === "brushCount";
  const isAll = mode === "all";
  const items = (isBrushCount
    ? (isAll ? data?.brushCountAll : data?.brushCountInitial)
    : isToothpaste
    ? (isAll ? data?.toothpasteAll : data?.toothpasteInitial)
    : (isAll ? data?.all : data?.initial)) ?? [];
  const total = isAll ? data?.totalPurchaseCount : data?.subscriptionCount;
  const itemKey = isBrushCount ? (isAll ? "brushCountAll" : "brushCountInitial")
    : isToothpaste ? (isAll ? "toothpasteAll" : "toothpasteInitial") : (isAll ? "all" : "initial");
  const rowLabel = isBrushCount ? "大人・こどもの本数構成" : isToothpaste ? "歯磨き剤の有無" : "商品";

  return (
    <Tabs value={mode} onValueChange={setMode}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
      data-testid="card-product-ratios">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 md:px-6">
        <h2 className="text-sm font-bold text-gray-900">商品購入比率</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="商品購入比率の集計表示" className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {[{ monthly: true, label: "月別推移" }, { monthly: false, label: "期間合算" }].map((view) => (
              <button key={view.label} type="button" aria-pressed={isMonthly === view.monthly}
                onClick={() => setIsMonthly(view.monthly)}
                data-testid={view.monthly ? "button-product-ratios-monthly" : "button-product-ratios-total"}
                className={`rounded-md px-3 py-1 text-xs ${isMonthly === view.monthly ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`}>
                {view.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            内訳
            <LtvSelect label="商品購入比率の内訳" testId="select-product-ratio-breakdown"
              value={breakdown} onValueChange={setBreakdown}
              options={[{ value: "product", label: "商品名別" }, { value: "toothpaste", label: "歯磨き剤の有無" },
                { value: "brushCount", label: "大人・こどもの本数別" }]} />
          </div>
        <TabsList aria-label="商品購入比率の対象">
          <TabsTrigger value="initial" className="text-xs" data-testid="tab-products-initial">初回のみ</TabsTrigger>
          <TabsTrigger value="all" className="text-xs" data-testid="tab-products-all">初回〜4回目</TabsTrigger>
        </TabsList>
        </div>
      </div>
      <TabsContent value={mode} className="mt-0">
        <div className="space-y-1 px-4 py-3 text-xs leading-5 text-gray-500 md:px-6">
          <p>対象の初回購入月：{periodLabel}（上部の絞り込み条件を適用）</p>
          {isMonthly && (
            <p className="font-medium text-gray-700">
              横軸は初回購入月です。各月のセルは件数と、その月の{isAll ? "初回〜4回目の購入記録合計" : "定期購入件数"}を分母にした構成比です。表は横にスクロールできます。
              {isAll && "2〜4回目も、その定期の初回購入月にまとめます（各回の購入日別ではありません）。直近の初回購入月では後続回に未到達の定期が多く、構成比に影響する場合があります。"}
            </p>
          )}
          {data && (
            <p data-testid="product-ratio-denominator">
              {isAll ? "初回〜4回目の購入記録 合計" : "対象の定期購入"}
              <strong className="mx-1 text-gray-800">{formatNumber(total)}</strong>
              {isMonthly ? "件（期間全体の件数。構成比は各月で計算）" : "件を分母にした構成比"}
            </p>
          )}
          <p>
            {isAll
              ? "同じ定期で同じ商品を複数回購入した場合も、購入回ごとに1件として集計します。2〜4回目の空欄は未記録のため除外しています。5回目以降は対象外です。"
              : "定期購入1件につき初回商品を1件として集計します。初回の商品名が空欄のものは「未設定」に含めています。"}
          </p>
          <p>{isBrushCount
            ? "歯磨き剤の有無をまたいで、大人・こどもの本数構成が同じ購入を合算します。例：大人2本と大人2本＋歯磨き剤は「大人2本」。大人1本＋大人2本は「大人3本」。"
            : isToothpaste
            ? "各購入回の商品名から「歯磨き剤あり／なし／不明」にまとめます。セット商品も歯磨き剤を含めば「あり」です。未設定などは「不明」とし、「なし」には含めません。"
            : "元データの商品ラベル単位です。先頭・末尾などの空のカンマ要素は除いて合算します。セット商品は分割せず、商品数量・売上金額・ユニーク顧客数の比率ではありません。"}</p>
          {isBrushCount && (
            <p>本数構成ごとの購入件数・構成比です（歯ブラシ総本数の比率ではありません）。スパイラル等を大人・こどもの本数には加算しません。本数不明は別区分です。</p>
          )}
          {isAll && !isMonthly && (
            <p>各購入回の％はその回の記録件数を分母にします。右端の構成比は初回〜4回目の合計が分母です。2〜4回目の空欄は購入記録に数えません。</p>
          )}
          {!!data?.missingFirstProductCount && (
            <p className="text-amber-700">初回商品名が未設定：{formatNumber(data.missingFirstProductCount)}件（集計に含む）</p>
          )}
        </div>
        <LtvProductRatioChart months={months} data={data} itemKey={itemKey} isAll={isAll} isMonthly={isMonthly} />
        {isMonthly ? (
          <LtvProductRatioMonths months={months} itemKey={itemKey} isAll={isAll} rowLabel={rowLabel} />
        ) : !data ? (
          <p className="px-4 py-8 text-center text-xs text-red-500" role="alert">商品購入比率のデータを取得できませんでした。</p>
        ) : !items.length ? (
          <p className="px-4 py-8 text-center text-xs text-gray-400">指定条件に該当する購入記録がありません。</p>
        ) : (
          <div className="max-h-[420px] overflow-auto border-t border-gray-100">
            <table className="w-full border-collapse text-xs" aria-label={isBrushCount ? "大人・こどもの本数構成別の購入比率" : isToothpaste ? "購入回別の歯磨き剤有無の構成比" : isAll ? "初回から4回目の商品購入構成比" : "初回商品の購入構成比"}>
              <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
                <tr>
                  <th scope="col" className="min-w-[180px] px-4 py-3 text-left font-medium md:px-6">{isBrushCount ? "大人・こどもの本数構成" : isToothpaste ? "歯磨き剤の有無" : "商品"}</th>
                  {isAll && ["初回", "2回目", "3回目", "4回目"].map((label, index) => (
                    <th key={label} scope="col" className="whitespace-nowrap px-3 py-3 text-right font-medium">
                      {label}<span className="mt-1 block text-[10px] font-normal">計 {formatNumber(data.stageCounts[index])}件</span>
                    </th>
                  ))}
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-medium">{isAll ? "合計件数" : "件数"}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-medium md:px-6">構成比</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.product} className="border-t border-gray-100 odd:bg-white even:bg-gray-50" data-testid="product-ratio-row">
                    <th scope="row" className="max-w-[400px] break-words px-4 py-2.5 text-left font-normal text-gray-900 md:px-6">{item.product}</th>
                    {isAll && item.stageCounts.map((count, index) => (
                      <td key={index} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-600">
                        {formatNumber(count)}
                        <span className="mt-1 block text-[10px] text-amber-700">
                          {data.stageCounts[index] > 0 ? `${(count / data.stageCounts[index] * 100).toFixed(1)}%` : "—"}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(item.count)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-700 md:px-6">{(item.ratio * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-amber-50 font-semibold">
                <tr>
                  <th scope="row" className="px-4 py-3 text-left md:px-6">合計</th>
                  {isAll && data.stageCounts.map((count, index) => (
                    <td key={index} className="px-3 py-3 text-right tabular-nums">
                      {formatNumber(count)}
                      <span className="mt-1 block text-[10px] text-amber-700">{count > 0 ? "100.0%" : "—"}</span>
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(total)}</td>
                  <td className="px-4 py-3 text-right tabular-nums md:px-6">100.0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
