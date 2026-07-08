-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5 + Phase 6 Slice 2 — SCHEMA FOUNDATION
-- Run this ONCE in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Covers:
--   • Step 1  — allow sources.kind = 'pdf'
--   • Step 2  — trust_tier/origin on sources; evidence_type + case structure
--               on insights; query_gaps table; credibility_scores table
--
-- Everything uses "if not exists" / "drop … if exists" because the committed
-- SQL files lag the live DB (pgvector, connections, sources.file_path, etc.
-- were applied directly and never committed). This file assumes only what the
-- live probe confirmed on 2026-07-07: sources.kind defaults to 'text', the
-- `vector` type + insights.embedding exist, gen_random_uuid() is available.
-- ─────────────────────────────────────────────────────────────────────────


-- ═══ STEP 1 — PDF support: let sources.kind hold 'pdf' ═══════════════════
-- The original constraint was `check (kind in ('screenshot','text','voice'))`
-- (auto-named sources_kind_check). Drop it if present and re-add a superset
-- that also allows 'pdf' and NULL (current inserts rely on the 'text' default,
-- so we stay null-tolerant rather than forcing NOT NULL).
alter table sources drop constraint if exists sources_kind_check;
alter table sources
  add constraint sources_kind_check
  check (kind is null or kind in ('screenshot', 'text', 'voice', 'pdf'));


-- ═══ STEP 2 — Phase 5 + Case Evidence schema ════════════════════════════

-- ─── sources: provenance signals for the credibility score ───
alter table sources
  add column if not exists trust_tier text not null default 'casual_note';
alter table sources drop constraint if exists sources_trust_tier_check;
alter table sources
  add constraint sources_trust_tier_check
  check (trust_tier in ('validated_assessment', 'strategic_doc', 'ai_inferred', 'casual_note'));

alter table sources
  add column if not exists origin text not null default 'self_reported';
alter table sources drop constraint if exists sources_origin_check;
alter table sources
  add constraint sources_origin_check
  check (origin in ('self_reported', 'third_party_verified'));

-- ─── insights: principle vs case, plus the Situation/Action/Outcome/Lesson
--     structure for case evidence. Deliberate architecture decision: NO
--     separate case table — case evidence is an insight with evidence_type
--     = 'case'. The four structured fields are nullable and only populated
--     for cases; `content` stays NOT NULL (holds a readable summary of the
--     case) so every existing display keeps working unchanged. ───
alter table insights
  add column if not exists evidence_type text not null default 'principle';
alter table insights drop constraint if exists insights_evidence_type_check;
alter table insights
  add constraint insights_evidence_type_check
  check (evidence_type in ('principle', 'case'));

alter table insights add column if not exists situation text;
alter table insights add column if not exists action    text;
alter table insights add column if not exists outcome   text;
alter table insights add column if not exists lesson    text;

-- Optional explicit link from a case → the principle it illustrates. When set,
-- the credibility score's applied_evidence_ratio and the "Real example"
-- callout can join directly; retrieval also falls back to semantic matching.
alter table insights
  add column if not exists related_insight_id uuid references insights(id) on delete set null;

create index if not exists insights_evidence_type_idx
  on insights (user_id, evidence_type);
create index if not exists insights_related_idx
  on insights (related_insight_id)
  where related_insight_id is not null;


-- ─── query_gaps: questions the Spiderweb couldn't answer well (Step 6) ───
create table if not exists query_gaps (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  question_text         text not null,
  matched_insight_count int  not null default 0,
  gap_description       text,
  gap_type              text not null default 'coverage'
                        check (gap_type in ('coverage', 'case_evidence_missing')),
  -- Frozen embedding of the question, so a newly-approved insight can be
  -- semantically matched against open gaps to auto-resolve them.
  question_embedding    vector(1536),
  resolved              boolean not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists query_gaps_open_idx
  on query_gaps (user_id, resolved, created_at desc);

alter table query_gaps enable row level security;

-- Users read their own gaps (dashboard banner + inline prompt). Writes and
-- auto-resolves happen through the service role in backend routes, so there
-- is deliberately no user insert/update/delete policy.
drop policy if exists "own query gaps read" on query_gaps;
create policy "own query gaps read" on query_gaps
  for select using (auth.uid() = user_id);

-- Semantic match of a new insight's embedding against a user's OPEN gaps.
create or replace function match_open_gaps(
  query_embedding vector(1536),
  p_user_id uuid,
  match_threshold float default 0.75
)
returns table (id uuid, similarity float)
language sql
stable
as $$
  select g.id, 1 - (g.question_embedding <=> query_embedding) as similarity
  from query_gaps g
  where g.user_id = p_user_id
    and g.resolved = false
    and g.question_embedding is not null
    and 1 - (g.question_embedding <=> query_embedding) >= match_threshold
  order by g.question_embedding <=> query_embedding;
$$;


-- ─── credibility_scores: one cached score row per user (Step 7) ───
create table if not exists credibility_scores (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  overall_score         int     not null default 0,   -- 0–100
  source_diversity_pct  numeric not null default 0,    -- 0–100
  high_confidence_pct   numeric not null default 0,    -- 0–100
  applied_evidence_ratio numeric not null default 0,   -- 0–100
  avg_trust_tier        numeric not null default 0,    -- 0–100 (weighted tier)
  last_calculated_at    timestamptz not null default now()
);

alter table credibility_scores enable row level security;

-- Users read their own score; the calculation writes via the service role.
drop policy if exists "own credibility read" on credibility_scores;
create policy "own credibility read" on credibility_scores
  for select using (auth.uid() = user_id);
