-- P-7 Build 6 + P-8 Phase 2 — "EVERYTHING FEEDS THE WEB": the loop closes.
-- Run this in the Supabase SQL editor, against the SAME project as
-- p7-training-studio.sql / p8-learning-ledger.sql (additive — requires
-- pattern_records, training_format_outcomes, learning_signals).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" /
-- drop+recreate for named constraints throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every ALTER above it that looked like it succeeded. Paste it all,
-- run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- WHY THIS EXISTS: until now the arrow was one-way — codified frameworks fed
-- training (P-7), and user judgments fed a ledger nothing read (P-8 Phase 1).
-- This migration is the plumbing for both return arrows:
--   PART A (P-7 Build 6): a RESOLVED Training Studio artifact codifies into
--     the knowledge graph as a first-class pattern_records row — retrievable,
--     embeddable, conflict-checkable, exactly like an approved framework.
--   PART B (P-8 Phase 2, first reader): /retrieve computes an effectiveness
--     signal from learning_signals + training_format_outcomes and re-ranks
--     WITHIN the 0.75-gated matches. The reader marks the ledger rows it
--     consumed (consumed_by), which is what makes "everything feeds the web"
--     testable instead of asserted.
--
-- Covers:
--   1. pattern_records.method — 'training_derived' joins the closed method
--      vocabulary. A training-born record is NOT pretending to be an
--      elicitation session; it says what it is, and the UI labels it
--      "Codified from training."
--   2. pattern_records.codified_from — provenance for a training-derived
--      record: format · issue · efficacy outcome · expert attribution ·
--      the link back to the originating training request. NULL on every
--      elicitation-born record (that is the discriminator).
--   3. mark_learning_signals_consumed() — the reader's consumption stamp.
--      P-8's consumed_by column finally gets writes: the retrieval reader
--      appends its stable name to every signal it actually used.

-- ═══ 1. METHOD — the training-derived record says what it is ═══════════════
-- The completion gate (p0.5) requires method NOT NULL on complete records, and
-- the method vocabulary was the five elicitation methodologies. A record
-- codified from a resolved training ran no elicitation ladder — inventing one
-- would be a lie the UI repeats forever. Sixth value instead.

alter table pattern_records drop constraint if exists pattern_records_method_check;
alter table pattern_records
  add constraint pattern_records_method_check
  check (method is null or method in
    ('5whys_fishbone', 'aar_success_case', 'premortem', 'a3', 'cdm',
     'training_derived'));

-- ═══ 2. CODIFIED_FROM — provenance, self-describing on the record ═══════════
-- { "kind": "training_studio", "training_request_id": uuid,
--   "training_id": uuid, "prescription_id": uuid, "attempt": int,
--   "format_key": text, "format_name": text, "issue_type": text|null,
--   "issue_restated": text|null, "audience_summary": text,
--   "outcome": "effective", "outcome_note": text,
--   "experts": [{ "user_id": uuid, "name": text, "record_id": uuid,
--                 "framework_name": text|null }],
--   "codified_at": timestamptz }
-- The experts array is the ATTRIBUTION: which experts' frameworks the winning
-- training was built from. training_format_outcomes.graph_node_id (reserved
-- since P-7, written for the first time by this build) points the other way.

alter table pattern_records add column if not exists codified_from jsonb;

-- Cheap lookup: "which record did this training request codify into?"
create index if not exists pattern_records_codified_from_idx
  on pattern_records ((codified_from->>'training_request_id'))
  where codified_from is not null;

-- ═══ 3. THE READER'S CONSUMPTION STAMP ══════════════════════════════════════
-- P-8 doctrine: consumed_by makes the learning auditable. The retrieval
-- effectiveness reader appends its name to every signal it used, so
-- scripts/audit-learning-signals.sql now returns REAL consumption numbers
-- instead of 100%-unconsumed. Idempotent per (row, reader) — appending the
-- same reader twice is a no-op.
--
-- SECURITY: definer, and EXECUTE revoked from anon/authenticated — only the
-- service role (behind /api/retrieve) may stamp consumption, same lockdown
-- doctrine as search_pattern_records_by_query_for_org.

create or replace function public.mark_learning_signals_consumed(
  signal_ids uuid[],
  reader text
)
returns int
language sql
security definer
set search_path = public
as $$
  with updated as (
    update learning_signals
    set consumed_by = consumed_by || reader
    where id = any(signal_ids)
      and not (consumed_by @> array[reader])
    returning id
  )
  select count(*)::int from updated;
$$;

revoke execute on function public.mark_learning_signals_consumed(uuid[], text) from public;
revoke execute on function public.mark_learning_signals_consumed(uuid[], text) from anon;
revoke execute on function public.mark_learning_signals_consumed(uuid[], text) from authenticated;

-- ═══ 4. SANITY CHECKS (read-only — safe to run any time) ════════════════════
--
-- Which records are training-derived, and what they came from:
-- select id, framework->>'name' as name, codified_from->>'format_name' as fmt,
--        codified_from->>'training_request_id' as request
-- from pattern_records where codified_from is not null;
--
-- Is the reader actually consuming? (expect retrieval_result_used rows to
-- start carrying 'retrieval_effectiveness_v1' after the first /retrieve):
-- select signal_type, consumed_by, count(*)
-- from learning_signals group by 1, 2 order by 1;
