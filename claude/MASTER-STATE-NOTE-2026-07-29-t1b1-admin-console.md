# MASTER-STATE NOTE — 2026-07-29 · Tier 1 / Build 1: Admin & Onboarding Console

> **FOLD THIS INTO `MASTER-STATE.md` AND BUMP THE HEADER TO `v2.44`.**
> The canonical lineage before this note is **v2.43** (project copy).
>
> 🛑 **STALE-DOC WARNING, 4th OCCURRENCE — READ BEFORE YOU FOLD.**
> The **repo** copy at `spiderweb/MASTER-STATE.md` is still **v2.30**, written
> by a parallel Claude Code session during the expert-title fix. It is missing
> the rebrand / Studio / P-8 / P-9 / flywheel / AWIP-reseed / script-repoint
> lineage. **Do not fold this note into the repo copy.** Fold it into the
> project copy (v2.43 → v2.44), then overwrite the repo copy with the result.

---

## Status of this build

| | |
|---|---|
| **Code** | ✅ Written to the repo, **uncommitted** |
| **Scoped typecheck** | ✅ CLEAN — `tsconfig.t1b1.json` |
| **Migration** | ⏳ `supabase/t1b1-admin-console.sql` — **not run yet** |
| **Deployed** | ⏳ not committed / not pushed |
| **Browser-verified** | ⏳ **NOT VERIFIED — an unclicked surface is an unverified surface** |
| **Customer-facing copy** | ⏳ DRAFT, pending Brian |

---

## The 30-second-version block to insert

⭐⭐⭐ **TIER 1 / BUILD 1 — THE ADMIN & ONBOARDING CONSOLE IS BUILT (July 29, LOCAL + STAGED).** The wall between "a demo" and "a product a company can run." A customer's own admin can now create the org, invite their people, set titles/roles/reporting lines, close a seat, rename the org, and watch a setup checklist fill in — **with no SQL, no seed script, and no Brian in the database.** Every org before this was born from `seed-awip-demo.mjs`.

