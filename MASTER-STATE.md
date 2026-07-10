# MASTER-STATE

Full-replacement snapshot of the current build state. Overwrite this file each
session; do not append. For the reasoning behind decisions, see `DECISION-LOG.md`
(append-only).

_Last updated: 2026-07-10 -- Phase 5 Credibility v2 (dashboard-link fix)._

> **Naming reconciliation:** the Cowork session that built this labeled it
> "Phase 8" internally. Brian's canonical numbering -- and the shipped commit
> `2a44e54 "Phase 5 Credibility v2"` -- call it **Phase 5**. This doc now uses
> **Phase 5** throughout; "Block 1-5" still refers to the five sub-features below.

---

## Phase 5 -- Expert Credibility v2 (5 Blocks)

Locked principle: **no recency-decay anywhere.** Quality locks at verification;
corroboration is additive-only.

| Block | Feature | Status | Local | Live |
|---|---|---|---|---|
| 1 | Quality + Corroboration scoring engine | **Shipped + LIVE** | Yes | Yes |
| 2 | Non-blocking consistency + belief-revision gate | **Shipped + LIVE** | Yes | Yes |
| 3 | Cross-expert benchmarking | **Deferred (deliberate)** | No | No |
| 4 | Org-fit matching | **Shipped + LIVE** | Yes | Yes |
| 5 | Longitudinal growth score (dashboard-only) | **Shipped + LIVE** | Yes | Yes |

**Block 3 is intentionally not built** -- it needs 5+ experts per competency to
activate, which is untestable while participation is invite-only (one real
account). No schema, no stubs. Same ship-thin call as Phase 7's held admin UI.

---

## Local vs Live -- READ THIS

- **LOCAL:** All Block 1/2/4/5 code written, passes `tsc --noEmit` clean (exit 0).
- **LIVE:** **All of Phase 5 is live.** Committed + pushed (`2a44e54`), deployed to
  `spiderweb-nine.vercel.app`, SQL migration run against Supabase
  (`ekjhwyeipzmmncfedeqm`). Data confirmed correct (503 approved insights under the
  right user after the user_id migration fix).

### The "cards not showing" bug (2026-07-10) -- ROOT CAUSE + FIX

- **Symptom:** none of the three Phase 5 cards ("Your Spiderweb's Value" / Blocks
  1+5, "Needs your context" / Block 2) appeared on the live root page `/`.
- **Root cause:** *not* a fetch failure, stale build, or missing commit. All three
  cards live in `/dashboard` (`src/app/dashboard/page.tsx`), and **nothing in the
  app links to or redirects to `/dashboard`.** Login lands on `/`
  (`login/page.tsx:40`), and the root page (`src/app/page.tsx`) only renders the
  departments grid + Emerging patterns -- it never imported the cards. `/dashboard`
  was an orphan URL reachable only by typing it manually. The *entire* hub (3 Phase
  5 cards + resume banner + Phase 7 credibility score + gap banner + profile
  verification) was stranded there for the same reason.
- **Fix:** added a "📊 Your Dashboard" hub link on the root page `/`
  (`src/app/page.tsx`, above the Departments grid) pointing to `/dashboard`. Chosen
  over inlining the cards because it surfaces the whole hub with no server/client
  component refactor. `/dashboard` was always the intended personal hub (see
  DECISION-LOG Step 4) -- it was just never wired into navigation.

### Card status after fix
| Card | Route it lives on | Local | Live |
|---|---|---|---|
| Your Spiderweb's Value (Blocks 1+5) | `/dashboard` | Works | Reachable via new `/` link |
| Needs your context (Block 2) | `/dashboard` | Works | Reachable via new `/` link |
| (Growth trend, inside Block 1 card) | `/dashboard` | Works | Reachable via new `/` link |

> First-run note: on `/dashboard`, hit **Refresh** on "Your Spiderweb's Value" once
> to run retroactive per-insight scoring (`/api/score-insights`) over all approved
> insights and write the first growth snapshot. Blocks 1 & 5 render their empty
> state until that snapshot exists.

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
