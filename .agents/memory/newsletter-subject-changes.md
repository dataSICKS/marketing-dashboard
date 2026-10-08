---
name: Newsletter subject changes
description: A scenario can retain its identity while its delivered email subject changes.
---

## Rule
Treat scenario identity and email subject as independent. In scenario/template detail views, different subjects must be separate rows with separately computed counts and rates, not one row listing subjects beside combined metrics. Missing subjects stay in their own row.

**Why:** The user compares subject changes within the same scenario and explicitly rejected listing multiple subjects in a single combined-metrics row: 「2行にして数値も分けて見れるようにしないとだめ」.

**How to apply:** Check the actual subject recorded for each delivery date before assigning a change boundary. Charts and period-comparison identities must use the same scenario/template-plus-subject grouping as the table. Daily total trends and matrix time-series remain temporal totals unless subject-level series are explicitly requested. A before/after rate difference is not proof of a causal subject-line effect.
