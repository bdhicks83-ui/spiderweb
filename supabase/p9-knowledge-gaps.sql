-- P-9 — KNOWLEDGE GAPS: the demand side of the flywheel.
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires orgs, profiles, pattern_records, training_requests,
-- learning_signals, current_org_id(), pgvector).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" /
-- drop+recreate for named constraints and policies throughout.
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
-- WHY THIS EXISTS
--
-- Until now, a /retrieve query that cleared nothing above the 0.75 cosine
-- threshold returned an honest empty state — and the moment was lost. That
-- moment is the single most precise demand signal the product can generate:
-- somebody with a live problem went to the team's brain, and the team's brain
-- had nothing. It is not a failure of retrieval. It is a discovered gap in the
-- org's codified expertise, timestamped and phrased in the asker's own words.
--
-- This migration makes that moment durable, shared, fillable, and countable.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Covers:
--   1. knowledge_gaps        — one row per distinct unanswered question, org-
--                              scoped, with an asked_count so the most-demanded
--                              gaps rise instead of the queue filling with
--                              near-duplicates.
--   2. knowledge_gap_askers  — WHO asked it. Multiple askers per gap (the
--                              "asked N times" case). This is what closes the
--                              loop back to the original asker when it is
--                              filled, and it is the ONLY table here whose read
--                              boundary is narrower than the org.
--   3. find_similar_knowledge_gap() — the semantic de-dupe (SECURITY DEFINER,
--                              service-role only).
--   4. learning_signals      — two new signal_type values so the gap and its
--                              fill land in the P-8 ledger.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE TWO READ BOUNDARIES, DELIBERATELY DIFFERENT
--
--   • knowledge_gaps       → ORG-WIDE READ. The queue is a shared surface by
--                            design: anyone in the org can see what the org
--                            cannot answer, and anyone can pick one up. There
--                            is NO routing or assignment in v1 — that is a
--                            decision, not an omission.
--
--   • knowledge_gap_askers → OWN ROWS ONLY. "My Questions" is personal. A peer
--                            must not be able to enumerate who kept asking
--                            about a thing nobody could answer — that is one
--                            inference away from a person-level negative
--                            signal, which in this product is a manager-only
--                            surface (P-6) and never a peer-visible one.
--                            The org-wide gap row therefore carries a COUNT and
--                            never a name.
--
-- ⚠️ THE P-8 LESSON APPLIED (an org-wide table can silently widen a narrower
-- one): knowledge_gaps.asked_count is an integer. No asker id, no display name,
-- no "asked by" text ever lands on the org-readable row.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

-- ═══ 1. KNOWLEDGE_GAPS ═════════════════════════════════════════════════════

create table if not exists knowledge_gaps (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id),

  -- The question EXACTLY as the person typed it. Preserved verbatim: the
  -- phrasing is the evidence, and a cleaned-up restatement would quietly
  -- launder the demand signal.
  question_text       text not null,

  -- Lowercased / punctuation-stripped / whitespace-collapsed. The cheap,
  -- deterministic half of the de-dupe. See normalizeGapQuestion() in
  -- src/lib/knowledge-gaps.ts — change one, change both.
  question_norm       text not null,

  -- The semantic half of the de-dupe. voyage-large-2, 1536 dims, embedded as a
  -- 'query' (the same input_type /api/retrieve uses — a gap IS a query).
  question_embedding  vector(1536),

  -- open      → nobody has picked it up
  -- answering → somebody claimed it and is capturing the framework now
  -- resolved  → a codified framework now covers it
  status              text not null default 'open'
                      check (status in ('open', 'answering', 'resolved')),

  -- ⭐ DEMAND. Incremented when the same (or semantically near-identical)
  -- question hits the gap state again. An integer, never a list of people.
  asked_count         integer not null default 1,

  first_asked_at      timestamptz not null default now(),
  last_asked_at       timestamptz not null default now(),

  -- The best near-miss similarity at the moment the gap opened. Kept so the
  -- 0.75 threshold stays re-tunable against real gap data rather than a guess.
  top_similarity      numeric,

  -- ─── The claim (Part 2 — "answer it now") ───
  claimed_by          uuid references profiles(id),
  claimed_at          timestamptz,
  -- The codify session opened to fill this, when it is known. Nullable on
  -- purpose: the claim happens BEFORE the record exists, and the reconciler in
  -- src/lib/knowledge-gaps.ts links them afterwards.
  claimed_record_id   uuid references pattern_records(id) on delete set null,

  -- ─── The fill ───
  resolved_record_id            uuid references pattern_records(id) on delete set null,
  resolved_training_request_id  uuid references training_requests(id) on delete set null,
  resolved_by                   uuid references profiles(id),
  resolved_at                   timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ⚠️ A PLAIN unique index, deliberately NOT a partial one. PostgREST cannot
