---
name: Orval codegen manual update
description: Orval codegen fails due to "Failed to resolve input" error and cleans generated files; manual restoration approach required.
---

## Rule
When `pnpm --filter @workspace/api-spec run codegen` fails with "Failed to resolve input", do NOT retry codegen. Instead:
1. Restore generated files from git: `git show HEAD:lib/api-client-react/src/generated/api.ts > lib/api-client-react/src/generated/api.ts` (and other generated files)
2. Add new types to `lib/api-client-react/src/generated/api.schemas.ts` by appending
3. Add new types to the top-level import block in `lib/api-client-react/src/generated/api.ts`
4. Append new hook functions to `lib/api-client-react/src/generated/api.ts`

**Why:** Orval v8 with `clean: true` deletes generated files before failing, leaving the workspace broken. The root cause of the parse failure is unclear (possibly OpenAPI 3.1 nullable syntax or a spec validation issue). Working around it manually is faster than debugging Orval.

**How to apply:** Any time a new API endpoint is added and codegen is needed.

## Generated files to restore
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/index.ts`
