---
name: Newsletter subject changes
description: A scenario can retain its identity while its delivered email subject changes.
---

## Rule
Treat scenario identity and email subject as independent. In scenario/template detail views, different subjects must be separate rows with separately computed counts and rates, not one row listing subjects beside combined metrics. Missing subjects stay in their own row.

**Why:** The user compares subject changes within the same scenario and explicitly rejected listing multiple subjects in a single combined-metrics row: 「2行にして数値も分けて見れるようにしないとだめ」.

**How to apply:** Check the actual subject recorded for each delivery date before assigning a change boundary. Charts and period-comparison identities must use the same scenario/template-plus-subject grouping as the table. Daily total trends remain temporal totals. A before/after rate difference is not proof of a causal subject-line effect.

The matrix must also split actual delivery records by subject, with that subject's metrics. Do not relabel historical totals with the latest subject.

**Why:** The user superseded their initial latest-subject choice: 「過去のデータを合算して最新件名じゃなくて、その件名で表示した時は行を分けて、指標とともに表示」.

**How to apply:** Apply the same subject grouping in both matrix layouts, chart identities and comparisons. Preserve subjects present on only one comparison side, with no metrics borrowed from a different subject.
