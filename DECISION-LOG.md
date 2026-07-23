# DECISION-LOG

Running log of non-obvious build decisions. Newest first.

---

## 2026-07-21 -- P0 build: Elicitation Engine (`/codify` → Pattern Record → branded framework)

**What shipped (local code only -- migration + deploy pending):** the full P0
loop from ELICITATION-ENGINE-SPEC.md: `pattern_records` schema, 7-rung
question ladder driven by the Consultative Ask pattern, PII scrubbing at
capture, and the first-session branded framework artifact (on-screen card +
PDF). Scope fence held: no portal, no billing, no jogger, no scoring.

**Non-obvious decisions:**

- **One table = session + record.** `pattern_records` holds the elicitation
  state (qa_pairs, pending_question/rung) AND the 7 fields, mirroring
  `ask_sessions`. Refresh-safe mid-session; no join at artifact render.
- **Completion is enforced three ways, model-trusted zero ways.** The model
  may claim "done", but code checks all 6 required fields
  (`isRecordComplete`), a deterministic fallback question targets the lowest
  missing rung when the model stalls or the 12-question cap is hit, and a DB
  check constraint makes `status='complete'` without rung 4 + rung 6
  impossible even for buggy future code.
- **Scrubbing fails CLOSED.** The scrub call runs before any write; if it
  fails, nothing is stored and the user retries. Never "store now, scrub
  later" -- an unscrubbed answer must never touch the database. Scrub runs
  server-side per answer; `scrub_status` records whether anything was
  actually replaced, and the UI tells the user when it happened (trust
  feature, not fine print).
- **The elicitation model call is never skipped, even past the cap** -- it's
  the only mechanism folding answers into fields. Past the cap, only its
  *question selection* is overridden by the scripted required-rung fallback,
  so sessions converge instead of wandering.
- **Artifact generation is detachable from completion.** If `framePattern`
  or its save fails, the record still completes and `/api/codify/frame`
  retries just the artifact -- 30 minutes of answers are never hostage to
  the cheapest final call. The answer route only reports a framework the DB
  actually persisted (otherwise the PDF route would 409 on an artifact the
  UI is showing).
- **No embeddings for pattern_records in P0.** Deliberate: the Voyage
  rate-cap + silent-fail bug is an open loop; creating embeddable rows now
  would silently produce partial coverage. Pattern records are therefore not
  yet visible to `/ask` -- deferred until the Voyage billing fix.
- **Fixed rung-1 opener, no model call at session start** -- starting must be
  instant and free.

