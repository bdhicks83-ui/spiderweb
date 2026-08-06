-- ═══════════════════════════════════════════════════════════════════════════
-- ROLE-BASED ONBOARDING — per-person track progress (the ONE completion store)
-- Run this in Supabase → SQL Editor as a single paste (one transaction).
--
-- WHAT THIS IS. Four onboarding tracks (admin · executive · expert · operator)
-- rendered by one wizard engine at /welcome. A person is auto-routed to their
-- role's track on first login and can resume where they left off. This table
-- is the single completion-state store for ALL four tracks — there is no
-- parallel store anywhere else, by handoff instruction.
--
-- WHY THE BACKFILL MATTERS (§3). Auto-routing must NEVER hijack an existing
-- seat: every profile that exists when this migration runs is marked done on
-- their resolved track, so only seats invited AFTER this ships get routed.
-- The AWIP demo seats are therefore untouched on login.
--
-- DESIGN NOTES (standing gotchas obeyed):
--   · PRIMARY KEY (user_id, track) — a PLAIN unique index, never partial
--     (the P-7/P-8/P-9 PostgREST onConflict rule). The API's upsert targets it.
--   · RLS: own-row SELECT only. NO insert/update/delete policies — every
--     write goes through a service-role client in /api/welcome after the
--     SESSION client proved who's asking (the T1B1 lockdown doctrine).
--   · The CASE below mirrors resolveTrackKey() in
--     src/lib/onboarding-tracks.ts — change one, change BOTH.
--   · steps_done = 99 is the "completed" sentinel (larger than any track).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. The table ═══════════════════════════════════════════════════════════

create table if not exists onboarding_progress (
  user_id      uuid not null references profiles(id) on delete cascade,
  track        text not null check (track in ('admin', 'executive', 'expert', 'operator')),
  steps_done   integer not null default 0,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, track)
);

-- ═══ 2. RLS — own rows, read-only from the client ═══════════════════════════

alter table onboarding_progress enable row level security;

drop policy if exists "own onboarding progress read" on onboarding_progress;
create policy "own onboarding progress read" on onboarding_progress
  for select using (user_id = auth.uid());

-- Deliberately NO write policies: /api/welcome authenticates the session,
-- resolves the caller's OWN track server-side (a client can never record
-- progress on a track it is merely viewing), and writes with the service role.

-- ═══ 3. Backfill — existing seats are exempt from auto-routing ══════════════
-- Mirrors resolveTrackKey() in src/lib/onboarding-tracks.ts. Change one,
-- change BOTH.
--
-- ⚠️ 2026-08-05 — SEAT PINS POSTDATE THIS BACKFILL (which already ran, one
-- time — do NOT re-run it). resolveTrackKey() now has a step 0 ABOVE the
-- is_org_admin check: three AWIP exec-demo seats are pinned BY EMAIL to the
-- 'awip-leadership' track (SEAT_TRACK_PINS in src/lib/onboarding-tracks.ts —
-- brian.montes@ / joe.paparella@ / greg.lusty@awip-demo.example). The CASE
-- below deliberately does NOT model the pins: it is kept as the historical
-- record of what ran. If this backfill is ever adapted for a future run, the
-- pin check must be added above the is_org_admin arm — the mirror rule still
-- stands. The track check constraint was extended to include
-- 'awip-leadership' by supabase/awip-leadership-track.sql.

insert into onboarding_progress (user_id, track, steps_done, completed_at)
select
  p.id,
  case
    when p.is_org_admin                                    then 'admin'
    when p.role = 'contributor'                            then 'operator'
    when p.persona = 'technical_director'                  then 'expert'
    when p.persona = 'exec'                                then 'executive'
    when p.role = 'manager' or p.persona = 'sr_manager'    then 'executive'
    else 'expert'
  end,
  99,
  now()
from profiles p
on conflict (user_id, track) do nothing;

-- ═══ Sanity checks (read-only — run after) ══════════════════════════════════
-- Every existing profile has exactly one completed row:
--   select count(*) filter (where completed_at is not null) as done,
--          count(*) as total
--   from onboarding_progress;
-- Who resolved where (eyeball the AWIP cast):
--   select pr.display_name, pr.role, pr.persona, pr.is_org_admin, op.track
--   from onboarding_progress op join profiles pr on pr.id = op.user_id
--   order by op.track, pr.display_name;
