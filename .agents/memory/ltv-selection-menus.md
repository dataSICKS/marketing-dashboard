---
name: LTV selection menus
description: Why LTV uses app-rendered single-select menus instead of native dropdowns.
---

Prefer app-rendered menus for LTV single-select controls.

**Why:** The user reported dropdowns immediately closing in the embedded LTV preview. Native selects were replaced to avoid relying on browser-owned popup behavior. The browser-specific cause was not independently reproduced.

**How to apply:** Keep LTV single-select menus consistent when adding filters. Do not interpret this choice as proof that all native selects fail, or change unrelated pages without evidence.