**Needs Brian (customer-facing / brand voice -- not finalized):** the PDF
attribution + footer wording ("A [Name] methodology", "codified with Human
Bloom"), the framework-name style the prompt aims for, and all `/codify` UI
copy. All shipped as placeholders consistent with the co-branded leaning in
MASTER-STATE v2; wording is his call before anything customer-facing ships.

---

## 2026-07-10 -- Fix: Phase 5 dashboard cards invisible because `/dashboard` was orphaned

**Naming:** the prior Cowork session labeled the Credibility-v2 work "Phase 8"
internally. Canonical numbering (and the shipped commit `2a44e54`) is **Phase 5**.
MASTER-STATE now reconciled to Phase 5; DECISION-LOG entries keep their original
titles for history but the work is Phase 5.

**Symptom:** none of the three new cards -- "Your Spiderweb's Value" (Blocks 1+5)
and "Needs your context" (Block 2) -- appeared on the live root page `/`, above or
below anything. No console errors.

**Root cause (the real one, not the three hypotheses in the brief):** it was NOT a
silent fetch failure, NOT a stale build, NOT a missing commit. The commit was on
`origin/main` and deployed; the SQL was run; data was correct. The cards simply live
in `src/app/dashboard/page.tsx` (route `/dashboard`), and **nothing in the entire app
links or redirects to `/dashboard`.** A grep across every `.ts/.tsx` found zero
navigations to it; login redirects to `/` (`login/page.tsx:40`); the root page
(`src/app/page.tsx`) renders only the departments grid + Emerging patterns and never
imported the cards. `/dashboard` was a dead-end URL reachable only by manual typing.
The whole hub (3 Phase 5 cards + resume banner + Phase 7 credibility score + gap
banner + profile verification) was stranded there for the same reason -- the prior
session built `/dashboard` as the intended personal hub (Step 4 below) but never
wired it into navigation.

**Decision -- link the hub, don't inline the cards.** Added a "📊 Your Dashboard"
link on the root page `/` (above Departments) pointing to `/dashboard`. Chosen over
pulling the two cards onto `/` because: (a) it surfaces the *entire* stranded hub in
one move, not just 3 cards; (b) `/` is a server component and the dashboard is a
`'use client'` component with all its fetch/state logic -- inlining would mean a
server/client boundary refactor and duplicated logic for no product gain; (c)
`/dashboard` was always the designed home for this content. Owner (Brian) chose this
approach when presented the fork.

**Not touched (per constraints):** Phase 7 per-user credibility score card/logic;
Block 3 cross-expert benchmarking (deliberately deferred).

**Verification:** `tsc --noEmit` clean (exit 0). Change is a static `next/link` with
no data fetching, so typecheck is sufficient. Deployed to `spiderweb-nine.vercel.app`.

---

## 2026-07-10 -- Phase 8 Credibility v2: per-insight scoring, non-blocking consistency, org-fit, growth

**Context:** The "Phase 5 / 5 Blocks" spec asked for an Expert Credibility Score
system. But a per-USER credibility score (`credibility_scores` / `lib/credibility.ts`)
and a *blocking* consistency check already shipped in the earlier Phase 5 steps (see
below) and Phase 7 added a separate `risk_score`. To avoid conflating three different
"credibility" things, this build adds a distinct per-INSIGHT scoring layer ALONGSIDE
the existing per-user score, and switches consistency from blocking to non-blocking.

**Locked principle honored:** NO recency-decay anywhere. `quality_score` locks at
verification and never recalculates; `corroboration_score` is additive-only.

**What was built, per block:**
- **Block 1 -- Quality + Corroboration scoring (BUILT).** New columns on `insights`:
  `quality_score`, `corroboration_score`, `corroboration_count`, `credibility_badge`,
  `scored_at` (all inherit the single blanket ALL RLS policy -- no fragmentation).
  Engine in `src/lib/insight-score.ts`: quality = source-tier x0.45 + triangulation
  x0.30 + evidence-chain x0.25; combined = quality x0.7 + corroboration x0.3; badge
  thresholds Emerging/Rising/Verified/Elite per spec. Quality locks at approval
  (`scoreInsightAtApproval`, wired into `/api/embed-insights`). Retroactive scoring via
  `backfillScores` + `POST /api/score-insights` (triggered by the dashboard "Refresh").
  Corroboration bumps additively when an insight is surfaced to answer a question
  (`bumpCorroboration`, wired into `/api/ask`). Dashboard shows portfolio combined
  score + status-word badge (no breakdown), per spec.
- **Block 2 -- Non-blocking consistency (BUILT).** `/api/embed-insights` now runs
  `detectContradiction` server-side AFTER approval; a contradiction sets
  `needs_explanation` + `contradiction_note` + `contradicts_insight_id` and does NOT
  block. Flagged insights are excluded from scoring until explained. Belief-revision
  depth gate (`prompts/belief-revision.md` + `scoreBeliefRevision`): an explanation
  only unlocks scoring if it names prior belief + catalyst + current belief + genuine
  reasoning; shallow ones are logged but don't unlock. `POST /api/explain-revision`.
  **DEVIATION (deliberate):** spec said "badge on the insight itself, not a list," but
  `needs_explanation` is set POST-approval and the app has no approved-insight detail
  view. Reconciled by reusing the existing gap-detection card pattern (which the same
  spec block explicitly said to reuse): a dashboard "Needs your context" card lists
  each flagged insight with a small "Needs context" badge + inline explanation box.
- **Block 3 -- Cross-expert benchmarking (NOT BUILT, deliberate).** Requires 5+ experts
  per competency to activate; invite-only means one real account, so it is untestable
  and would render nothing. Held per ship-thin doctrine (same call as Phase 7's admin
  cockpit). No schema, no stubs.
- **Block 4 -- Org-fit matching (BUILT).** Expert behavioral profile inferred from own
  insights (`prompts/behavioral-profile.md` + `inferBehavioralProfile`), cached on
  `profiles.behavioral_profile` (jsonb). Org intake -> plain-English fit summary
  (`prompts/org-fit.md` + `assessOrgFit`), NOT pass/fail. `POST /api/org-fit` is
  unauthenticated (a prospective buyer may have no account) and writes via service role
  to `org_fit_assessments` (RLS on, no user policies -- the expert must never read it).
  Org-facing page at `/org-fit`.
- **Block 5 -- Longitudinal growth (BUILT, dashboard-only).** `growth_snapshots` table
  (one row per user per month, unique). `computeGrowthSnapshot` (`src/lib/growth.ts`)
  composites combined-avg x0.5 + insight-depth x0.25 + case-ratio x0.25. `GET/POST
  /api/growth`. Dashboard "Your Spiderweb's Value" card renders the portfolio number +
  badge and an inline SVG sparkline ("grown X% over N months"). NO external/marketing
  sharing built, per explicit out-of-scope note.

**Constraints honored:** Phase 7 `risk_score` / `credibility_scores` untouched
(additive-only). No Identity/Credential Verification tiers added. `insights` RLS left as
the single blanket ALL policy. Model IDs standardized on `claude-sonnet-5`.

**Status -- LOCAL vs LIVE (do not conflate):**
- **LOCAL:** All code above is written and passes `tsc --noEmit` clean (exit 0). SQL
  migration authored at `supabase/phase8-credibility-v2.sql`.
- **LIVE:** NOTHING is live. Not committed, not pushed, not deployed to
  `spiderweb-nine.vercel.app`. The SQL migration has NOT been run against the live
  Supabase (`ekjhwyeipzmmncfedeqm`) -- so the new columns/tables do not exist in prod
  yet, and the features will error against live until it is run. Next steps (owner):
  run the SQL in the Supabase SQL editor, then commit + deploy.

## 2026-07-08 — Phase 7 risk monitoring: build the engine now, hold the cockpit

**Context:** A cluster of trust/abuse signals (voice mismatch, oversized uploads,
background mismatch) plus an admin risk queue were on the table. Building the admin UI
now would produce a page with exactly one user to look at — untestable against a real
second account.

**Decision:** Ship the schema, scoring logic, and signal-firing (#1/#2/#3/#5) now; HOLD
the admin UI (#4) until a real second user exists. The dismissal feedback loop (#6)
stays unbuilt pending its own sign-off — only its forward hooks (`risk_tolerances`,
`dismissed_at`) land now.

**Options considered:**
- Three independent triggers that each block/flag on their own — rejected: no shared
  memory, no decay, noisy.
- One unified per-user risk score that signals ADD to and that DECAYS when clean — chosen.
- Build the admin page now too — rejected: untestable with one user; ship-thin doctrine.

**Reasoning:**
- **Unified score, not three triggers.** `risk_factors` (jsonb) is the source of truth;
  `risk_score` is a derived cache = sum of decayed, non-dismissed weights. Weights:
  voice +1, huge_upload +2, background_mismatch +3. Linear decay to zero over 30 days,
  so a clean user drifts back to green on their own. Bands surface only, never
  auto-block: `>=3` amber, `>=6` red.
- **Signals never block.** Every check is fail-open — a flaky Claude call or missing
  profile fires nothing and can't sink a successful extraction/approval.
- **Voice mismatch is a recurring per-upload check**, not one-time. A running
  `voice_profiles` fingerprint is built from the user's OWN (self_reported) approved
  insights, rebuilt as that corpus grows (every 5 approvals, min 5 to exist). Each new
  "own" upload is compared against it at extract time.
- **Background mismatch: one sonnet-5 call per upload**, fires +3 ONLY on
  `matches:false` + `confidence:high` — deliberately conservative so a soft signal
  never reads as an accusation.
- **Where it runs:** signals evaluate inside the Inngest extract job (has the text, is
  retryable, off the request path). The voice fingerprint rebuilds on the approve path
  (`/api/embed-insights`), because that's when the approved corpus changes.

**Result:** New `src/lib/risk.ts`, `src/lib/voice.ts`, three `/prompts/*` files, three
Claude wrappers in `claude.ts`; wired into `functions.ts` + `embed-insights`.
`supabase/phase7-risk-monitoring.sql` lands the schema. Typechecks clean.

**Holding #4 in practice:** the full engine runs live and self-tests against my own
account (signals fire, score accrues + decays, data populates `credibility_scores`) —
the admin page to VIEW that data across users is simply not built yet. Nothing is
stubbed; the data is real and ready the day user #2 exists.

**Next:** run the migration in Supabase; let signals accrue on real uploads; build the
admin queue (#4) and the dismissal loop (#6) when a second user makes them testable.

---

## 2026-07-07 — Combined build kickoff (PDF upload + Phase 5 + Phase 6 Slice 2)

### Environment / access findings
- **Committed `supabase/*.sql` files lag the live DB.** pgvector, `insights.embedding`,
  the `connections` table, `match_insights` RPC, and `sources.file_path` /
  `sources.extracted_text` all exist live but were never committed as files. Treat
  the live DB (probed via service role) as ground truth, not the committed SQL.
- **`sources.kind` lives with `default 'text'`** and no longer enforces NOT NULL —
  all 33 existing rows are `'text'` (even screenshots, which the old upload path
  never labelled). New migrations use `if not exists` / `drop … if exists` throughout.
- **DB access model:** the service_role key gives data-plane access (insert/select/
  RPC) — enough to *test* migrations and data. It does **not** grant DDL over the
  HTTP API, and we have no DB password / access token to link the `supabase` CLI.
  So each migration is applied **once by the user in the SQL Editor**, after which
  Claude verifies + tests it via the service role. (The service_role key was first
  pasted wrapped in `< >` placeholder brackets → "Invalid API key"; stripped them.)

### Step 1 — PDF upload
- **No PDF-splitting dependency added.** Claude's native document support reads
  every page of a multi-page PDF in one call; we prompt it to transcribe page-by-page
  with `--- Page N ---` markers, which satisfies the "extract per page, concatenate"
  spec without adding pdf-lib/pdfjs. Verified on a real 2-page PDF (both pages +
  markers returned correctly) using `claude-sonnet-4-6` (the model the extract route
  already used).
- **`/api/extract` now branches** on `.pdf` extension / `kind='pdf'` (document block)
  vs image (vision block, with real media-type detection instead of hardcoded PNG).
  It now returns 500 on download/empty-extraction failures instead of silently
  writing an empty `extracted_text`.
- **Upload page now labels `kind`** properly: `pdf` / `screenshot` / `text` (previously
  every upload fell through to the `'text'` default). Requires the `kind` check
  constraint to allow `'pdf'` — handled in the foundation migration.

### Fix — Large-PDF extraction (100-page PDF produced zero insights)
- **Root cause was a 3-bug chain**, not just a timeout: (1) `/api/extract` transcribed the
  whole PDF in one call at `max_tokens: 8192` → truncated past ~25 pages, run synchronously
  inside the Vercel request; (2) the Inngest insight job used `max_tokens: 2000` → the JSON
  array truncated → `JSON.parse` **threw**, killing the step and saving zero insights
  ("nothing, not even partial"); (3) no `maxDuration` anywhere.
- **Fix — move PDF extraction into the background Inngest pipeline, chunked** (`lib/pdf.ts`
  via pdf-lib): each 10-page range is its own retryable `step.run` (download → split →
  transcribe), then insights run per ~12k-char text segment. `insightsFromText` is
  **partial-tolerant** — a bad segment returns `[]` instead of throwing. `max_tokens` raised
  to 8000; `maxDuration = 300` on the Inngest + extract routes; upload page skips the sync
  `/api/extract` for PDFs (images still use it).
- **Why chunking, not just bigger limits**: keeps each Claude call under the 100-page/32MB
  per-request PDF limit and each step short enough to survive even a 60s (Hobby) function
  cap — robust regardless of Vercel plan.
- **Verified locally** (real Claude): 25-page PDF → 3 chunks; unique markers on pages 1, 15,
  25 all survived concatenation (no truncation/seam loss); garbage input returned `[]` (no
  crash); insights extracted. Vercel/Inngest step orchestration to be confirmed on retest.
- **Known residual**: the waiting-screen "Retry extraction" button re-sends the event and can
  duplicate insights if the first (slow) run later completes — pre-existing, more visible on
  large PDFs; flagged for a follow-up.

### Step 9 — Decision Simulation Mode (no migration)
- **Separate `/simulate` route**, single-shot (not multi-turn): reuses the Ask retrieval
  engine (embed → search → grounded/examples) but synthesizes with a distinct prompt
  (`simulate-decision.md`) that makes the model reason THROUGH the user's heuristics and
  refuse to fill gaps with generic advice.
- **Visible confidence flag in the response text** (`confidence_statement`), plus a
  coverage guardrail: <2 strong matches can never read as "high". Verified on real data —
  a bonus-fairness scenario reasoned via the account's compensation/trust heuristics at
  high confidence; a Kubernetes-migration scenario correctly flagged low ("stretches
  beyond your captured heuristics").
- **Heatmap applied** to the analysis via the same `groundClaims`; case examples surface
  here too.

### Step 8 — Confidence Heatmap (no migration)
- **No per-claim scores exist** in the app — only per-source similarity. Per the spec's
  "no new model calls," `groundClaims` (`lib/ask.ts`) distributes those existing source
  similarities across the answer's sentences by lexical overlap (stopword-filtered),
  normalised to the best-grounded sentence for visible contrast. Zero new API calls.
  Verified: an on-topic sentence scored 1.00 vs 0.00 for an off-topic one on the same
  real sources. Rendered as text colour (grey→near-black) + underline intensity on both
  `/ask` and `/simulate`.

### Step 7 — Expert Credibility Score (no migration — uses foundation `credibility_scores`)
- **Four equal-weighted 0–100 components** → rounded overall (`lib/credibility.ts`):
  source_diversity (distinct trust tiers ÷ 4), high_confidence (approved insights with
  no unresolved contradiction), applied_evidence (principles with ≥1 linked case),
  avg_trust_tier (mean tier weight, casual=1…validated=4, ÷4). Equal weighting is the
  tunable starting point per spec.
- **On-demand recompute** (`POST /api/credibility`, service role) with a cached row read
  by the dashboard; verified on real data → 38/100 (diversity 25, confidence 100,
  applied 0, avg-tier 25 — all sources currently `casual_note`, no linked cases yet).
- Dashboard shows the overall number prominently with a "See breakdown" toggle for the
  four component bars.

### Step 6 — Query-gap detection (no migration — uses foundation `query_gaps`)
- **Logged at answer completion**, in whichever route finishes the answer: `/api/ask`
  (immediate recommend) or `/api/ask/answer` (after follow-ups) — exactly one logging
  point per query. `coverage` gap fires when <3 matches clear 0.7 OR the model itself
  says "not covered"; `case_evidence_missing` fires when strong principles matched but
  no case example surfaced.
- **Deduped** against existing open gaps (`match_open_gaps` at 0.9) so the banner doesn't
  fill with near-identical asks. Gap logging reuses the search embedding when available,
  else re-embeds.
- **Auto-resolve on embed** (`resolveGapsForInsight` in `/api/embed-insights`): a newly
  embedded insight resolves any open gap within 0.75. Verified end-to-end: weak query
  logged a gap → duplicate deduped → a matching insight auto-resolved it.
- **Two low-pressure surfaces**: inline prompt on `/ask` results ("thin on this — add a
  quick insight" / "add a real example"), and a `/dashboard` "Grow your Spiderweb" banner
  of the 3 most recent open gaps. Copy is collection-building, never a to-do nag.

### Step 5 — Case Evidence Layer (no migration — uses foundation columns)
- **Cases are captured approved + embedded immediately** (`/capture` → `/api/capture-case`),
  bypassing `/approve`: the user is deliberately authoring illustrative evidence, not a
  competing heuristic, so the contradiction check doesn't apply. Each case gets its own
  lightweight source row for provenance.
- **Retrieval surfaces a case as a "Real example"** when it either matched the query
  directly OR is explicitly linked (`related_insight_id`) to a matched principle
  (`gatherCaseExamples` in `lib/ask.ts`, called by both `/api/ask` and `/api/ask/answer`).
  Verified end-to-end: a vendor-shortage principle + linked case → query surfaced the
  case with its S/A/O/L and the principle it backs up.
- **Optional explicit link** in the capture form (pick a principle) gives a deterministic
  path; semantic matching is the fallback, per spec.

### Step 4 — Identity & credential verification (`supabase/phase5-verification.sql`)
- **Pasted LinkedIn text is the reliable input, not URL scraping.** LinkedIn blocks
  server-side fetches (auth wall / bot detection), so the primary path is the user
  pasting their profile text; a URL-only submit triggers a best-effort fetch that
  rejects auth-wall responses and otherwise asks for a paste. Flag stays
  `no_linkedin_provided` until real content is compared.
- **Claimed identity = onboarding answers + approved insights**, gathered server-side.
  Verified on the real HR-exec account: a matching CHRO profile → `consistent` (with
  correct extracted title/industry/seniority/years); a junior-dev profile →
  `partial_mismatch`.
- **New hub page `/dashboard`** hosts the verification badge; Steps 6 & 7 will add the
  gap banner and credibility score to the same page. Writes go via the service role
  (profiles stay user-read-only, same lockdown as `plan`).
- **`verification_tier` defaults to 1** — the deliberate extension point for Tier 3
  (third-party ID/degree checks), which is NOT built. Structured `claimed_*` columns
  are populated by the extraction for future benchmarking/org-fit; matching logic is
  deferred per scope.

### Step 3 — Consistency / Integrity check (`supabase/phase5-consistency-check.sql`)
- **Similarity alone can't detect a contradiction** (same-topic insights can agree or
  disagree), so the check is two-stage: pgvector retrieves same-topic approved
  insights (Voyage embed → `search_insights_by_query`, floor 0.55), then Claude judges
  whether the new insight *directly* contradicts one. Prompt is deliberately
  conservative (nuance/sub-cases/complementary advice = consistent). Verified on real
  data: a "keep pay secret" insight was flagged against the account's "transparency
  builds trust" insight; an aligned rephrasing was not.
- **Fails open.** Any embed/search/model error returns `verdict:'consistent'` — a
  transient failure never blocks a user from approving their own insight.
- **Consistent path stays client-side** (unchanged approval update + embed). Only the
  "genuine exception" path routes server-side (`/api/approve-exception`, service role)
  so the justification + `contradiction_events` row aren't user-tamperable.
- **"Unresolved" = approved-as-exception.** A genuine-exception approval logs
  `contradiction_events(resolved=false)` — a standing contradiction the expert
  acknowledged but didn't reconcile. Revising into consistency logs nothing. This is
  the count that will later dampen the credibility score (suppression not built yet).
- **"Revise" edits the insight in place** and re-runs the check; if it's now consistent
  it approves normally, otherwise the user can still declare an exception.

### Step 2 — Schema foundation (`supabase/phase5-6-foundation.sql`)
- **Case evidence is NOT a separate table** (deliberate, per spec): a case is an
  `insights` row with `evidence_type='case'` plus nullable `situation/action/outcome/
  lesson` columns. `content` stays NOT NULL (holds a readable case summary) so every
  existing insight display keeps working.
- **`insights.related_insight_id`** (nullable FK) added so a case can be explicitly
  linked to the principle it illustrates — makes `applied_evidence_ratio` (Step 7) a
  cheap join and the "Real example" callout (Step 5) deterministic, with semantic
  matching as the fallback.
- **`query_gaps.question_embedding vector(1536)`** stored so a newly-approved insight
  can be semantically matched against open gaps to auto-resolve them
  (`match_open_gaps` RPC). Gap rows are written by the service role in backend routes,
  so `query_gaps` / `credibility_scores` get read-only user RLS policies.
- **`credibility_scores` is its own table** (one row per user) rather than columns on
  `profiles`, keeping the score cache separate from identity/plan data.

### July 11, 2026 â€” Marketing homepage built as 6 phased commits off the Floema research

**Context:** Human Bloom had no marketing homepage â€” just the app dashboard. We had two verified research docs (floema.com mechanics + a phased application plan) and a locked motion-heavy dark/tech design standard. Needed a from-scratch homepage that borrows Floema's *mechanics* without its cream/serif/eco *brand*.

**Decision:** Built the homepage in 6 reviewable, separately-committed phases: (1) fluid clamp() grid + GSAP/ScrollTrigger/SplitText setup, (2) hero SplitText reveal + brief scroll-pin + particle web concentrated on the headline, (3) goo/metaball nav pill hover, (4) departments showcase with per-department accents + hover chips + locked states, (5) horizontal pinned-scroll pricing scrub, (6) type/color pass.

**Reasoning:** Ship-thin, gate-by-gate. One phase per commit so each is independently reviewable and revertable, rather than one giant unreviewable drop.

**Result:** All 6 phases shipped and DOM-verified. Commits d5acc5e (P1) â†’ 49aa4dd (P6).

### July 11, 2026 â€” Reused the existing native-sticky scroll mechanic for the pricing scrub instead of GSAP ScrollTrigger

**Context:** The plan literally specified "ScrollTrigger horizontal scrub" for the pricing tiers. But the whole page scrolls inside a fixed `.hb-root` element (the window never scrolls), and the existing `#how` narrative already achieves pinned-scroll via native `position: sticky` + the one rAF scroll handler.

**Options considered:** (a) GSAP ScrollTrigger pin + horizontal scrub with `scroller: .hb-root`; (b) mirror the proven native-sticky mechanic and translate the track on X from scroll progress.

**Decision:** Chose (b) â€” native sticky + scroll-driven `translateX`, extending the existing scroll handler.

**Reasoning:** A ScrollTrigger pin-spacer inside the custom scroller risked colliding with the existing sticky/scroll math for `#how`. The native mechanic was already proven to work in this exact scroller, is house-consistent, and lower-risk. Borrowing the *mechanic* (horizontal pinned scrub), not the specific library, satisfies the plan's intent.

**Result:** Verified the scrub math â€” at scroll progress 1 the track translates âˆ’1083px and the last tier lands flush at the viewport edge. Swappable to literal GSAP later if desired.

### July 11, 2026 â€” Swapped headline face from Fraunces (serif) to Space Grotesk

**Context:** The homepage had been built through Phase 5 using Fraunces, a *serif* â€” directly conflicting with the locked "no serif type" rule. Phase 6 (type pass) forced the reckoning.

**Options considered:** Space Grotesk (geometric display sans), Bricolage Grotesque (expressive grotesque), or keep Fraunces and override the no-serif rule. Surfaced as an explicit choice to Brian rather than decided unilaterally.

**Decision:** Space Grotesk for all display headings; Inter stays for UI. One display face + one UI face.

**Reasoning:** Honors the no-serif rule and reads tech-forward for an AI product. A typeface change reshapes the whole visual identity â€” that's a brand call for Brian, not a default to assume.

**Result:** Every heading now Space Grotesk with tight negative tracking (hero âˆ’0.035em). Also kept `--muted` for secondary body copy â€” a reasoned deviation from Floema's "single ink only," since this page is content-dense and full-ink body text would cost readability without adding hierarchy.

### July 11, 2026 â€” Flagged leftover 640px body style in layout.tsx (out of scope, spun off)

**Context:** Browser console showed a hydration mismatch on every load, traced to leftover Next.js starter inline styles on `<body>` in layout.tsx (max-width 640px, system-ui, padding) â€” which also constrains the dashboard/login pages to a narrow column.

**Decision:** Did not fix mid-phase; spun it off as a separate background task to avoid changing app-wide layout during the homepage build.

**Reasoning:** Ship-thin â€” keep the homepage phases clean; app-wide layout changes need their own verification against the dashboard/login pages.

### July 22, 2026 — P-0 hardening: framework first-render flake root-caused and fixed (10/10 done test)

**Context:** After a /codify session completed, the framework card sometimes failed on the first render and needed the /api/codify/frame retry path. P-0 could not close with the first-session "aha" moment flaking.

**Decision:** Fix the render pipeline in `src/lib/claude.ts` itself rather than papering over it in the UI: (1) raise `framePattern` max_tokens 1536 → 3072, (2) add `parseJsonLoose` — balanced-brace JSON extraction that survives model preambles/trailing notes, (3) add `withRetries` — 3 attempts, exponential backoff + jitter, applied to `framePattern`, `elicitNext`, and `scrubPII`. All existing null-contract fallbacks (deterministic ladder, fail-closed scrub, /frame retry route) stay as last-resort nets.

**Options considered:** Client-side auto-retry of /api/codify/frame (hides the flake, doubles latency on every flake); polling the DB for the framework row (wrong diagnosis — there is no save/fetch race: the answer route generates and saves the framework server-side before responding, and only reports what the DB holds).

**Reasoning:** Evidence, not guesswork. The done-test harness ran the OLD pipeline alongside the NEW one on the same 10 records: the OLD path failed record #9 with `stop_reason=max_tokens` at exactly 1536 output tokens — a truncated, unparseable JSON body. Root cause: rich 6-field records legitimately need >1536 tokens of framework JSON, and strict `parseJson` also rejected any preamble-wrapped output. Both were single-shot with no retry, so any transient miss surfaced to the user.

**Result:** Done test PASSED — `scripts/codify-smoke.mjs` against the live Anthropic API: **NEW path 10/10 first-try renders, zero retries; OLD path 9/10** (reproduced the flake). Deterministic parser proof: preamble-wrapped JSON fails old strict parse, passes new loose parse. Also confirmed the P0 migration IS applied on the LIVE Supabase instance (`ekjhwyeipzmmncfedeqm`): all 22 `pattern_records` columns select cleanly over REST, and Brian's real completed record (with saved framework) is in the table. `tsc --noEmit` clean. Local and live hit the same hosted Supabase; the Claude calls in the test were live.

**Next:** P-0.5 (methodology router, entity map) — next session.

### July 22, 2026 (evening) — P-0.5: Methodology Router + Entity Map

#### What was built

**Build 1 — Methodology Router.** `/codify` now opens with "What are we capturing?" (5 buttons: 💥 broke · 🏆 win · ⚠️ concern · 🔁 friction · 🧠 judgment). Picking one shows a suggested method + one-line why; the expert can accept it or swap to any of the other 4 (offer + suggest, never force). Rungs 1–3 of the ladder stay universal across methods; rungs 4 (signal), 5 (reasoning), and 7 (boundaries — see renumber below) swap question character per method. Persona (exec / technical director / sr. manager, read off the expert's profile) shades wording only, never routing logic.

**Build 2 — Entity Map.** New Pattern Record field #8: a polymorphic array of `{type, name, detail}` where type is one of `equipment_asset | process | error_class | role_person | department`. Elicited via one new adaptive rung (rung 6) inserted between reasoning and boundaries. Win-type sessions are instructed to specifically ask for the people who made it work.

**Build 3 — Session guardrails + instrumentation.** Client-side 20-minute timer (soft warning at 15, a non-blocking "pause and resume" offer at 20 — progress is already saved after every answer, so "pause" just means stop asking and come back). `/api/codify` GET checks for an existing active session and the UI offers to resume it, landing back at the exact pending question/rung. `session_start` and `framework_rendered_at` are stamped on every record; `time_to_first_value_seconds` is computed and stored the first time a framework successfully renders. No dashboard yet — just capture, per spec.

#### Rung renumbering (read this before touching the ladder again)

The original P0 ladder was 1 Situate · 2 Classify · 3 Call · 4 Signal · 5 Reasoning · 6 Boundaries · 7 Generalize. P-0.5 inserts the Entity Map between reasoning and boundaries, so the ladder is now:

1 Situate · 2 Classify · 3 Call · 4 Signal · 5 Reasoning · **6 Entities (new)** · 7 Boundaries · 8 Generalize.

`rungsReached()`, `fallbackQuestion()`, `RUNG_LABELS`, and every method's fallback-question set in `lib/elicitation.ts` all use this numbering. The `elicit-next.md` prompt and the 5 `method-*.md` fragments were written against this numbering too.

#### PII decision — capture-time scrubbing is now OFF (deliberate)

**Before (P0):** every answer was run through `scrubPII` before storage — client/individual names stripped unconditionally, "roles not names" was the UI's standing instruction.

**Now (P-0.5):** capture-time scrubbing is removed from `/api/codify/answer` entirely. Names an expert gives — especially in the entity map — are stored as given, under the existing per-user RLS on `pattern_records`. `scrubPII` (the old prompt/function) is left in the codebase but is no longer called from the answer route.

**Why:** the whole system pivoted (Track B) from "consultant capturing external client engagements" to "enterprise capturing its own internal operating judgment." In that context, "roles not names" was actively working against two required features: the entity map's mandate to capture who-did-what (for pairing in P-4 and for Win Column in P-4.5), and the Success Case Method's requirement that a win record name the people who drove it. Scrubbing before storage would have silently deleted that data before the model ever saw it as capturable.

**What replaces it:** a new export-time-only scrubber, `scrubForExport` (prompt: `prompts/scrub-for-export.md`), runs in `/api/codify/pdf` right before the PDF is rendered — it takes the JSON-serialized framework artifact, rewrites any identifying names/companies to generic descriptors, and the PDF renders from the scrubbed copy. The framework as stored in the DB keeps full fidelity; only the artifact leaving the org gets scrubbed, and only at the moment it leaves. This is a fail-open safety net (framePattern's own prompt already instructs it not to name people/clients in the framework it generates) — if the export scrub call itself fails, the route logs a warning and exports the framework as stored rather than blocking the download.

**Verified live:** ran a synthetic framework object containing "Dana Ruiz" through `scrubForExport` against the real Claude API — came back `changed: true` with every instance replaced by "a team member," full JSON structure intact.

**Risk flagged for whoever revisits this:** anything captured in `context_summary`, `judgment`, `rationale`, etc. (not just the entity map) can now also contain a name, since nothing scrubs those fields at capture anymore either. If an expert names an *external* customer or vendor by accident in one of those fields, it will sit in the DB unscrubbed until/unless that record is exported. This was an accepted tradeoff to make the entity map + Win Column features possible, but it's worth a second look before this goes anywhere multi-tenant (P-1) — right now `pattern_records` RLS scopes rows to `user_id`, not yet to an org, so P-1's org-scoped RLS needs to land before multiple people at the same company can see each other's captured names, which is also when the "kept internally" half of this decision actually starts being true in practice.

#### Schema changes

`supabase/p0.5-methodology-entity-guardrails.sql` (one paste block, not yet applied — see below):
- `pattern_records.trigger_type` (checked enum, nullable)
- `pattern_records.method` (checked enum, nullable)
- `pattern_records.entity_map` (jsonb, default `[]`, not null)
- `pattern_records.session_start`, `.framework_rendered_at`, `.time_to_first_value_seconds`
- `profiles.persona` (checked enum, nullable — exec / technical_director / sr_manager)
- `scrub_status` check constraint extended with a new value `not_scrubbed_by_design`, and it's now the column default
- `pattern_record_complete_check` extended: a record can't be marked complete without `entity_map` having at least one entry, and without `trigger_type`/`method` both set

**Not applied yet.** This Cowork session had the app's anon key and service-role key (from `.env.local`) but no direct Postgres connection string / Supabase Management API token, so it has no way to run DDL against the live database — same as every prior migration in this repo, it needs to be pasted into the Supabase SQL editor by hand. Once it's applied, this migration is enforced everywhere it's supposed to be (the completion gate, the profiles check).

#### Template design decisions

- **One shared `elicit-next.md` prompt, parameterized** — rather than 5 separate full ladder prompts. Each method's rung-4/5/6/7 character lives in its own small fragment file (`prompts/method-*.md`) that gets loaded and substituted into `elicit-next.md`'s `{{method_guidance}}` slot; persona wording is the same pattern (`prompts/persona-*.md` → `{{persona_guidance}}`). Reasoning: keeps the ladder's core logic (completion gate, JSON contract, ontology) in one diffable place instead of five drifting copies, while still giving each method genuinely distinct question character — verified live, the 5 Whys session actually asked a why-chain and offered Fishbone framing language, the AAR session asked for names, the pre-mortem session used prospective-hindsight framing, etc.
- **Method swap is a client-side state change, not a re-POST.** The suggested-method screen lets the expert click through the other 4 methods before starting; nothing hits the server until "Use this method," so swapping costs nothing.
- **Resume is intentionally shallow.** On resume, the UI shows a one-line "Resumed — picking up at rung X" note plus the pending question, not a full replay of the prior transcript. Per Brian's standing instruction (show the current step, not the whole roadmap) and because the DB row already has everything needed to continue — replaying history would be extra UI complexity for no functional gain.

#### What was tested, and how (local vs. live — say this every time)

**Live** (real Claude API, real prompts, no mocking of the model): ran all 5 trigger types end-to-end through the actual `elicitNext`/`framePattern`/`scrubForExport` functions in `lib/claude.ts`, unmodified, via a standalone Node/tsx harness (this sandbox's desktop bridge dropped and its own npm registry access is blocked, so a real `npm run dev` browser click-through wasn't possible from here — see below). Every session completed with all 8 fields; the win-type session (AAR + Success Case) captured a named person (per the mandatory rule); the judgment-call session (CDM) captured two named entities unprompted; the export scrubber correctly stripped a synthetic name from a JSON framework. Save-and-resume was proven by snapshotting mid-session state (fields + qa_pairs + pending question/rung — exactly what the DB row stores) and continuing from that snapshot to full completion.

**Not yet live-tested:** the actual HTTP routes (`/api/codify*`) against a running Next.js server, real Supabase reads/writes with RLS, the real browser UI (timer, resume banner, method-swap screen), or `npm run build`/`tsc --noEmit` against the full app. All of `lib/elicitation.ts` and `lib/claude.ts` do pass a strict standalone `tsc --noEmit` with zero errors, and `codify/page.tsx` parses and its module top-level evaluates cleanly against the real `lib/elicitation.ts` exports it imports — but that's not the same as a full app build or a browser click-through, and it should not be treated as one.

**Two things need to happen, in this order, before P-0.5 can be marked fully done:** (1) paste the SQL migration into Supabase, (2) reconnect the desktop bridge so the files land in the repo and someone (Brian, or a follow-up Cowork session) runs `npm run build` + the actual 5-trigger click-through in a browser + `git commit`.

