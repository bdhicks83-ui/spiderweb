-- ─────────────────────────────────────────────────────────────────────────
-- Phase 8 — Expert Credibility v2 (per-insight scoring + non-blocking
-- consistency + org-fit + longitudinal growth). Run ONCE in Supabase → SQL
-- Editor. Idempotent (safe to re-run).
--
-- Reconciles the "Phase 5 / 5 Blocks" spec against what already shipped:
--   • The per-USER Expert Credibility Score (credibility_scores, lib/credibility.ts)
--     and the blocking consistency check (approve-check/approve-exception) already
--     exist. This migration ADDS a per-INSIGHT scoring layer alongside them and
--     switches consistency to a NON-BLOCKING "needs_explanation" model.
--   • Locked design: NO recency-decay anywhere. quality_score locks at
--     verification and never recalculates; corroboration_score is additive-only.
--
-- Blocks in this file:
--   BLOCK 1 — quality_score / corroboration_score / credibility_badge on insights
--   BLOCK 2 — non-blocking consistency: needs_explanation + belief-revision fields
--   BLOCK 4 — org-fit: expert behavioral profile + org intake + assessments
--   BLOCK 5 — longitudinal growth snapshots
-- (BLOCK 3 cross-expert benchmarking is deliberately NOT built — needs 5+ experts
--  per competency; untestable while invite-only with one real account.)
-- ─────────────────────────────────────────────────────────────────────────


-- ═══ BLOCK 1 — per-insight scoring ═════════════════════════════════════════
-- quality_score:      0–100, LOCKS at verification (scored_at), never recalculated.
-- corroboration_score:0–100, starts at a base and ONLY increases (citations/usage).
-- credibility_badge:  derived from the combined score (Emerging/Rising/Verified/Elite).
-- These are new columns on insights, so they inherit the existing single blanket
-- ALL RLS policy — no new policy, no fragmentation.
alter table insights add column if not exists quality_score        numeric;
alter table insights add column if not exists corroboration_score  numeric not null default 0;
alter table insights add column if not exists corroboration_count  int     not null default 0;
alter table insights add column if not exists credibility_badge     text;
alter table insights add column if not exists scored_at             timestamptz;

alter table insights drop constraint if exists insights_credibility_badge_check;
alter table insights
  add constraint insights_credibility_badge_check
  check (credibility_badge is null
         or credibility_badge in ('Emerging', 'Rising', 'Verified', 'Elite'));


-- ═══ BLOCK 2 — non-blocking consistency / integrity ════════════════════════
-- When a new insight contradicts an existing one on the same topic it is
-- approved normally, but flagged needs_explanation. It does NOT count toward
-- quality/corroboration until the expert explains the change AND that
-- explanation clears the belief-revision depth gate.
alter table insights add column if not exists needs_explanation        boolean not null default false;
alter table insights add column if not exists contradiction_note       text;   -- the pattern it contradicts (badge tooltip)
alter table insights add column if not exists contradicts_insight_id   uuid references insights(id) on delete set null;
alter table insights add column if not exists revision_explanation     text;   -- the expert's belief-revision write-up
alter table insights add column if not exists revision_depth_ok        boolean; -- passed the depth gate? (null = not explained yet)
alter table insights add column if not exists explained_at             timestamptz;

create index if not exists insights_needs_explanation_idx
  on insights (user_id, needs_explanation)
  where needs_explanation = true;


-- ═══ BLOCK 4 — org-fit matching ════════════════════════════════════════════
-- Expert behavioral profile is INFERRED from their existing insights (no survey)
-- and cached on profiles as jsonb: { autonomy, pace, formality, directness, summary }.
alter table profiles add column if not exists behavioral_profile jsonb;

-- Org intake (short form) + the generated plain-English fit summary. Shown to
-- the ORG only, before any payment. Written by the service role in the org-fit
-- route; the expert never reads it, so there is no owner read policy here.
create table if not exists org_fit_assessments (
  id             uuid primary key default gen_random_uuid(),
  expert_id      uuid not null references auth.users(id) on delete cascade,
  team_size      text,
  decision_style text,   -- 'fast' | 'consensus'
  pace           text,   -- 'fast' | 'deliberate'
  formality      text,   -- 'formal' | 'casual'
  fit_summary    text not null,
  friction_points jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists org_fit_expert_idx on org_fit_assessments (expert_id, created_at desc);

alter table org_fit_assessments enable row level security;
-- No user policies: this is org-facing, generated + read through the service
-- role in the backend route. The expert must NOT see it (avoids pressuring orgs).


-- ═══ BLOCK 5 — longitudinal growth snapshots ═══════════════════════════════
-- One row per user per month. A simple trend line on the expert's own
-- dashboard. Additive composite of quality + corroboration + depth + case ratio.
create table if not exists growth_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  snapshot_month      date not null,   -- first day of the month
  quality_avg         numeric not null default 0,
  corroboration_avg   numeric not null default 0,
  combined_avg        numeric not null default 0,
  insight_depth       numeric not null default 0,   -- avg content length signal, 0–100
  case_evidence_ratio numeric not null default 0,   -- principles with a linked case, 0–100
  growth_value        numeric not null default 0,   -- the headline composite, 0–100
  approved_count      int     not null default 0,
  created_at          timestamptz not null default now(),
  unique (user_id, snapshot_month)
);

create index if not exists growth_snapshots_user_idx
  on growth_snapshots (user_id, snapshot_month);

alter table growth_snapshots enable row level security;

-- Users read their own trend; the snapshot job writes via the service role.
drop policy if exists "own growth read" on growth_snapshots;
create policy "own growth read" on growth_snapshots
  for select using (auth.uid() = user_id);
