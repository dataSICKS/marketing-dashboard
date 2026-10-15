---
name: Newsletter time-based comparisons
description: Calendar-bucket and campaign-boundary decisions for newsletter time-granularity views.
---

In ordinary newsletter views, use Monday–Sunday calendar weeks and calendar months. In 「施策タイミング」, use the selected campaign's start date as the boundary instead. A date filter limits contributions to the selected dates, even if the displayed bucket starts before the filter.

**Why:** Spreadsheet week labels can be absent or ambiguous. Falling back to a month is not a weekly aggregate, and expanding a filter to a complete week changes the user's requested totals.

**How to apply:** Keep definitions consistent between tables, charts, and matrix views; do not infer weekly groups from spreadsheet free-form labels or apply calendar-week boundaries to campaign mode.

Campaign-mode weeks are consecutive seven-day blocks anchored on the campaign date. The user's example: October 7 means September 30–October 6 before and October 7–13 after. Campaign-mode months use the same anniversary day, clamped at month-end without drifting the following month.

**Why:** The user explicitly requested 「その日を基準に週別なら7日間をまとめてみたい」 rather than calendar weeks crossing a campaign boundary.

**How to apply:** Anchor both before and after to the same start date. Include the campaign date only in the after period; preserve exact-date KPI splits. Ordinary views retain calendar aggregation.
