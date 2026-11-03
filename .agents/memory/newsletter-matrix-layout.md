---
name: Newsletter matrix layout
description: Period-axis requirement when switching matrix metrics between rows and columns.
---

Keep periods as columns in both matrix layouts. In metric-column mode, group the selected metric columns underneath each period; keep scenarios/templates as rows.

**Why:** The user clarified 「列表示にした時に期間は列を維持して。」 Moving periods into rows does not meet the intended layout.

**How to apply:** Change only the metric placement when switching layouts, including campaign comparisons.

Show only the latest spreadsheet segment within the selected conditions directly below the scenario name inside its row-name cell. Do not show a combined history or period-by-period segment rows.

**Why:** After seeing the period-specific presentation, the user rejected it and clarified 「最新値だけを行内のシナリオの名前の下に入れてほしい」. A design preview was requested before changing the app.

**How to apply:** Resolve the latest value from matching source rows by delivery date, not an alphabetically sorted list; retain period columns and do not change the underlying numerical aggregates.

Use the visible label 「セグメント」, not 「最新セグメント」.

**Why:** The user approved the name-with-secondary-segment mockup and explicitly requested this label.

**How to apply:** Preserve the approved placement in both matrix layouts without introducing period-specific segment rows.

Allow independent selection of シナリオ・件名・テンプレ as matrix grouping dimensions. Removing an item must regroup and recompute the matching delivery records, not merely hide a column.

**Why:** The user requested selectable table items and explicitly chose 「選んだ項目で集計し直す」 over column visibility only.

**How to apply:** Keep periods as columns, preserve selected source filters, recompute rates from summed counts, avoid counting a delivery twice, and save/restore the selected dimensions with the view.