-- infer an ON CONFLICT target from a PARTIAL unique index and every upsert
-- against one fails silently behind a console.warn (this cost a deploy cycle on
-- P-7's training_format_outcomes and is re-stated in P-8). Nothing here upserts
-- against it today — the write path is read-then-insert — but the index is the
-- race backstop, and if a future writer ever does upsert, it can.
create unique index if not exists knowledge_gaps_norm_idx
  on knowledge_gaps (org_id, question_norm);

-- The queue read: "open gaps in my org, most-demanded first."
create index if not exists knowledge_gaps_queue_idx
  on knowledge_gaps (org_id, status, asked_count desc, last_asked_at desc);

-- ANN index over the gap questions, best-effort (hnsw → ivfflat → none), each
-- guarded so an older pgvector cannot roll back the whole migration. At pilot
-- scale exact KNN over a handful of open gaps is correct and fast regardless.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'knowledge_gaps_embedding_idx'
  ) then
    begin
      execute 'create index knowledge_gaps_embedding_idx on knowledge_gaps '
           || 'using hnsw (question_embedding vector_cosine_ops)';
      raise notice 'P-9: created hnsw index on knowledge_gaps.question_embedding';
    exception when others then
      begin
        execute 'create index knowledge_gaps_embedding_idx on knowledge_gaps '
             || 'using ivfflat (question_embedding vector_cosine_ops) with (lists = 100)';
        raise notice 'P-9: hnsw unavailable, created ivfflat index instead';
      exception when others then
        raise notice 'P-9: no ANN index created (pgvector too old) — exact KNN is fine at this scale';
      end;
    end;
  end if;
end $$;

-- ═══ 2. KNOWLEDGE_GAP_ASKERS ═══════════════════════════════════════════════
-- One row per (gap, person). This is Part 4: the loop closed for the ORIGINAL
-- ASKER. Without it, a filled gap is a black hole to the person who hit it.

create table if not exists knowledge_gap_askers (
  id              uuid primary key default gen_random_uuid(),
  gap_id          uuid not null references knowledge_gaps(id) on delete cascade,
  org_id          uuid not null references orgs(id),
  user_id         uuid not null references profiles(id),

  asked_count     integer not null default 1,
  first_asked_at  timestamptz not null default now(),
  last_asked_at   timestamptz not null default now(),

  -- Stamped when the gap this person asked about was resolved. Non-null +
  -- seen_at null = an unread "your question was answered" notification.
  notified_at     timestamptz,
  -- Stamped when the person opened it. Clears the badge.
  seen_at         timestamptz,

  created_at      timestamptz not null default now()
);

-- Plain unique index (see the note on knowledge_gaps_norm_idx). The asker write
-- DOES upsert against this one, so partial would have been the silent-failure
-- trap in its purest form.
create unique index if not exists knowledge_gap_askers_unique_idx
  on knowledge_gap_askers (gap_id, user_id);

-- The badge query: "my unread answered questions."
create index if not exists knowledge_gap_askers_unread_idx
  on knowledge_gap_askers (user_id, notified_at desc)
  where seen_at is null;

