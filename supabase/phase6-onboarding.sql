-- Phase 6 Slice 1 — "It Grows": onboarding goal fork.
-- Run this in Supabase → SQL Editor.
--
-- Adds profiles.goal_track. NULL = user hasn't done onboarding yet
-- (that's how /upload decides whether to redirect brand-new users).
--
-- No RLS changes needed:
--   - reads are covered by the existing "own profile read" select policy
--   - writes happen only via the service role in /api/onboarding
--     (users still can't update their own profile row directly, same as plan)

alter table profiles
  add column if not exists goal_track text
  check (goal_track in ('content', 'career', 'licensing', 'recruiter'));
