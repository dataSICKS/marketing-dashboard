---
name: LTV selection menus
description: Why LTV uses app-rendered single-select menus instead of native dropdowns.
---

Prefer non-modal app-rendered menus for LTV single-select controls. Do not dismiss solely because the embedded window blurs or resizes.

**Why:** The user reported immediate dismissal with native controls and later could not use the replacement table dropdown. The first app-rendered replacement also closed on window blur or resize. A non-modal menu was verified inside an iframe to stay open through those events and successfully switch product and opt-out blocks. This reproduces a dismissal mechanism, not the user's exact browser conditions.

**How to apply:** Keep LTV single-select menus consistent when adding filters. Preserve deliberate selection, outside-click and Escape dismissal. Do not assume native or modal controls fail everywhere, or change unrelated pages without evidence.

Keep the LTV95/180/365 horizon choice visible and usable without requiring a breakdown first. Prefer directly clickable buttons for this short option list.

**Why:** After the metric menu was moved beside the breakdown control but still hidden without a breakdown, the user reported they could not select an LTV metric. Metric selection should not require discovering that prerequisite.

**How to apply:** Apply the selected metric to both overall and segmented charts. Preserve the option to show all three metrics in the overall chart.