-- ═══ 3. SEMANTIC DE-DUPE ═══════════════════════════════════════════════════
-- SECURITY DEFINER + EXECUTE revoked from anon/authenticated: this is called
-- only by the service-role client behind /api/gaps, which has already proven
-- the caller's org membership with the SESSION client. Same doctrine as P-4A's
-- search_pattern_records_by_query_for_org — and, exactly as there, do NOT
-- collapse this into the SECURITY INVOKER retrieval search. They are different
-- privilege levels on purpose.
--
-- THRESHOLD NOTE: 0.90, deliberately much stricter than the 0.75 RETRIEVAL
-- threshold. Those two numbers answer different questions. 0.75 asks "is this
-- framework relevant to this situation?" — a generous bar, because a related
-- framework is still useful. 0.90 asks "is this the SAME question?" — a
-- near-paraphrase bar, because merging two genuinely different unanswered
-- questions destroys a demand signal that cannot be recovered, while leaving
-- two near-duplicates un-merged merely looks untidy. When in doubt, do not
-- merge. Exact-normalized-text match is tried FIRST and is the primary de-dupe;
-- this is the fallback for "same question, different wording."
create or replace function public.find_similar_knowledge_gap(
  p_org_id uuid,
  p_embedding vector(1536),
  p_threshold float default 0.90
)
returns table (id uuid, similarity float)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    1 - (g.question_embedding <=> p_embedding) as similarity
  from knowledge_gaps g
  where g.org_id = p_org_id
    and g.status <> 'resolved'
    and g.question_embedding is not null
    and 1 - (g.question_embedding <=> p_embedding) >= p_threshold
  order by g.question_embedding <=> p_embedding
  limit 1;
$$;

revoke execute on function public.find_similar_knowledge_gap(uuid, vector, float)
  from anon, authenticated;

-- ═══ 4. ROW LEVEL SECURITY ═════════════════════════════════════════════════
-- Reads only. Every WRITE is service-role, behind an API route that has already
-- proven membership with the SESSION client — the lockdown doctrine used by
-- prescription_detections / prescriptions / training_format_outcomes /
-- learning_signals.

alter table knowledge_gaps enable row level security;

drop policy if exists "org knowledge gaps read" on knowledge_gaps;
create policy "org knowledge gaps read" on knowledge_gaps
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

alter table knowledge_gap_askers enable row level security;

-- ⭐ OWN ROWS ONLY — the narrower boundary. "My Questions" is personal; the
-- shared queue in knowledge_gaps is where the org-wide view lives.
drop policy if exists "own gap questions read" on knowledge_gap_askers;
create policy "own gap questions read" on knowledge_gap_askers
  for select using (
    user_id = auth.uid()
    and org_id = public.current_org_id()
  );

-- No insert/update/delete policies on either table, on purpose.

-- ═══ 5. LEARNING LEDGER — TWO NEW SIGNAL TYPES ═════════════════════════════
-- The gap and its fill are judgments about the engine's own output, so they
-- belong in the P-8 ledger alongside the other eleven. Mirrored in
-- LEARNING_SIGNAL_TYPES in src/lib/learning-ledger.ts — change one, change both.
--
--   knowledge_gap_opened → verdict 'negative'. The team's brain was asked and
--                          had nothing. That is negative evidence ABOUT
--                          RETRIEVAL COVERAGE, not about a person.
--   knowledge_gap_filled → verdict 'positive'. Somebody closed it.
--
-- subject_type stays 'retrieval_query' (already in the vocabulary) with the gap
-- id as subject_id — a gap IS an unanswered retrieval query, and reusing the
-- existing value keeps the constraint change to one line instead of two.
alter table learning_signals drop constraint if exists learning_signals_signal_type_check;
alter table learning_signals add constraint learning_signals_signal_type_check
  check (signal_type in (
    'format_choice',
    'expert_fidelity',
    'training_regenerate',
    'prescription_snooze',
    'coaching_dismiss',
    'coaching_acknowledge',
    'teachback_score',
    'outcome_checkin',
    'retrieval_result_used',
    'retrieval_result_opened',
    'efficacy_outcome',
    'knowledge_gap_opened',   -- P-9: asked, nothing codified
    'knowledge_gap_filled'    -- P-9: somebody codified it
  ));

-- ═══ 6. SANITY CHECKS (read-only — safe to run any time) ═══════════════════
--
-- The shared queue, most-demanded first:
--
-- select status, asked_count, left(question_text, 70) as question,
--        first_asked_at, resolved_at
-- from knowledge_gaps
-- order by status, asked_count desc, last_asked_at desc;
--
-- Demand-side intelligence — what this org keeps asking and cannot answer:
--
-- select
--   count(*)                                        as gaps,
--   count(*) filter (where status = 'resolved')     as filled,
--   sum(asked_count)                                as total_asks,
--   sum(asked_count) filter (where status <> 'resolved') as unanswered_asks
-- from knowledge_gaps;
--
-- The ledger side (P-9 rows only):
--
-- select signal_type, verdict, count(*)
-- from learning_signals
-- where signal_type in ('knowledge_gap_opened', 'knowledge_gap_filled')
-- group by 1, 2 order by 1, 2;
