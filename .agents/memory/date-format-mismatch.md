---
name: Date format mismatch between Supabase and chart labels
description: Supabase date columns return YYYY-MM-DD; chart X-axis labels use YYYY/MM/DD. Mismatch causes ReferenceLine to not render and string comparisons to fail.
---

## Rule
When comparing Supabase date strings (YYYY-MM-DD) against chart item labels (YYYY/MM/DD), always normalize to one format first.

**Why:** Recharts ReferenceLine `x` prop must exactly match the data key value in the chart. If X-axis data is "2025/10/01" but x prop is "2025-10-01", the line is silently dropped.

**How to apply:**
- For filtering: convert labels to ISO with `s.replace(/\//g, "-")` before comparing against Supabase date strings.
- For ReferenceLine `x` prop: convert Supabase date to slash format with `c.startDate.replace(/-/g, "/")`.