- **New surfaces:** `/admin` (people · org settings · setup checklist) and `/admin/start` (first-run org creation). Admin-gated dashboard tile. Viridescent theme throughout.
- **⭐ THE LOAD-BEARING DECISION — org admin is a SEPARATE BOOLEAN (`profiles.is_org_admin`), NOT a third `profiles.role` value.** `is_manager()` is `role='manager' OR anybody has you as manager_id`; an admin promoted to `role='admin'` with no direct reports would SILENTLY lose Training Studio, the prescription manager gate, and every other manager check. Administering seats and managing people are orthogonal capabilities. **Nothing that already checks `role` or `is_manager()` changes behavior because of this build.**
- **Two new SECURITY DEFINER functions:** `is_org_admin()` (companion to P-7's `is_manager()`) and `is_org_admin_of(uuid)` (companion to P-6's `is_manager_of(uuid)` — the tenant boundary expressed in SQL, not trusted to a route). **The gate is an RPC on the SESSION client, never a column read** — Postgres evaluates the authority as the caller, and "a deactivated admin is not an admin" then lives in exactly one place.
- **⭐ INVITE = COPY-A-LINK, NOT EMAIL** (nothing in this repo sends mail; Supabase's built-in SMTP is rate-limited below what a live onboarding session needs). Uses Supabase's own `auth.admin.generateLink()` — **no new auth flow, no password ever created/seen/stored, no token stored.** Wiring email later replaces one function call.
- **⚠️ THE PKCE TRAP (new standing gotcha):** the browser magic-link path is PKCE (code verifier in the browser). A **server**-generated link has no verifier, so the existing `?code=` exchange fails for the invited person every single time — and it presents as a broken invite, not as a flow mismatch. `/auth/callback` now also handles `?token_hash=&type=` → `verifyOtp()`; the `?code=` branch is byte-identical to P-1. `?next=` is validated to a single-slash relative path (an open redirect on an auth callback is how a sign-in link becomes a phishing link).
- **🛑 SOFT-DEACTIVATE ONLY — there is no delete in this build and there never will be.** `deactivated_at` / `deactivated_by` on the profile + a **reversible** GoTrue ban so sign-in actually stops. Zero rows dropped, nothing cascaded: their frameworks, conflicts, Win Column mentions and filled gaps all stay under their name. The `+test1` lesson encoded as a product rule — "remove this person" is a request to close the seat, never to destroy what they knew. **The sign-in block is reported separately**: if it fails the admin is TOLD the person can still sign in, rather than shown a green check over a half-applied change.
- **Guards:** same-org (from the caller's own `org_id`, never the request body) · no reporting cycles (`wouldCycle()` — the coaching/prescription code WALKS the `manager_id` graph, so a loop is not cosmetic) · can't remove the last admin · can't remove your own admin access · cross-org invites refused rather than silently re-homed.
- **Backfill:** every existing org gets exactly one admin (top of the reporting chain → else earliest profile), so no org ships unadministrable. Brian's account is always an admin. **`chuck.milner` is granted the flag** so the AWIP walkthrough seat can open the console — additive capability only, zero change to demo content, frameworks, conflicts or counts.
- ⏳ **Brian owes:** run the migration (one block) · commit + push · browser-verify `/admin` as chuck.milner · **approve the DRAFT customer-facing copy**. **Build 1 of 3 — Builds 2 (Capture Campaign) and 3 (Value Readout) come after verification.**

---

## Phases-table row to add

| Phase | Status |
|---|---|
| T1B1 Admin & Onboarding Console | 🟠 **BUILT + STAGED July 29 — LOCAL ONLY.** Migration not run · not committed · not browser-verified. Scoped typecheck (`tsconfig.t1b1.json`) clean. Copy DRAFT pending Brian. Build 1 of 3 |

---

## Gotchas to add to the STACK gotcha list

- **T1B1 — an orthogonal capability must not become a rung on an existing ladder.** `is_org_admin` is a boolean, NOT a third `profiles.role` value: `is_manager()` reads `role='manager' OR anybody has you as manager_id`, so an admin with no direct reports and `role='admin'` would silently lose every manager gate in the product. The tell for this class of bug: ask what breaks for someone who has the NEW capability and none of the old one.
- **T1B1 — a server-generated Supabase auth link cannot use the `?code=` PKCE exchange.** There is no code verifier anywhere for a link made by `auth.admin.generateLink()`. Use `?token_hash=&type=` → `verifyOtp()`. `/auth/callback` handles both shapes; do not collapse them.
- **T1B1 — the admin gate is `supabase.rpc('is_org_admin')` on the SESSION client, never `select is_org_admin`.** SECURITY DEFINER evaluation as the caller is what makes it unforgeable, and it keeps "a deactivated admin is not an admin" in one place instead of six route handlers.
- **T1B1 — `is_org_admin_of(uuid)` is the tenant boundary in SQL**, the admin-side companion to P-6's `is_manager_of(uuid)`. Routes ALSO `.eq("org_id", orgId)` on every write — belt and braces, deliberately.
- **T1B1 — deactivation never narrows the org-peer profiles read policy.** An author's `display_name` must keep resolving on every framework they ever captured, forever. Closing a seat and hiding a person are different things and only the first one is ever correct here.
- **T1B1 — `waitForProfile()` before any post-invite profile UPDATE.** `handle_new_user()` lands the profile row on an `auth.users` trigger; without the wait the UPDATE that carries `org_id`/`role`/`title` affects ZERO rows and the invited person joins no org at all — silently.
- **T1B1 — the setup checklist is derived at read time, never stored.** A stored progress column drifts away from the thing it claims to describe (same reasoning as P-9's read-time gap reconciliation).

---

## Open loops this build creates

1. ⏳ **Run `supabase/t1b1-admin-console.sql`** (one paste block, Supabase SQL editor).
2. ⏳ **Commit + push** (PowerShell, targeted `git add` — see the handoff block; the repo has unrelated CRLF-only churn in `diag-*.txt`, `test.json`, `detect-clusters/route.ts`, `extract-insights/route.ts` that should NOT be swept in).
3. ⏳ **Browser-verify** `/admin` as `chuck.milner@awip-demo.example` — the standing rule: a physical click on the deployed URL is the only thing that closes a UI beat. Invite a throwaway seat, click the link in an incognito window, edit a role/title/manager, close and reopen a seat.
4. ⏳ **Approve the customer-facing copy** (three marked DRAFT blocks).
5. 🅿️ **Deferred by decision:** invite email delivery · bulk/CSV import · an admin audit log · seat limits / billing · public self-serve signup wired to `/admin/start`.
6. ⚠️ **The repo `MASTER-STATE.md` is still v2.30** — overwrite it with the folded v2.44 on this commit and finally close that doc-debt item.
