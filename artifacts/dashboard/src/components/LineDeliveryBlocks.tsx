import type { LineDeliveriesResponse, LineDeliverySplit } from "@workspace/api-client-react";
import { AlertTriangle, Info } from "lucide-react";
import { formatNumber } from "@/lib/format";

const CARD = { border: "1px solid #EBEBEB", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" };

const share = (value: number, total: number) => (total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "—");

function SplitTable({ title, items, total, testId }: {
  title: string; items: LineDeliverySplit[]; total: number; testId: string;
}) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <h3 className="text-xs font-bold text-gray-700">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1.5 text-xs text-gray-400">CVがありません。</p>
      ) : (
        <table className="mt-1.5 w-full text-xs">
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="border-t border-gray-100">
                <td className="py-1.5 pr-2 break-words">{item.label || "（未設定）"}</td>
                <td className="py-1.5 text-right tabular-nums">{formatNumber(item.cv)}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-gray-400">{share(item.cv, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function LineDeliveryBlocks({ data }: { data: LineDeliveriesResponse }) {
  const unmatchedCv = data.totalCv - data.matchedCv;
  return (
    <>
      {unmatchedCv > 0 && (
        <div role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900"
          style={{ border: "1px solid #FDE68A" }} data-testid="alert-line-unmatched">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <strong>パラメURLの一覧に無い識別子でCVが {formatNumber(unmatchedCv)} 件立っています。</strong>
              その分は下の配信別の表に含まれません（合計 {formatNumber(data.totalCv)} 件のうち
              {formatNumber(data.matchedCv)} 件が紐づけ済み）。URLを発行したあと一覧への登録が漏れている可能性があります。
              <ul className="mt-1.5 space-y-0.5">
                {data.unmatched.slice(0, 8).map((item) => (
                  <li key={item.identifier} className="tabular-nums break-all">
                    CV {formatNumber(item.cv)} 件 — <span className="font-mono">{item.identifier}</span>
                  </li>
                ))}
              </ul>
              {data.unmatched.length > 8 && (
                <div className="mt-1 text-[11px]">ほか {formatNumber(data.unmatched.length - 8)} 件</div>
              )}
            </div>
          </div>
        </div>
      )}

      <section className="bg-white rounded-xl p-4 md:p-6 min-w-0" style={CARD} data-testid="card-line-deliveries">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-gray-900">配信（メッセージパック）別のCV</h2>
          <span className="text-xs text-gray-400">
            紐づけ済み {formatNumber(data.matchedCv)} 件 ／ 識別子 {formatNumber(data.identifierCount)} 本
          </span>
        </div>
        <p className="mt-0.5 text-xs leading-5 text-gray-400">
          パラメURLの識別子からメッセージパックに寄せたCVです。<strong>開封率・CTR・配信別のCVRは出せません</strong>
          （Liny側のメッセージ単位の数字と、識別子ごとのLPアクセスがデータに無いため）。
        </p>
        {data.items.length === 0 ? (
          <p className="mt-6 text-center text-sm text-gray-400">この期間に紐づいたCVがありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs" data-testid="table-line-deliveries">
              <thead className="bg-gray-50 text-gray-500">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">通目</th>
                  <th className="px-3 py-2 font-medium">メッセージパック</th>
                  <th className="px-3 py-2 font-medium">経路</th>
                  <th className="px-3 py-2 font-medium">クーポン</th>
                  <th className="px-3 py-2 font-medium text-right">CV</th>
                  <th className="px-3 py-2 font-medium text-right">構成比</th>
                  <th className="px-3 py-2 font-medium text-right">枝</th>
                  <th className="px-3 py-2 font-medium">CVが出た期間</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={`${item.route}|${item.messagePack}`} className="border-t border-gray-100">
                    <td className="px-3 py-2 tabular-nums">{item.stepNumber === null ? "—" : `${item.stepNumber}通目`}</td>
                    <td className="px-3 py-2 break-words">{item.messagePack || "（名称なし）"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.route || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {item.hasCoupon === null ? <span className="text-gray-400">不明</span> : item.hasCoupon ? "あり" : "無"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatNumber(item.cv)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{share(item.cv, data.matchedCv)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{formatNumber(item.variants)}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap text-gray-400">
                      {item.firstCvDate && item.lastCvDate
                        ? `${item.firstCvDate.replaceAll("-", "/")} 〜 ${item.lastCvDate.replaceAll("-", "/")}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] leading-5 text-gray-400">
          「枝」は、そのパックのうち実際にCVが立った識別子（セグメントの枝）の数です。
          CVの多い順。通目はメッセージパック名の丸数字から拾っているものがあります。
        </p>
      </section>

      <section className="bg-white rounded-xl p-4 md:p-6 min-w-0" style={CARD} data-testid="card-line-segments">
        <h2 className="text-sm font-bold text-gray-900">セグメント・経路ごとのCV内訳</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          分母はそれぞれの合計ではなく紐づけ済みCV {formatNumber(data.matchedCv)} 件です。構成比なので、効率（率）ではありません。
        </p>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <SplitTable title="サブスク経験" items={data.bySubscription} total={data.matchedCv} testId="split-subscription" />
          <SplitTable title="子ども有無" items={data.byChild} total={data.matchedCv} testId="split-child" />
          <SplitTable title="流入経路" items={data.byRoute} total={data.matchedCv} testId="split-route" />
        </div>
      </section>

      <section className="bg-white rounded-xl p-4 md:p-5" style={CARD} data-testid="card-line-delivery-notes">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <Info size={14} className="text-gray-400" />配信別の読み方
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-gray-500">
          {data.notes.map((note, index) => <li key={index} className="break-words">{note}</li>)}
        </ul>
        <p className="mt-2 text-[11px] text-gray-400">
          CVの対象期間: {data.dateMin ? data.dateMin.replaceAll("-", "/") : "—"} 〜 {data.dateMax ? data.dateMax.replaceAll("-", "/") : "—"}
        </p>
      </section>
    </>
  );
}
