# MASTER-STATE

Full-replacement snapshot of the current build state. Overwrite this file each
session; do not append. For the reasoning behind decisions, see `DECISION-LOG.md`
(append-only).

_Last updated: 2026-07-10 -- Phase 8 Credibility v2._

---

## Phase 8 -- Expert Credibility v2 (5 Blocks)

Locked principle: **no recency-decay anywhere.** Quality locks at verification;
corroboration is additive-only.

| Block | Feature | Status | Local | Live |
|---|---|---|---|---|
| 1 | Quality + Corroboration scoring engine | **Shipped (local)** | Yes | No |
| 2 | Non-blocking consistency + belief-revision gate | **Shipped (local)** | Yes | No |
| 3 | Cross-expert benchmarking | **Deferred (deliberate)** | No | No |
| 4 | Org-fit matching | **Shipped (local)** | Yes | No |
| 5 | Longitudinal growth score (dashboard-only) | **Shipped (local)** | Yes | No |

**Block 3 is intentionally not built** -- it needs 5+ experts per competency to
activate, which is untestable while participation is invite-only (one real
account). No schema, no stubs. Same ship-thin call as Phase 7's held admin UI.

---

## Local vs Live -- READ THIS

- **LOCAL:** All Block 1/2/4/5 code is written and passes `tsc --noEmit` clean
  (exit 0).
- **LIVE:** **Nothing is live.** Not committed, not pushed, not deployed to
  `spiderweb-nine.vercel.app`. The SQL migration has **not** been run against the
  live Supabase (`ekjhwyeipzmmncfedeqm`).

### Owner next steps to go live
1. Run `supabase/phase8-credibility-v2.sql` in the Supabase SQL editor (idempotent,
   safe to re-run).
2. Commit + push + deploy per `deployment-workflow`.
3. On the dashboard, hit **Refresh** on "Your Spiderweb's Value" once -- this runs
   the retroactive per-insight scoring (`/api/score-insights`) over all existing
   approved insights (Creator Expert Profile + the 18 LIT articles) and writes the
   first growth snapshot.

---

## Files added / changed this phase

**Schema (not yet run on live):**
- `supabase/phase8-credibility-v2.sql` -- Blocks 1, 2, 4, 5. Adds columns to
  `insights` + `profiles`; new tables `org_fit_assessments`, `growth_snapshots`.

**Library / logic (new):**
- `src/lib/insight-score.ts` -- quality/corroboration engine, badges, backfill,
  approval-lock, corroboration bump.
- `src/lib/consistency.ts` -- non-blocking contradiction detection.
- `src/lib/growth.ts` -- monthly growth snapshot composite.

**Claude wrappers (added to `src/lib/claude.ts`):**
- `scoreBeliefRevision`, `inferBehavioralProfile`, `assessOrgFit`.

**Prompts (new):**
- `prompts/belief-revision.md`, `prompts/behavioral-profile.md`, `prompts/org-fit.md`.

**API routes (new):**
- `POST /api/score-insights` -- retroactive per-insight scoring.
- `POST /api/explain-revision` -- belief-revision explanation + depth gate.
- `POST /api/org-fit` -- org intake -> fit summary (unauthenticated, org-facing).
- `GET|POST /api/growth` -- read trend / recompute this month's snapshot.

**API routes (modified):**
- `src/app/api/embed-insights/route.ts` -- runs non-blocking consistency flag +
  locks quality score at approval.
- `src/app/api/ask/route.ts` -- additive corroboration bump on insight usage.

**UI (new / modified):**
- `src/app/org-fit/page.tsx` (new) -- org-facing intake + fit summary.
- `src/app/dashboard/page.tsx` (modified) -- new "Needs your context" card
  (Block 2) and "Your Spiderweb's Value" card with portfolio badge + growth
  sparkline (Blocks 1 + 5). Existing Phase 7 per-user score card left untouched.
- `src/app/approve/page.tsx` (modified) -- approval is now non-blocking.

---

## Untouched by design
- Phase 7 risk-monitoring (`risk_score`, `credibility_scores`, `lib/risk.ts`,
  `lib/voice.ts`) -- separate system, additive only.
- Identity/Credential Verification tiers -- not built (invite-only makes it
  unnecessary for now).
- `insights` RLS -- still the single blanket ALL policy.
