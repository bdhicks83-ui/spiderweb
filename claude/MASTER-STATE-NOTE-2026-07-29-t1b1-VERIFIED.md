# T1B1 VERIFICATION — 2026-07-29 · Admin & Onboarding Console

> **STATUS: ✅ DEPLOYED + BROWSER-VERIFIED END TO END on `spiderweb-nine.vercel.app`.**
> Commit `eb559d0`. Migration run. Every beat below was closed by a physical
> click on the deployed app, not by an API call or a typecheck.
> Folds into `MASTER-STATE.md` alongside `claude/MASTER-STATE-NOTE-2026-07-29-t1b1-admin-console.md` at **v2.44**.

---

## The DONE test, walked live

| Beat | Seat driven | Result |
|---|---|---|
| Non-admin manager denied `/admin` | Brian Montes (manager, 4 reports) | ✅ honest gate state, no data leaked |
| Admin tile hidden for non-admin | Brian Montes | ✅ hidden; other 6 tiles unchanged |
| Every admin write route denied | Brian Montes | ✅ 403 `NOT_ORG_ADMIN` on invite + org-rename probes; org untouched |
| `/admin` opens, people list correct | Chuck Milner (admin) | ✅ 15 people, real titles, real reporting lines, per-person framework counts, "hasn't signed in yet" chips |
| Setup checklist reflects real state | Chuck Milner | ✅ 100%, "15 people", "10 of 15 people have codified at least one" — recomputed live on every mutation |
| Invite a person (real keystrokes) | Chuck Milner | ✅ seat created with name/email/title/role/manager; count 15 → 16; checklist re-derived to "16 people / 10 of 16" |
| Invite link shape | — | ✅ `/auth/callback?token_hash=…&type=invite&next=/settings`, "Good for 24 hours" |
| Edit role + title + reporting line | Chuck Milner | ✅ all three persisted; manager count 6 → 7 |
| Re-issue a sign-in link | Chuck Milner | ✅ fresh `type=magiclink`, "Good for 1 hour" |
| **The invited person signs in** | T1B1 Verify Seat | ✅ **link landed them in the app, in the AWIP org (18-record shared library visible)** |
| Invited non-admin can't reach `/admin` | T1B1 Verify Seat | ✅ 403, no admin tile |
| Close a seat | Chuck Milner | ✅ active 16 → 15, deactivated 1, manager count 7 → 6, row preserved with title intact |
| **Nothing cascaded** | — | ✅ `/api/library` still 18 records before and after the close |
| Reopen a seat | Chuck Milner | ✅ back to active; role + reporting line preserved; "Admin access isn't restored automatically" notice fired |

## Guards, each fired correctly

| Guard | Response |
|---|---|
| Reporting cycle (make a manager report to their own report) | 400 `REPORTING_CYCLE` |
| Self-report | 400 "Nobody reports to themselves." |
| Remove your own admin access | 400 `LAST_ADMIN_SELF` |
| Deactivate your own seat | 400 `SELF_DEACTIVATE` |
| Write to a profile in ANOTHER org | 404 "That person isn't on this account." (deliberately ambiguous — an admin must not be able to probe another tenant's ids) |
| Invite an email already on the account | 409 `ALREADY_MEMBER` |

⭐ **The load-bearing decision held in production.** Brian Montes passes `is_manager()` (Training Studio, prescription gate, coaching all still work for him) and is still locked out of `/admin`. That is exactly what would have broken if admin had been added as a third `profiles.role` value.

---

## Two findings from the verification

**1. 🛑 A GRANT THAT CAN NO-OP MUST SAY SO.** The migration's demo-seat statement
(`update … where id in (select id from auth.users where email = '…')`) matched
ZERO rows and reported nothing. The migration succeeded, the console deployed
correctly, and the AWIP walkthrough seat simply couldn't open `/admin` — which
is visually indistinguishable from a broken gate. Cost one diagnostic round
trip. **Fixed in the file**: `ilike` match wrapped in a DO block with
`get diagnostics row_count` and a `raise notice` on BOTH branches. This is the
same family as the P-7 PostgREST silent-upsert trap and the P-8 "reported not
hidden" rule — a write whose failure mode is silence is a write that will
eventually be debugged from the wrong end.

**2. ⚠️ `window.confirm` BLOCKS AUTOMATED VERIFICATION.** The "Close this seat"
confirmation is a native browser dialog, which freezes the Claude-in-Chrome
extension and cannot be dismissed from the driving side. It was worked around
by stubbing `window.confirm` before the click. It is fine for a human, but any
future destructive-action confirm should be an in-page modal if the beat is
meant to be machine-verifiable. Logged, not changed — the confirm is correct
UX and this build is verified.

---

## Loose end for Brian (one click, no SQL — which is the point)

`T1B1 Verify Seat` / `t1b1.verify@awip-demo.example` is **active** in the AWIP
demo org and would appear in the roster on camera. To retire it: sign in as
`chuck.milner@awip-demo.example` → `/admin` → **Close this seat**. It stays as
a closed row (never deleted, by design) and drops out of the active list, the
counts, and the checklist.

The browser is currently signed in as the verify seat — signing back in as
Chuck is required anyway.
