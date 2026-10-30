import type { MatrixResponse } from "@workspace/api-client-react";

export default function NewsletterRowSegment({ series }: { series: MatrixResponse["series"][number] }) {
  return (
    <div className="mt-0.5 flex items-baseline gap-1.5 text-[10px] font-normal leading-4">
      <span className="shrink-0 text-gray-400">セグメント</span>
      <span className="break-words text-gray-600">
        {series.latestSegment ? series.latestSegment.segment || "未設定" : "—"}
      </span>
    </div>
  );
}
