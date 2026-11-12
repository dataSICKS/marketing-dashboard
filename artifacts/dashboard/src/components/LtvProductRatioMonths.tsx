import type { LtvProductRatioMonth, LtvProductRatios } from "@workspace/api-client-react";
import { formatNumber } from "@/lib/format";

export type ProductRatioItemsKey = keyof Pick<LtvProductRatios,
  "initial" | "all" | "toothpasteInitial" | "toothpasteAll" | "brushCountInitial" | "brushCountAll">;

export default function LtvProductRatioMonths({ months, itemKey, isAll, rowLabel }: {
  months: LtvProductRatioMonth[] | undefined;
  itemKey: ProductRatioItemsKey;
  isAll: boolean;
  rowLabel: string;
}) {
  if (!months) {
    return <p className="p-6 text-xs text-red-500" role="alert">月別の商品購入比率を取得できませんでした。</p>;
  }
  if (!months.length) {
    return <p className="p-6 text-center text-xs text-gray-400">指定条件に該当する購入記録がありません。</p>;
  }
  const columns = months.map(({ month, productRatios }) => ({
    month,
    total: isAll ? productRatios.totalPurchaseCount : productRatios.subscriptionCount,
    items: new Map(productRatios[itemKey].map((item) => [item.product, item])),
  }));
  const totals = new Map<string, number>();
  for (const column of columns) {
    for (const item of column.items.values()) totals.set(item.product, (totals.get(item.product) ?? 0) + item.count);
  }
  const products = [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)! || a.localeCompare(b, "ja"));

  return (
    <div className="max-h-[480px] overflow-auto border-t border-gray-100"
      role="region" aria-label="商品購入比率の月別推移（横スクロール可能）" tabIndex={0}
      data-testid="product-ratio-months">
      <table className="w-full border-separate border-spacing-0 text-xs" aria-label="初回購入月別の商品購入比率">
        <thead className="sticky top-0 z-20 bg-gray-50 text-gray-500">
          <tr>
            <th scope="col" className="sticky left-0 z-30 min-w-[220px] border-b border-gray-100 bg-gray-50 px-4 py-3 text-left font-medium">
              {rowLabel}<span className="mt-1 block text-[10px] font-normal">横軸：初回購入月</span>
            </th>
            {columns.map((column) => (
              <th key={column.month} scope="col" className="min-w-[108px] whitespace-nowrap border-b border-gray-100 px-4 py-3 text-right font-medium">
                {column.month}<span className="mt-1 block text-[10px] font-normal">計 {formatNumber(column.total)}件</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((product, index) => (
            <tr key={product} className={index % 2 ? "bg-gray-50" : "bg-white"} data-testid="product-ratio-month-row">
              <th scope="row" className={`sticky left-0 z-10 max-w-[300px] break-words border-b border-gray-100 px-4 py-3 text-left font-normal text-gray-900 ${index % 2 ? "bg-gray-50" : "bg-white"}`}>
                {product}
              </th>
              {columns.map((column) => {
                const count = column.items.get(product)?.count ?? 0;
                return (
                  <td key={column.month} className="whitespace-nowrap border-b border-gray-100 px-4 py-3 text-right tabular-nums text-gray-600">
                    {formatNumber(count)}件
                    <span className="mt-1 block font-semibold text-amber-700">
                      {column.total > 0 ? `${(count / column.total * 100).toFixed(1)}%` : "—"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-amber-50 font-semibold">
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-amber-50 px-4 py-3 text-left">合計</th>
            {columns.map((column) => (
              <td key={column.month} className="px-4 py-3 text-right tabular-nums">
                {formatNumber(column.total)}件
                <span className="mt-1 block text-amber-700">{column.total > 0 ? "100.0%" : "—"}</span>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
