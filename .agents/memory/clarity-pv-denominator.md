---
name: Clarity PV denominator completeness
description: How to handle missing page-view counts when aggregating scroll reach rates across dates.
---

## Rule
For a device's date-range scroll rate, use its aggregated PV total only when every matching export contributing visitor counts has a readable PV count. Otherwise omit that device's PV total and do not display its rate.

**Why:** Visitor counts may include all matching exports, so using only the readable portion of PVs would inflate the reach rate.

**How to apply:** Preserve denominator completeness when changing Clarity scroll aggregation or adding other visualizations based on the same exports.
