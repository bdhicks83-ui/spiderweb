# MASTER-STATE NOTE — 2026-07-29 · Tier 1 / Build 2: Capture Campaign

> **FOLD INTO `MASTER-STATE.md` AND BUMP THE HEADER TO `v2.45`.**
> Lineage: v2.43 → **v2.44** (T1B1 Admin Console, verified) → **v2.45** (this).
> 🛑 The **repo** copy is still **v2.30** and must not be folded into — see the
> stale-doc warning in `claude/MASTER-STATE-NOTE-2026-07-29-t1b1-admin-console.md`.

---

## Status

| | |
|---|---|
| **Code** | ✅ Written to the repo, **uncommitted** |
| **Scoped typecheck** | ✅ CLEAN — `tsconfig.t1b2.json`; T1B1 and P-9 configs re-checked CLEAN |
| **Migration** | ⏳ `supabase/t1b2-capture-campaign.sql` — **not run yet** |
| **Deployed** | ⏳ not committed / not pushed |
| **Browser-verified** | ⏳ **NOT VERIFIED — an unclicked surface is an unverified surface** |
| **Customer-facing copy** | ⏳ DRAFT, pending Brian |

---

## The 30-second-version block to insert

⭐⭐⭐ **TIER 1 / BUILD 2 — THE CAPTURE CAMPAIGN IS BUILT (July 29, LOCAL + STAGED).** Build 1 puts fifteen people on the account in ten minutes and then **nothing happens** — nothing in this product ever ASKED any of them to codify anything, and an org with zero frameworks has no retrieval, no conflicts, no prescriptions, no gaps. This is the ask, made concrete and trackable.

- **New surfaces:** `/campaigns` (name a push, pick people, put a question to each) · `/campaigns/[id]` (progress) · `/requests` ("asked of you," the assignee's whole experience). Nav badge + `/codify?request=` banner. Dashboard tiles for both sides.
- **⭐ THE UNIT IS A QUESTION PUT TO A NAMED PERSON.** "Please document your process" produces nothing — and has been the shipped feature of every knowledge-management product in history. "How do you decide whether the first run after a profile changeover can ship before the bond-strength check clears?" produces a framework. The schema enforces it.
- **⭐⭐ THE FLYWHEEL CLOSES ON THE SUPPLY SIDE.** The primary campaign-building path reads the **P-9 knowledge_gaps queue** — real questions real people typed that retrieval actually failed, ranked by `asked_count` — and turns a row into an assignment (`source='gap'`). Demand → ask → capture → retrieval → the next question. No other surface connects those two ends. The assignee sees *"4 people hit this and found nothing."*
- **⭐ THE READ BOUNDARY (load-bearing).** `capture_campaigns` = ORG-WIDE read. `capture_requests` = **the person asked · their direct manager (`is_manager_of()`, P-6) · an org admin (`is_org_admin()`, T1B1)** — and NOT the org. A request row carries "asked N things, captured none," which org-wide is a person-level negative signal on a peer-visible surface. **A capture campaign must not become a leaderboard of who is behind.** The P-8 "an org-wide table can silently widen a narrower one" lesson, applied before it bit.
- **⭐ DECLINE IS FIRST-CLASS, WITH A REQUIRED REASON, AND COMES OUT OF THE DENOMINATOR.** "Not me — Dana owns that call now" is the most useful thing a misrouted assignee can say, and only gets said if it's easy and costless. 3 of 10 passed + 7 of 7 captured = **100%**. Counting declines against completion would teach managers to stop offering the option and the routing signal would vanish.
- **Read-time reconciliation, never a client callback** (`reconcileStartedRequests()`) — verbatim the P-9 lesson and shape, including `CLAIM_STALE_HOURS = 24` mirrored deliberately from P-9. Known imprecision (unrelated framework inside the window links) stated, with a manual re-link escape hatch.
- **⚠️ ONLY THE PERSON ASKED MAY MOVE THEIR OWN ASK** — not their manager, not an admin. A manager marking somebody else's ask "captured" would put a claim about what a person knows into the record without that person saying it. Linking is additionally author-gated.
- **Campaign ownership = manager OR admin**, deliberately broader than the admin console: asking your people to write down how they decide something is ordinary management, not account administration.
- ⏳ **Brian owes:** run `supabase/t1b2-capture-campaign.sql` · commit + push · browser-verify the loop · **approve the DRAFT copy** (5 marked blocks). **Build 3 (Value Readout) is next.**

---

## Phases-table row to add

| Phase | Status |
|---|---|
| T1B2 Capture Campaign | 🟠 **BUILT + STAGED July 29 — LOCAL ONLY.** Migration not run · not committed · not browser-verified. `tsconfig.t1b2.json` clean. Copy DRAFT. Build 2 of 3 |

---

## Gotchas to add to the STACK gotcha list

- **T1B2 — decide a new table's READ BOUNDARY before anything else about it.** If its rows imply something about a named person, the boundary determines what the progress bar may count, what a peer sees, and whether the feature is a knowledge product or a compliance scoreboard. `capture_requests` = assignee + direct manager + org admin, never the org.
- **T1B2 — a decline must not count against completion.** `computeProgress()` removes declines from the denominator. A metric that punishes the honest answer teaches people to stop giving it, and the routing signal it carried disappears with it.
- **T1B2 — only the subject may move their own capture request.** Manager and admin can see it, add asks, and close the campaign; they cannot mark it captured. Anything else writes a claim about what a person knows without that person having said it.
- **T1B2 — `prompt_norm` is exact-normalized ONLY, not the P-9 semantic de-dupe.** Two similarly-worded asks to the same person are a judgment the asker is allowed to make; merging them deletes a human instruction.
- **T1B2 — the badge count path skips the reconciler on purpose.** It runs on every page load in the app; a one-page-load-stale badge is fine, a multi-query reconcile on every render is not.
- **T1B2 — `CLAIM_STALE_HOURS` is mirrored from P-9 deliberately.** Same promise, same failure mode. Change both or neither.

---

## Open loops this build creates

1. ⏳ Run `supabase/t1b2-capture-campaign.sql` (one paste block).
2. ⏳ Commit + push (targeted `git add` — the repo still has unrelated CRLF-only churn).
3. ⏳ Browser-verify the loop: create a campaign seeded from the gaps queue → the assignee sees it → capture → it links itself → progress moves. Plus the boundary walk as three identities (assignee / their manager / an unrelated peer).
4. ⏳ Approve the DRAFT copy (5 marked blocks).
5. 🅿️ **Deferred by decision:** notification of an ask by email/push · suggesting WHO to ask (routing implies the system knows the expert — the same guess P-9 refused to make) · recurring campaigns · a reader over decline reasons · learning-ledger signals (an ask is an action, not a judgment about engine output).
6. ⚠️ The demo org has no campaign in it. If a campaign should appear on camera, seed one from the open AWIP knowledge gap **before** filming.
