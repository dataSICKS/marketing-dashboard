---
name: Clarity PV denominator completeness
description: How to handle missing page-view counts when aggregating scroll reach rates across dates.
---

## Rule
For a device's date-range scroll rate, use its aggregated PV total only when every matching export contributing visitor counts has a readable PV count. Otherwise omit that device's PV total and do not display its rate. If retrieving any requested date fails, fail the range request rather than return a partial aggregate.

**Why:** Visitor counts may include all matching exports, so using only the readable portion of PVs would inflate the reach rate. A failed date can hide exports entirely, making a partial aggregate look complete.

**How to apply:** Preserve denominator completeness when changing Clarity scroll aggregation or adding other visualizations based on the same exports; treat incomplete storage reads as errors, not empty dates.

## Absent device versus missing PV
Distinguish a device with no matching exports from one whose matching exports lack readable PV counts. For an otherwise nonempty dataset, the former has zero contribution to the exported-data total; the latter has an unknown denominator and must still block a combined rate.

**Why:** Mobile-only exports can display valid rates in split view but disappear in total overlay when an absent Desktop export is mistaken for missing Desktop PV. Using zero for a genuinely absent export must never become a fallback for unreadable PV or failed storage reads.

**How to apply:** Establish absence from successfully enumerated exports across the full requested range, not from null chart points, which can also represent zero visitors.

## Display-mode consistency
The Clarity 「合計」 tab means display both Desktop and Mobile device series, not merge their denominators into a single rate. Switching between split and overlay views must preserve each segment/device's rate, visitor count, and PV denominator. An unknown Mobile PV must not hide a valid Desktop line for the same segment.

**Why:** The user supplied split/overlay screenshots showing a visible original Desktop curve disappearing in overlay. The earlier fix tested a mobile-only export but did not cover the actual missing-Mobile-PV condition; combining devices also changed the test pattern's curve.

**How to apply:** Use the same device-level rates in both display modes, distinguish segment and device in overlay legends/tooltips, and verify the actual interactive mode switch rather than claiming visual success from a different API fixture.
