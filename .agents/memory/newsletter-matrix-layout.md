---
name: Newsletter matrix layout
description: Period-axis requirement when switching matrix metrics between rows and columns.
---

Keep periods as columns in both matrix layouts. In metric-column mode, group the selected metric columns underneath each period; keep scenarios/templates as rows.

**Why:** The user clarified 「列表示にした時に期間は列を維持して。」 Moving periods into rows does not meet the intended layout.

**How to apply:** Change only the metric placement when switching layouts, including campaign comparisons.

Show spreadsheet segments per period using only rows matching the selected scenario, template and date range. Do not list a series-wide segment history under its name. Shared-template rows must keep each segment associated with its scenario.

**Why:** Actual spreadsheet data can change segment within one scenario over time, and templates can be shared across scenarios. The user rejected the combined list and chose 「期間ごとに表示」.

**How to apply:** Use the same filtered source rows and bucket boundaries for both numbers and segment annotations; retain the period-column layout and campaign boundary.
