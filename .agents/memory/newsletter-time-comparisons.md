---
name: Newsletter time-based comparisons
description: Calendar-bucket and campaign-boundary decisions for newsletter time-granularity views.
---

Use Monday–Sunday calendar weeks and calendar months across newsletter tabs. A date filter limits contributions to the selected dates, even if the displayed bucket starts before the filter.

**Why:** Spreadsheet week labels can be absent or ambiguous. Falling back to a month is not a weekly aggregate, and expanding a filter to a complete week changes the user's requested totals.

**How to apply:** Keep the same calendar definitions in tables, charts, matrix views, and comparisons; do not infer weekly groups from a spreadsheet's free-form labels.

For campaign before/after summaries, split contributions at the exact campaign date. A week or month containing that date is a mixed period, not entirely “before” or “after.”

**Why:** Increasing display granularity must not move deliveries across the campaign boundary or double-count its start date.

**How to apply:** Preserve exact-date KPI splits independently of display buckets, disclose mixed buckets, and include the campaign start date only in the after period.
