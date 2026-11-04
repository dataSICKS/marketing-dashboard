---
name: Newsletter subject changes
description: A scenario can retain its identity while its delivered email subject changes.
---

## Rule
Treat scenario identity and email subject as independent. In scenario/template detail views, different subjects must be separate rows with separately computed counts and rates, not one row listing subjects beside combined metrics. Missing subjects stay in their own row.

**Why:** The user compares subject changes within the same scenario and explicitly rejected listing multiple subjects in a single combined-metrics row: 「2行にして数値も分けて見れるようにしないとだめ」.

**How to apply:** Check the actual subject recorded for each delivery date before assigning a change boundary. Charts and period-comparison identities must use the same scenario/template-plus-subject grouping as the table. Daily total trends remain temporal totals. A before/after rate difference is not proof of a causal subject-line effect.

Ordinary scenario/template detail tables have one row per name + actual subject across the entire selected date range. Day/week/month is the chart's grouping, not an invisible extra table grouping. Missing subjects remain separate.

**Why:** The user challenged repeated identical name/subject rows: 「まさか期間が表示されてないだけど行が分かれる原因になってないよね？」. Hiding a period column while retaining period-split rows is not the intended behavior.

**How to apply:** Keep chart period buckets separate from full-range table aggregation, including scenario-group subtables and comparisons. Recompute rates from total counts, never average bucket rates. Preserve all date, scenario, template and comparison filters.

When 件名 is selected as a matrix grouping dimension, split actual delivery records by subject, with that subject's metrics. Do not relabel historical totals with the latest subject.

**Why:** The user superseded their initial latest-subject choice: 「過去のデータを合算して最新件名じゃなくて、その件名で表示した時は行を分けて、指標とともに表示」.

**How to apply:** Apply the same subject grouping in both matrix layouts, chart identities and comparisons. Preserve subjects present on only one comparison side, with no metrics borrowed from a different subject.

When selected, show the matrix subject in a dedicated 「件名」 column, not as secondary text beneath the name.

**Why:** The user rejected the inline placement as hard to read and asked 「列を追加して。見にくいわ。」.

**How to apply:** Keep this separate column in both metric layouts and comparison mode. If the user deselects 件名 as a grouping dimension, intentionally recompute combined metrics from matching delivery records instead.
