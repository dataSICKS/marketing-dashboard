---
name: Supabase DDL limitations
description: Supabase PostgREST API cannot execute DDL (CREATE TABLE etc.). New tables require manual creation via Dashboard or Management API with a separate access token.
---

## Rule
Never attempt to run DDL via `supabase-js` `.rpc()` or the PostgREST REST endpoint — it will fail with PGRST202/PGRST205.

**Why:** PostgREST only exposes table/function endpoints defined in the schema cache; schema changes require direct Postgres access or the Supabase Management API (which needs a separate management token, not the service role key).

**How to apply:**
- New tables: ask user to run `CREATE TABLE` in Supabase Dashboard → SQL Editor (https://supabase.com/dashboard/project/{ref}/sql).
- Project ref for this project: `kqhckosphntfuhqrxcoj`.
- The service role key works for DML (INSERT/UPDATE/DELETE) and SELECT, but not DDL.
