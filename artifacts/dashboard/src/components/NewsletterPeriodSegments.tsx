import type { MatrixResponse } from "@workspace/api-client-react";

type Series = MatrixResponse["series"][number];

export default function NewsletterPeriodSegments({ series, period }: { series: Series; period: string }) {
  const entries = series.periodSegments?.[period] ?? [];
  if (entries.length === 0) return <span className="text-gray-300">—</span>;
  return (
    <div className="space-y-1 text-[10px] font-normal text-gray-500 text-left min-w-[140px] max-w-[260px] break-words">
      {entries.map((entry) => (
        <div key={JSON.stringify([entry.scenarioName, entry.segment])}>
          {series.type === "template" && <div className="font-medium text-gray-600">{entry.scenarioName}</div>}
          <div>{entry.segment || "未設定"}</div>
        </div>
      ))}
    </div>
  );
}

export function NewsletterSegmentRow({ series, periods, background, splitPeriod }: {
  series: Series; periods: string[]; background: string; splitPeriod?: string;
}) {
  return (
    <tr style={{ background }} className="border-t border-gray-100">
      <th scope="row" className="sticky left-[220px] z-[2] px-3 py-2 text-left text-[10px] font-normal text-gray-500"
        style={{ background }}>セグメント</th>
      {periods.map((period) => (
        <td key={period} className="px-3 py-2 align-top"
          style={{ borderLeft: splitPeriod === period ? "2px solid #CBD5E1" : undefined }}>
          <NewsletterPeriodSegments series={series} period={period} />
        </td>
      ))}
    </tr>
  );
}
