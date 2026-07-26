-- P-8 Phase 1 — THE LEARNING LEDGER (`learning_signals`). WRITERS ONLY.
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires orgs, profiles, current_org_id()).
-- Safe to re-run (idempotent): "if not exists" / drop+recreate for named
-- constraints and policies throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every CREATE above it that looked like it succeeded. Paste it all,
-- run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS — THE DOCTRINE THIS SERVES
--
--   "Every data point that is entered, created, received, or has logic applied
--    should feed the web. Every data point should be teaching and learning, so
--    the system makes better suggestions and the application gets more
--    intuitive."
--
-- Today the engine learns from what happened ON THE FLOOR (recurrence, via the
-- efficacy loop) but NOT from what its USERS JUDGED about its own output —
-- format overrides, expert fidelity rejections, regenerate notes, snoozes,
-- coaching dismissals, teach-back scores, outcome check-ins, and which
-- retrieval result actually helped. Human judgment about the system's own
-- output is the highest-quality training data available in the product, and
-- before this migration every bit of it dead-ended in a column nothing reads.
--
-- ⚠️ PHASE 1 IS WRITERS ONLY. There are NO readers. Nothing computes a prior,
-- reranks anything, or changes a single recommendation. That is deliberate and
-- decided (do not relitigate):
--   • CAPTURE IS TIME-SENSITIVE. You can never retroactively log a judgment
--     you did not record. Every pilot signal is lost forever if the writer
--     isn't there when the click happens.
--   • LEARNING IS NOT TIME-SENSITIVE. A reader can be built at any time over
--     accumulated history. With 29 records in one demo org, a prior computed
--     from three attempts would be confidently wrong — the worst possible
--     outcome for an "explainable, not black box" product.
-- Writers now; readers when pilot data exists.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Covers:
--   1. learning_signals — the append-only ledger. Org-scoped RLS READ,
--      service-role write only behind API routes: the same lockdown doctrine
--      as prescription_detections / prescriptions / training_format_outcomes.
--   2. consumed_by — ⭐ WHICH READERS HAVE USED EACH SIGNAL. This is the point
--      of the table, not a nicety: it makes the doctrine TESTABLE. Without it,
--      "everything feeds the web" is a claim nobody can check. The audit query
--      ships with this migration (§5) and after Phase 1 it correctly returns
--      EVERY signal as unconsumed, because there are no readers yet.
--   3. Indexes sized for the reader patterns Phase 2 will actually use, plus
--      the partial index that makes the unread audit cheap.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- GUARDRAILS LOCKED HERE, BEFORE ANY READER EXISTS
--
--   1. ⭐ PERSON-KEYED PRIORS ARE FORBIDDEN AT THE READER LAYER.
--      This table records WHO judged (actor_id / actor_role) because an
--      un-attributed judgment cannot be audited or retracted. But a learning
--      system handed actor_id WILL find correlations between individuals and
--      failed training, and surfacing that would be a blameless-doctrine
--      breach on the scale of putting failure records in the Win Column.
--      THE LEDGER MAY RECORD ACTORS; READERS MAY NEVER KEY A PRIOR ON ONE.
--      `features` — the ONLY column a reader is allowed to generalize over —
--      must never contain a person. src/lib/learning-ledger.ts enforces that
--      at the write layer (scrubFeatures() strips person-ish keys and warns),
--      the same way aggregateWinColumn() enforces wins-only in code rather
--      than by convention.
--   2. MINIMUM-N GATE, N ALWAYS SHOWN. No prior may influence a recommendation
--      without displaying its sample size. Enforced when readers arrive;
--      documented now so it is not a later negotiation.
--   3. EXPLAINABILITY SURVIVES LEARNING. A prior-influenced output must say
--      "partly because this worked here before (N=…)". Explainable-not-black-
--      box is this product's strongest differentiator and it breaks the moment
--      the system starts learning silently.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. LEARNING_SIGNALS — the append-only ledger ═══════════════════════════

