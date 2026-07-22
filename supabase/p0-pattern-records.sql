-- P0 — Pattern Records: the licensable unit of the Elicitation Engine.
-- One row is BOTH the elicitation session (qa transcript, pending question,
-- ladder position) and the resulting Pattern Record (the 7 fields from
-- ELICITATION-ENGINE-SPEC.md). Keeping them in one table means a refresh
-- mid-session loses nothing and there's no join for the artifact render.
--
-- Run this in the Supabase SQL editor.
-- (Reminder: auth.uid() does not resolve in the SQL editor — for manual
--  queries use the literal user id a7d205f0-778c-44b9-9e13-4ebd5f47e964.)

create table pattern_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  -- ─── Elicitation session state ───
  -- [{ "rung": int, "question": text, "answer": text }, ...]
  qa_pairs          jsonb not null default '[]',
  pending_question  text,
  pending_rung      int,
  status            text not null default 'active'
                    check (status in ('active', 'complete')),

  -- ─── The Pattern Record (7 fields) ───
  -- 1. Context — free-text summary plus ontology tags used for question
  --    selection, clustering, and coverage-gap detection.
  context_summary   text,
  context_org_size  text,   -- '<50' | '50-200' | '200-1000' | '1000+'
  context_industry  text,   -- Manufacturing | Distribution | Services | Healthcare | Other
  context_function  text,   -- Finance | Ops | HR/People | Supply chain | Quality | Leadership
  situation_type    text,   -- Headcount/structure | Process failure | Cost | Talent | Transition/succession | Culture | Systems
  intervention_type text,   -- Consolidate | Add | Remove | Restructure | Re-skill | Re-sequence | Measure
  -- 2. Trigger / Signal — what was observed.
  trigger_signal    text,
  -- 3. Signal Detail ⭐ — the granular tacit read. Rung 4. Highest-value field.
  signal_detail     text,
  -- 4. Judgment — the call / intervention.
  judgment          text,
  -- 5. Rationale — why, in the consultant's own reasoning.
  rationale         text,
  -- 6. Boundaries ⭐ — when this does NOT apply. Rung 6. MANDATORY.
  boundaries        text,
  -- 7. Outcome — captured at delayed follow-up. Nullable by design.
  outcome           text,

  -- ─── Capture guardrails ───
  -- 'clean'    = scrubber found nothing to remove
  -- 'scrubbed' = client/individual names were stripped before storage
  scrub_status      text not null default 'clean'
                    check (scrub_status in ('clean', 'scrubbed')),

  -- ─── First-session artifact ───
  -- The branded framework rendered from this record:
  -- { "name": text, "tagline": text, "when_to_apply": [text],
  --   "signals": [text], "the_play": text, "why_it_works": text,
  --   "boundaries": [text] }
  framework         jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A record may only be marked complete when all 6 required fields are
  -- populated — rung 4 (signal_detail) and rung 6 (boundaries) included.
  -- The API enforces this too; the constraint makes it impossible to bypass.
  constraint pattern_record_complete_check check (
    status <> 'complete' or (
      context_summary is not null
      and trigger_signal is not null
      and signal_detail is not null
      and judgment      is not null
      and rationale     is not null
      and boundaries    is not null
    )
  )
);

create index pattern_records_user_idx on pattern_records (user_id, created_at desc);

-- ─── ROW LEVEL SECURITY: users only see their own records ───
alter table pattern_records enable row level security;

create policy "own pattern records" on pattern_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
