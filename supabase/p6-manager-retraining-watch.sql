-- P-6 (new) — Manager-only Retraining/Coaching Watch
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires orgs, profiles, pattern_records.entity_map,
-- current_org_id()).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" / drop+
-- recreate for constraints and policies throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- WHY THIS EXISTS: the Win Column (P-4.5) is peer-facing and hard-blocked from
-- ever surfacing a failure/concern/friction record about a named person
-- (aggregateWinColumn() filters to trigger_type='win' before anything else —
-- a deliberate, tested blameless guarantee). There was no equivalent surface
-- for the other direction: a manager noticing early, from concern/friction
-- records, that a direct report may need retraining or support — BEFORE it
-- becomes a documented failure. This migration adds that, scoped as tightly
-- as the Win Column's guarantee is scoped in the other direction: manager-only,
-- direct-report-only, never peer-visible, never shown to the named person.
--
-- Covers:
--   1. profiles.manager_id — direct-report relationship (didn't exist before;
--      profiles.role='manager' only marked WHO is a manager, not WHO reports
--      to whom)
--   2. is_manager_of(uuid) — SECURITY DEFINER helper so the RLS policy below
--      can check "is the caller this person's direct manager" without a
--      recursive-policy error (same pattern as current_org_id())
--   3. retraining_signals — one row per (org, person) once 2+ concern/friction
--      records name them; service-role write only, manager-only read
--   4. RLS locked to the narrowest possible boundary on purpose

-- ═══ 1. PROFILES: manager_id ═══════════════════════════════════════════════

alter table profiles add column if not exists manager_id uuid references profiles(id);

-- ═══ 2. is_manager_of() — RLS recursion guard ══════════════════════════════
-- A policy on retraining_signals that queries profiles to check "is auth.uid()
-- this person's manager" would need to read profiles.manager_id for a row the
-- caller doesn't otherwise have a profiles-select policy for (org-peer read
-- only covers same-org profiles, which is fine here, but wrapping it in a
-- SECURITY DEFINER function keeps this consistent with the existing
-- current_org_id() pattern and avoids any future recursion surprise).

create or replace function public.is_manager_of(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = target_person_id
      and manager_id = auth.uid()
  );
$$;

-- ═══ 3. RETRAINING_SIGNALS ═════════════════════════════════════════════════

create table if not exists retraining_signals (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id),

  -- Who this signal is about. Always a registered profile — see migration
  -- header for why unregistered named entities can't be covered by this.
  person_id            uuid not null references profiles(id),

  -- Idempotency: one open signal per person per org. Re-running detection
  -- upserts against this rather than duplicating.
  dedupe_key           text not null,

  -- The concern/friction pattern_records that triggered this (evidence chain,
  -- same shape as prescription_detections.evidence_record_ids).
  evidence_record_ids  uuid[] not null default '{}',
  recurrence           int not null default 0,

  -- Plain-language, blameless-doctrine summary: name the PATTERN, never
  -- "this person is a problem." e.g. "3 records this month point at
  -- first-piece inspection timing — might be worth a refresher."
  summary              text not null,

  status               text not null default 'open'
                       check (status in ('open', 'acknowledged', 'dismissed')),

  detected_at          timestamptz not null default now(),
  detected_by          text not null default 'retraining-watch-detect-v1',

  -- Manager can acknowledge (seen it) or dismiss (not worth acting on) —
  -- never "resolved," since this isn't a task, it's a standing signal.
  acknowledged_at      timestamptz,
  acknowledged_by      uuid references profiles(id)
);

create unique index if not exists retraining_signals_dedupe_idx
  on retraining_signals (org_id, dedupe_key);

create index if not exists retraining_signals_person_idx
  on retraining_signals (person_id, status);

-- ═══ 4. ROW LEVEL SECURITY — narrowest boundary on purpose ═════════════════

alter table retraining_signals enable row level security;

-- SELECT: ONLY the target person's direct manager. Not org members generally
-- (unlike every other org-scoped table in this app) — this is the one place
-- a person-level negative signal is allowed to exist, so the access boundary
-- IS the safety guarantee. The named person themselves gets NO read policy
-- here at all (deliberate — see build prompt: manager-only, always).
drop policy if exists "direct manager reads retraining signals" on retraining_signals;
create policy "direct manager reads retraining signals" on retraining_signals
  for select using (
    public.is_manager_of(person_id)
  );

-- UPDATE: the manager can acknowledge/dismiss their own direct report's
-- signal, nothing else.
drop policy if exists "direct manager updates retraining signals" on retraining_signals;
create policy "direct manager updates retraining signals" on retraining_signals
  for update using (
    public.is_manager_of(person_id)
  ) with check (
    public.is_manager_of(person_id)
  );

-- No insert/delete policy for authenticated users on purpose — detection
-- writes through a service-role route only, same lockdown doctrine as
-- prescription_detections.