create table if not exists learning_signals (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id),

  -- ─── Scope ───
  -- 'org' today, always. 'global' is RESERVED so that cross-org learning never
  -- needs a migration against live pilot data — but cross-org learning is OUT
  -- OF SCOPE as a product decision: it is a data-rights / contract question
  -- that sits with the IP-clarity loop, not an engineering one. Nothing in
  -- this build writes 'global'.
  scope             text not null default 'org'
                    check (scope in ('org', 'global')),

  -- ─── Provenance: which surface produced the judgment ───
  source_surface    text not null
                    check (source_surface in (
                      'codify', 'retrieve', 'conflict', 'prescription',
                      'training_studio', 'coaching', 'win_column'
                    )),

  -- ─── What kind of judgment this is ───
  -- Closed vocabulary, mirrored in src/lib/learning-ledger.ts
  -- (LEARNING_SIGNAL_TYPES). Adding a signal = one entry there + one line
  -- here. Kept as a check constraint rather than an enum type so adding one
  -- stays a single idempotent ALTER.
  signal_type       text not null
                    check (signal_type in (
                      'format_choice',            -- 1. chosen format (+ whether it overrode the agent)
                      'expert_fidelity',          -- 2. "that's how I think" / "not quite"
                      'training_regenerate',      -- 3. a leader rejected a design, with the reason
                      'prescription_snooze',      -- 4a. "not worth acting on right now"
                      'coaching_dismiss',         -- 4b. manager dismissed an early signal
                      'coaching_acknowledge',     -- 4c. manager took the early signal seriously
                      'teachback_score',          -- 5. score + WHAT WAS MISSED
                      'outcome_checkin',          -- 6. 6-month holding / no longer holding
                      'retrieval_result_used',    -- 7. explicit "this helped"
                      'retrieval_result_opened',  -- 7. implicit: which result was opened
                      'efficacy_outcome'          -- detected-path effective / did_not_land
                    )),

  -- ─── What the judgment is ABOUT ───
  -- subject_id is TEXT, not uuid, on purpose: most subjects are row-backed
  -- (a pattern_record id, a prescription id, a training id) but some are
  -- stable keys rather than rows — a format_key like 'hands_on_drill' is the
  -- thing being judged in signal 1, and coercing it into a uuid column would
  -- mean inventing a synthetic row for every format.
  subject_type      text not null
                    check (subject_type in (
                      'pattern_record', 'prescription', 'training',
                      'format', 'retrieval_query', 'person_signal'
                    )),
  subject_id        text not null,

  verdict           text not null
                    check (verdict in ('positive', 'negative', 'neutral')),

  -- ─── ⭐ features: THE GENERALIZABLE CONTEXT READERS WILL KEY ON ───
  -- issue_type · audience_role / audience_team / audience_experience ·
  -- format_key · rung · method · source_type · similarity — the dimensions a
  -- prior can honestly generalize over.
  --
  -- ⚠️ NEVER A PERSON. Not a user_id, not a display name, not an email, not a
  -- manager. See GUARDRAIL 1 in this file's header. Enforced in code by
  -- scrubFeatures() in src/lib/learning-ledger.ts; this comment is the
  -- contract, that function is the lock.
  features          jsonb not null default '{}',

  -- ─── payload: the raw thing being judged ───
  -- The regenerate note, the fidelity note, the missed teach-back items, the
  -- retrieval query text, the snooze duration. Readers are expected to key on
  -- `features`; `payload` is the human-auditable evidence behind the row and
  -- may legitimately contain free text a person wrote.
  payload           jsonb not null default '{}',

  -- ─── WHO judged ───
  -- Recorded so a judgment is auditable and retractable. See GUARDRAIL 1: a
  -- reader may NEVER key a prior on this.
  actor_id          uuid references profiles(id),
  -- The SEMANTIC role the actor held in this judgment ('expert', 'manager',
  -- 'leader', 'learner', 'member', 'system'), not their profiles.role label.
  -- An expert rejecting fidelity and a manager snoozing a queue item are
  -- different KINDS of evidence even when the same human does both.
  actor_role        text,

  -- ─── ⭐ consumed_by — WHICH READERS HAVE USED THIS SIGNAL ───
  -- Empty array = nothing has learned from this row yet. A Phase-2 reader
  -- appends its own stable name (e.g. 'format_prior_v1') as it consumes a
  -- signal, which makes two questions answerable that are otherwise pure
  -- assertion:
  --     • which signals is the system actually learning from?
  --     • which signals are we capturing that nothing reads? (§5 audit)
  -- Expected answer after Phase 1: ALL of them are unconsumed. That is the
  -- CORRECT result — there are no readers — and it is stated plainly in the
  -- write-up rather than hidden.
  consumed_by       text[] not null default '{}',

  -- ─── Idempotency for the BACKFILL only ───
  -- Live writers leave this NULL: the ledger is append-only and two genuine
  -- judgments must never collide. scripts/backfill-learning-signals.mjs sets a
  -- deterministic key derived from
  -- (subject_type, subject_id, signal_type, occurred_at) so re-running it
  -- upserts instead of doubling history.
  --
  -- ⚠️ A PLAIN unique index, deliberately NOT a partial one: PostgREST cannot
  -- infer an ON CONFLICT target from a PARTIAL unique index, and every upsert
  -- against one fails silently behind a console.warn (this cost a deploy cycle
  -- on P-7's training_format_outcomes). A plain unique index is safe here
  -- because Postgres treats NULLs as DISTINCT in a unique index, so the
  -- null-keyed live rows never collide with each other.
  dedupe_key        text,

  -- When the JUDGMENT happened (may be backdated by the backfill), vs. when
  -- the row was written. Readers must window on occurred_at.
  occurred_at       timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  written_by        text not null default 'learning-ledger-v1'
);

