import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeClarityTooltip } from "./clarity-tooltip.ts";

test("renders the reach rate, visitor count, and PV count in the tooltip", () => {
  const Tooltip = makeClarityTooltip({ Desktop: 1200 });
  const markup = renderToStaticMarkup(createElement(Tooltip, {
    active: true,
    label: "50%",
    payload: [{
      name: "Desktop",
      value: 4.2,
      color: "#60A5FA",
      payload: { DesktopVisitors: 50 },
    }],
  }));

  assert.match(markup, /4\.2%/);
  assert.match(markup, /訪問者数: 50 \/ PV数: 1,200/);
});

test("renders the PV-based numerator on the 0% tooltip row", () => {
  const Tooltip = makeClarityTooltip({ Desktop: 1200 });
  const markup = renderToStaticMarkup(createElement(Tooltip, {
    active: true,
    label: "0%",
    payload: [{
      name: "Desktop",
      value: 100,
      color: "#60A5FA",
      payload: { DesktopVisitors: 1200 },
    }],
  }));

  assert.match(markup, /100\.0%/);
  assert.match(markup, /分子（0％起点はPV数）: 1,200 \/ PV数: 1,200/);
});
