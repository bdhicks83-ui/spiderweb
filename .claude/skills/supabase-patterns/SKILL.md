---
name: supabase-patterns
description: Hard-won Supabase rules for the Spiderweb project - which client to use where, RLS gotchas that cause silent failures, safe SQL editor workflows. Use whenever writing any code that touches Supabase, debugging "data not showing up" issues, or running SQL in the Supabase dashboard.
---

# Supabase Patterns

## Client selection — THE #1 silent-failure source
| Context | Client | Why |
|---|---|---|
| User-facing pages (upload, approve, dashboard) | **Session-aware client** | RLS filters by logged-in user |
| API routes acting for a user | Session-aware (from request cookies) | Same |
| Background jobs (Inngest), admin scripts | **Service-role client** | Bypasses RLS |

**Known failure:** the approval screen was originally built with a non-session client. It didn't error — RLS just silently returned zero rows. If a query "works but returns nothing," check the client FIRST.

**Never** expose SUPABASE_SERVICE_ROLE_KEY in frontend/NEXT_PUBLIC code.

## RLS debugging checklist (in order)
1. Which client is the code using? (see table above)
2. Does the table's policy cover this command (SELECT vs INSERT vs ALL)?
3. Is user_id being set on insert? RLS insert policies fail silently if user_id doesn't match auth.uid().
4. Only then suspect the query itself.

## SQL Editor workflows
- **"Potential issue detected / destructive operations" warning:** Supabase flags ANY schema change (even additive ALTER TABLE ADD COLUMN). If the SQL only ADDS things — run it. If it contains DROP/DELETE/TRUNCATE — stop and review line by line.
- **Before UPDATE/DELETE by a column:** run `SELECT * FROM table LIMIT 5;` first to confirm the column exists. (Real bug: tier-test UPDATEs assumed an email column on profiles; it only has id.)
- Test-tier pattern: `UPDATE profiles SET plan = 'executive' WHERE id = '<uuid from select>';`

## Schema-change discipline
- Additive migrations only where possible (add columns, don't rename in place).
- After ANY schema/policy change: re-run the refresh queries in spiderweb-architecture and diff-update ARCHITECTURE.md.