-- ═══ 2. INDEXES ════════════════════════════════════════════════════════════

-- The Phase-2 reader pattern: "every signal of this type in this org, newest
-- first."
create index if not exists learning_signals_type_idx
  on learning_signals (org_id, signal_type, occurred_at desc);

-- "What has been judged about THIS thing?" — the explainability path: given a
-- format / framework / prescription, show the judgments behind any prior.
create index if not exists learning_signals_subject_idx
  on learning_signals (subject_type, subject_id, occurred_at desc);

-- GIN on features: a prior keys on feature dimensions
-- (issue_type × audience × format), so containment queries must be indexed.
create index if not exists learning_signals_features_idx
  on learning_signals using gin (features);

-- ⭐ The audit index. Makes "which signals has nothing consumed?" cheap
-- forever, including once most rows HAVE been consumed and the unread set is
-- the small tail.
create index if not exists learning_signals_unconsumed_idx
  on learning_signals (org_id, signal_type, occurred_at desc)
  where consumed_by = '{}';

-- Backfill idempotency. Plain (not partial) — see dedupe_key's comment above.
create unique index if not exists learning_signals_dedupe_idx
  on learning_signals (org_id, dedupe_key);

-- ═══ 3. ROW LEVEL SECURITY ═════════════════════════════════════════════════
-- Org members READ. "Explainable, not black box" means the evidence behind any
-- future prior has to be inspectable by the org whose judgments produced it.
-- Every WRITE is service-role only, behind an API route that has already
-- proven membership with the SESSION client — the same lockdown doctrine as
-- prescription_detections / prescriptions / training_format_outcomes.
--
-- ⚠️⚠️ NOTE ON TWO SIGNAL TYPES — THE ONE PLACE THIS TABLE'S ORG-WIDE READ
-- POLICY COULD HAVE WIDENED A NARROWER BOUNDARY, AND HOW IT DOESN'T:
--
-- 'coaching_dismiss' / 'coaching_acknowledge' originate on the manager-only
-- Coaching Watch, whose own RLS is deliberately narrower than org-wide
-- (is_manager_of(person_id)) because it is the ONE surface in this product
-- where a person-level NEGATIVE signal is allowed to exist. An org-wide
-- readable ledger row about that surface must therefore be constructed so
-- there is nothing person-identifying in it to leak:
--
--   • NO person_id — not in features (forbidden outright) and not in payload.
--   • NO summary text. retraining_signals.summary is blameless in REGISTER
--     ("N records this period involve X in a concern or friction context")
--     but it CONTAINS THE PERSON'S DISPLAY NAME. Copying it here would have
--     published a manager-only signal to every org member. It is not copied.
--   • NO actor_id. The dismissing manager is left NULL on these two signal
--     types only. actor_role='manager' is kept because the KIND of judgment
--     matters to a reader; the identity does not, and "manager M dismissed a
--     report's early signal" is exactly the inference P-6 exists to prevent.
--   • subject_id is the retraining_signals row id, which is opaque to an org
--     peer: that table's own RLS means a peer cannot resolve the uuid to a
--     person.
--
-- What an org peer can therefore learn from these rows is aggregate and
-- non-identifying: that somewhere in the org, early signals get dismissed at
-- some rate. That is the intended limit.

alter table learning_signals enable row level security;

drop policy if exists "org learning signals read" on learning_signals;
create policy "org learning signals read" on learning_signals
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- No insert/update/delete policies on purpose.

-- ═══ 4. SANITY CHECK (read-only — safe to run any time) ════════════════════
-- What landed, by signal type and surface.
--
-- select signal_type, source_surface, verdict, count(*)
-- from learning_signals
-- group by 1, 2, 3
-- order by 1, 2, 3;

-- ═══ 5. ⭐ THE AUDIT QUERY — "which signals does nothing read?" ════════════
-- This is the query that makes the doctrine testable. Ship it, run it, and
-- report what it says — including when the answer is "nothing reads any of
-- this," which is the correct and expected answer at the end of Phase 1.
--
-- Also lives at scripts/audit-learning-signals.sql.
--
-- select
--   signal_type,
--   source_surface,
--   count(*)                                          as signals,
--   count(*) filter (where consumed_by = '{}')        as unconsumed,
--   round(
--     100.0 * count(*) filter (where consumed_by = '{}') / count(*), 1
--   )                                                 as pct_unconsumed,
--   min(occurred_at)                                  as first_seen,
--   max(occurred_at)                                  as last_seen
-- from learning_signals
-- group by 1, 2
-- order by unconsumed desc, signals desc;
