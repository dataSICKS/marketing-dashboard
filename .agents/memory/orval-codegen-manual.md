---
name: Orval codegen safeguards
description: How to preserve generated clients and diagnose Orval input-resolution errors caused by invalid OpenAPI YAML.
---

## Rule
Keep Orval output cleanup disabled so a failed generation does not delete the last working generated clients. When Orval reports `Failed to resolve input`, validate the OpenAPI YAML before assuming the path or `import.meta.url` is at fault; quote scalar text containing YAML-significant punctuation such as a colon followed by a space.

**Why:** Orval's YAML loader can wrap a YAML parser exception in the generic input-resolution error. This made an invalid unquoted description look like a configuration-path issue and previously led to unnecessary manual generated-file edits.

**How to apply:** After changing the OpenAPI spec, run the codegen command and the library typecheck. If input resolution fails, fix YAML syntax first; the retained outputs provide a safe fallback while the specification is corrected.
