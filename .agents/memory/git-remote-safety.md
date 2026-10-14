---
name: Git remote credential safety
description: Avoid exposing credentials when inspecting this checkout's remote configuration.
---

Never dump raw Git remote URLs or Git configuration to tool output. Redact URL user information before displaying remote addresses.

**Why:** This checkout's remote configuration has contained embedded authentication credentials; a routine remote listing can expose them.

**How to apply:** Extract only the hostname and repository path when identifying a repository. Do not save, reproduce, or reuse embedded credentials; use the configured credential flow instead.
