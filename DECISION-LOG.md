# DECISION-LOG

Running log of non-obvious build decisions. Newest first.

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
