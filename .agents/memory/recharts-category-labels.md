---
name: Recharts composite category labels
description: Keep compound chart identities unique without hiding valid category labels.
---

Custom tick JSX does not by itself control Recharts' label-collision measurements. When category identity contains a long composite value, supply a compact tick formatter as well as the custom visual tick; show every category for small groups and allow horizontal scrolling on narrow screens.

**Why:** Distinct subject bars rendered correctly, but automatic tick selection measured their long internal identities and hid the old/new subject labels despite the custom two-line renderer.

**How to apply:** Keep category identity separate from readable captions and tooltip text. Verify actual visible labels, not just the number of paths or the correctness of hover values.
