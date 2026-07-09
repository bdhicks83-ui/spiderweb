-- ─────────────────────────────────────────────────────────────────────────
-- Phase 7 — ADMIN RISK MONITORING (unified risk score)
-- Run ONCE in Supabase → SQL Editor. Idempotent (safe to re-run).
--
-- Design (signed off 2026-07-08):
--   • One risk score per user, not 3 disconnected triggers. Signals ADD to a
--     single numeric score that DECAYS over time when clean.
--   • Signals & weights: voice_mismatch +1, huge_upload +2, background_mismatch +3
--   • Thresholds (surface only, never auto-block): >=3 amber, >=6 red.
--   • Admin UI (#4) is deliberately NOT built yet — this migration lands the
--     schema + the scoring runs live per upload so the data is ready the day a
--     second user exists.
--   • risk_tolerances / dismissed_at are the forward hooks for the dismissal
--     feedback loop (#6), which is NOT implemented yet (still pending sign-off).
-- ─────────────────────────────────────────────────────────────────────────


-- ═══ credibility_scores: bolt the risk columns onto the existing table ═════
-- (Do NOT build a parallel scoring table — this row already caches per-user
--  trust signals; risk lives here alongside overall_score.)
alter table credibility_scores
  add column if not exists risk_score numeric not null default 0;

-- Append-only-ish log of what contributed to the score and when. Each element:
--   { type, source_id, weight, reason, created_at, dismissed_at? }
-- The numeric risk_score is DERIVED from these (sum of decayed live weights),
-- so this jsonb is the source of truth; risk_score is the cache.
alter table credibility_scores
  add column if not exists risk_factors jsonb not null default '[]'::jsonb;

alter table credibility_scores
  add column if not exists last_risk_calculated_at timestamptz;

-- Per-signal dismissal tolerances for the (not-yet-built) #6 feedback loop.
-- e.g. { "huge_upload": 2 } → raise this user's bar for that signal.
alter table credibility_scores
  add column if not exists risk_tolerances jsonb not null default '{}'::jsonb;


-- ═══ sources.content_length: cheap size metric for the huge-upload baseline ══
-- Store the text length once at extract time so the baseline query never has
-- to pull full document text. Backfill existing rows so the baseline includes
-- history immediately (min 5 prior uploads before the signal can fire).
alter table sources
  add column if not exists content_length int;

update sources
  set content_length = length(coalesce(extracted_text, raw_text, ''))
  where content_length is null;


-- ═══ voice_profiles: running writing-style fingerprint per user ════════════
-- Built from the user's APPROVED, self_reported ("own") insights. Rebuilt as
-- the approved corpus grows (see src/lib/voice.ts). Read is owner-scoped;
-- writes happen through the service role in the extraction job.
create table if not exists voice_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  fingerprint  text not null,
  sample_count int  not null default 0,
  updated_at   timestamptz not null default now()
);

alter table voice_profiles enable row level security;

drop policy if exists "own voice profile read" on voice_profiles;
create policy "own voice profile read" on voice_profiles
  for select using (auth.uid() = user_id);
