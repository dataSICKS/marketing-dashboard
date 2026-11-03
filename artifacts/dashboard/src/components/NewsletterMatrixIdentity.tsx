import type { MatrixResponse } from "@workspace/api-client-react";
import NewsletterRowSegment from "@/components/NewsletterRowSegment";
import { matrixDimensionColumns, type MatrixDimension } from "@/lib/newsletter-matrix";

interface Props {
  dimensions: MatrixDimension[];
  series?: MatrixResponse["series"][number];
  rowSpan?: number;
  background: string;
  blank?: boolean;
}

/** Both metric layouts use the same selected columns and sticky offsets. */
export default function NewsletterMatrixIdentity({ dimensions, series, rowSpan, background, blank }: Props) {
  const columns = matrixDimensionColumns(dimensions);
  return columns.map((column, index) => {
    const header = !series;
    const Cell = header || index === 0 ? "th" : "td";
    const value = column.key === "total" ? "合計"
      : series?.dimensionValues?.[column.key] ?? (column.key === "subject" ? series?.subject : undefined);
    const showSegment = series && (column.key === "scenario" || column.key === "template")
      && (column.key === "scenario" || !dimensions.includes("scenario"));
    return (
      <Cell key={column.key} scope={header ? "col" : index === 0 ? "row" : undefined}
        rowSpan={rowSpan}
        className={`sticky px-4 py-3 text-left align-middle text-xs leading-5 ${index > 0 ? "border-l border-gray-200" : ""} ${header ? "font-medium text-gray-500" : "font-normal text-gray-800 break-all"}`}
        style={{ left: column.left, width: column.width, minWidth: column.width, maxWidth: column.width, background, zIndex: header ? 3 : 2 }}>
        {blank ? null : header ? column.label : value ?? (column.key === "subject" ? "（件名未取得）" : "未設定")}
        {!blank && showSegment && <NewsletterRowSegment series={series} />}
      </Cell>
    );
  });
}
