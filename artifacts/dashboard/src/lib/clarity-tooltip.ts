import { createElement } from "react";
import { formatNumber } from "./format.ts";

type TooltipRow = {
  name: string;
  value: number | null;
  color: string;
  payload?: Record<string, string | number | null>;
};

export function makeClarityTooltip(pageViews: Partial<Record<string, number>>) {
  return function ClarityTooltip({ active, payload, label }: {
    active?: boolean;
    payload?: TooltipRow[];
    label?: string;
  }) {
    if (!active || !payload?.length) return null;
    return createElement("div", {
      style: {
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 11,
        minWidth: 160,
      },
    }, [
      createElement("div", {
        key: "label",
        style: { fontWeight: 600, marginBottom: 6, color: "#374151" },
      }, `スクロール深度: ${label}`),
      ...payload.map((item) => {
        const rawVisitors = item.payload?.[`${item.name}Visitors`];
        const visitors = typeof rawVisitors === "number" ? rawVisitors : null;
        const pv = pageViews[item.name];
        const rate = typeof item.value === "number" && Number.isFinite(item.value)
          ? `${item.value.toFixed(1)}%`
          : "—";
        return createElement("div", { key: item.name, style: { marginBottom: 7 } }, [
          createElement("div", {
            key: "rate",
            style: { display: "flex", alignItems: "center", gap: 6 },
          }, [
            createElement("span", {
              key: "dot",
              style: {
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: item.color,
                flexShrink: 0,
              },
            }),
            createElement("span", { key: "name", style: { color: "#6B7280", flex: 1 } }, item.name),
            createElement("span", { key: "value", style: { color: "#374151", fontWeight: 600 } }, rate),
          ]),
          createElement("div", {
            key: "counts",
            style: { color: "#9CA3AF", marginLeft: 14 },
          }, `${label === "0%" ? "分子（0％起点はPV数）" : "訪問者数"}: ${visitors != null ? formatNumber(visitors) : "—"} / PV数: ${pv != null ? formatNumber(pv) : "—"}`),
        ]);
      }),
    ]);
  };
}
