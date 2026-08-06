-- ═══════════════════════════════════════════════════════════════════════════
-- AWIP LEADERSHIP TRACK (2026-08-05) — schema + demo-seat reset
-- Run this in Supabase → SQL Editor as a single paste (one transaction).
--
-- WHAT THIS IS. A fifth onboarding track ('awip-leadership') for the live
-- exec demo, pinned by email to three seats (SEAT_TRACK_PINS in
-- src/lib/onboarding-tracks.ts — the pin check sits ABOVE is_org_admin in
-- resolveTrackKey(), and is mirror-documented in role-onboarding.sql §3).
--
--   1. Extends the onboarding_progress track check constraint so progress on
--      the new track can be WRITTEN (without this, /api/welcome's upsert
--      would violate the constraint and every Next/Finish click would 500).
--   2. Deletes Montes' and Paparella's onboarding_progress rows so the
--      dashboard auto-routes them to the new track on next login (the
--      forced click-through routes until a COMPLETED row exists for their
--      own track — with the rows gone, they start fresh on awip-leadership).
--      Greg Lusty needs no delete: his seat is brand-new (created by
--      scripts/setup-awip-leadership-seats.mjs) and never had a row.
--
-- ⚠️ Does NOT touch: the role-onboarding.sql backfill (one-time, already
-- ran — never re-run), any other seat's rows, bdhicks83+test1@gmail.com.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Allow the new track value ════════════════════════════════════════════
-- (Postgres' default name for the inline column check on role-onboarding.sql's
-- create table: onboarding_progress_track_check.)

alter table onboarding_progress
  drop constraint if exists onboarding_progress_track_check;

alter table onboarding_progress
  add constraint onboarding_progress_track_check
  check (track in ('admin', 'executive', 'expert', 'operator', 'awip-leadership'));

-- ═══ 2. Reset the two existing pinned seats ══════════════════════════════════
-- Exact full emails only — brian.ng@awip-demo.example is a DIFFERENT person
-- and must keep his rows.

delete from onboarding_progress
where user_id in (
  select id from auth.users
  where email in (
    'brian.montes@awip-demo.example',
    'joe.paparella@awip-demo.example'
  )
);

-- ═══ Sanity checks (read-only — run after) ═══════════════════════════════════
-- Expect ZERO rows (all three pinned seats clean; Greg may not exist yet):
--   select u.email, op.track, op.steps_done, op.completed_at
--   from onboarding_progress op join auth.users u on u.id = op.user_id
--   where u.email in ('brian.montes@awip-demo.example',
--                     'joe.paparella@awip-demo.example',
--                     'greg.lusty@awip-demo.example');
-- Constraint took (expect 1 row listing all five track values):
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'onboarding_progress_track_check';
