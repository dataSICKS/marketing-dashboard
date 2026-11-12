import { useState } from "react";
import type { LtvProductRatios as ProductRatios } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";

interface Props {
  data: ProductRatios | undefined;
  periodLabel: string;
}

export default function LtvProductRatios({ data, periodLabel }: Props) {
  const [mode, setMode] = useState("initial");
  const isAll = mode === "all";
  const items = (isAll ? data?.all : data?.initial) ?? [];
  const total = isAll ? data?.totalPurchaseCount : data?.subscriptionCount;

  return (
    <Tabs value={mode} onValueChange={setMode}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white"
      data-testid="card-product-ratios">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 md:px-6">
        <h2 className="text-sm font-bold text-gray-900">商品購入比率</h2>
        <TabsList aria-label="商品購入比率の対象">
          <TabsTrigger value="initial" className="text-xs" data-testid="tab-products-initial">初回のみ</TabsTrigger>
          <TabsTrigger value="all" className="text-xs" data-testid="tab-products-all">初回〜4回目</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={mode} className="mt-0">
        <div className="space-y-1 px-4 py-3 text-xs leading-5 text-gray-500 md:px-6">
          <p>対象の初回購入月：{periodLabel}（上部の絞り込み条件を適用）</p>
          {data && (
            <p data-testid="product-ratio-denominator">
              {isAll ? "初回〜4回目の購入記録 合計" : "対象の定期購入"}
              <strong className="mx-1 text-gray-800">{formatNumber(total)}</strong>件を分母にした構成比
            </p>
          )}
          <p>
            {isAll
              ? "同じ定期で同じ商品を複数回購入した場合も、購入回ごとに1件として集計します。2〜4回目の空欄は未記録のため除外しています。5回目以降は対象外です。"
              : "定期購入1件につき初回商品を1件として集計します。初回の商品名が空欄のものは「未設定」に含めています。"}
          </p>
          <p>元データの商品ラベル単位です。セット商品は分割せず、商品数量・売上金額・ユニーク顧客数の比率ではありません。</p>
          {!!data?.missingFirstProductCount && (
            <p className="text-amber-700">初回商品名が未設定：{formatNumber(data.missingFirstProductCount)}件（集計に含む）</p>
          )}
        </div>
        {!data ? (
          <p className="px-4 py-8 text-center text-xs text-red-500" role="alert">商品購入比率のデータを取得できませんでした。</p>
        ) : !items.length ? (
          <p className="px-4 py-8 text-center text-xs text-gray-400">指定条件に該当する購入記録がありません。</p>
        ) : (
          <div className="max-h-[420px] overflow-auto border-t border-gray-100">
            <table className="w-full border-collapse text-xs" aria-label={isAll ? "初回から4回目の商品購入構成比" : "初回商品の購入構成比"}>
              <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500">
                <tr>
                  <th scope="col" className="min-w-[180px] px-4 py-3 text-left font-medium md:px-6">商品</th>
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
                      <td key={index} className="px-3 py-2.5 text-right tabular-nums text-gray-600">{formatNumber(count)}</td>
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
                    <td key={index} className="px-3 py-3 text-right tabular-nums">{formatNumber(count)}</td>
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
