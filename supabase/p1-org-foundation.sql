-- P-1 — Org / Multi-User Foundation
-- Run this in the Supabase SQL editor, against the SAME project as
-- p0-pattern-records.sql + p0.5-methodology-entity-guardrails.sql (additive).
-- Safe to re-run (idempotent): every change uses "if not exists" / drop+recreate
-- for constraints and policies.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every ALTER TABLE / CREATE TABLE above it that looked like it
-- succeeded while you were watching it run. Do not split this into pieces
-- and do not stop partway through. Paste it all, run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964
-- (bdhicks83@gmail.com's real account).
--
-- Covers:
--   1. orgs table — the tenant boundary
--   2. profiles.org_id + profiles.display_name (attribution needs a name;
--      profiles had none before this)
--   3. current_org_id() — SECURITY DEFINER helper so RLS policies can look up
--      "what org is the requesting user in" without recursive-policy errors
--   4. pattern_records.org_id + an auto-populate trigger (org_id is ALWAYS
--      stamped server-side from the author's profile — never trusted from
--      the client, so there is no spoofing vector)
--   5. Grandfather clause — every profile and pattern_record that predates
--      this migration gets dropped into one default org, so nothing that
--      already exists loses visibility to its owner
--   6. RLS — org members read the whole org's COMPLETE (i.e. "approved" —
--      pattern_records has no separate approval step yet, so "complete" IS
--      the approved state, same substitution the P-0.5 addendum already
--      made) records; only the author can update their own row, at any
--      status, so /api/codify/answer's resume-in-progress flow keeps working
--      exactly as it does today.

-- ═══ 1. ORGS ═══════════════════════════════════════════════════════════════

create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Build 4's seeded demo org sets this true. Lets any future query/UI filter
  -- demo data out cleanly instead of pattern-matching on the org name.
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ═══ 2. PROFILES: org_id + display_name ═══════════════════════════════════
-- display_name is new — profiles had no human-readable name at all before
-- this (just id/plan/goal_track/persona), and Build 2's author attribution
-- needs one. Nullable: falls back to "Org member" in the UI until set.

alter table profiles add column if not exists org_id uuid references orgs(id);
alter table profiles add column if not exists display_name text;

-- ═══ 3. current_org_id() — RLS recursion guard ════════════════════════════
-- A policy on `profiles` that queries `profiles` to find the caller's org_id
-- hits "infinite recursion detected in policy" in Postgres. The standard
-- Supabase fix: wrap the lookup in a SECURITY DEFINER function, which runs
-- with the function owner's privileges and bypasses RLS for this one lookup
-- (it selects nothing but the caller's own org_id, so this leaks nothing).

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from profiles where id = auth.uid();
$$;

-- ═══ 4. PATTERN_RECORDS: org_id + auto-populate trigger ═══════════════════

alter table pattern_records add column if not exists org_id uuid references orgs(id);

create or replace function public.set_pattern_record_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Always stamp org_id from the author's profile server-side. Ignore
  -- whatever (if anything) the client sent — this is the only thing that
  -- makes the org-scoped read policy below trustworthy.
  new.org_id := (select org_id from profiles where id = new.user_id);
  return new;
end;
$$;

drop trigger if exists set_pattern_record_org_trigger on pattern_records;
create trigger set_pattern_record_org_trigger
  before insert on pattern_records
  for each row execute function public.set_pattern_record_org();

-- ═══ 5. GRANDFATHER — default org for every pre-P-1 profile + record ══════

do $$
declare
  default_org_id uuid;
begin
  insert into orgs (name) values ('Default Org (grandfathered pre-P-1 accounts)')
  returning id into default_org_id;

  update profiles
    set org_id = default_org_id
    where org_id is null;

  update pattern_records
    set org_id = default_org_id
    where org_id is null;

  -- Give Brian's real account a real display name instead of a blank one —
  -- everything else stays whatever the user has set (nothing, pre-P-1).
  update profiles
    set display_name = 'Brian'
    where id = 'a7d205f0-778c-44b9-9e13-4ebd5f47e964' and display_name is null;

  raise notice 'P-1 grandfather: default org id = %', default_org_id;
end $$;

-- ═══ 6. ROW LEVEL SECURITY ═════════════════════════════════════════════════

-- ─── profiles: add org-peer visibility on top of the existing own-row read ───
-- Keep the existing "own profile read" policy (Phase 4) unchanged — this ADDS
-- a second select policy; Postgres OR's multiple permissive policies of the
-- same command together, so a row is visible if EITHER policy allows it.

drop policy if exists "org members read profiles" on profiles;
create policy "org members read profiles" on profiles
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- Still no insert/update/delete policy for regular users on profiles — plan,
-- persona, and display_name all stay service-role-write-only, same lockdown
-- doctrine as Phase 4 (users can't self-upgrade `plan`; same reasoning now
-- covers persona and display_name too, both set via API routes in Build 3).

-- ─── pattern_records: replace the P0 "own rows only" policy ───

drop policy if exists "own pattern records" on pattern_records;

-- SELECT: the author sees their own row regardless of status (so an
-- in-progress /api/codify session is always resumable by its author) OR any
-- org member sees any COMPLETE row scoped to their org (the shared library).
drop policy if exists "org library read" on pattern_records;
create policy "org library read" on pattern_records
  for select using (
    auth.uid() = user_id
    or (
      status = 'complete'
      and org_id is not null
      and org_id = public.current_org_id()
    )
  );

-- INSERT: must be your own row. org_id is stamped by the trigger above, not
-- trusted from the client, so no org_id check is needed here.
drop policy if exists "own pattern records insert" on pattern_records;
create policy "own pattern records insert" on pattern_records
  for insert with check (auth.uid() = user_id);

-- UPDATE: author-only, at any status — this is the "only the author updates
-- their own" requirement. An org member who is NOT the author gets zero rows
-- affected by an UPDATE against someone else's record (RLS silently filters
-- it out rather than erroring, which is standard Postgres RLS behavior).
drop policy if exists "own pattern records update" on pattern_records;
create policy "own pattern records update" on pattern_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- DELETE: author-only (no delete UI exists yet, but this closes the door
-- rather than leaving delete ungoverned).
drop policy if exists "own pattern records delete" on pattern_records;
create policy "own pattern records delete" on pattern_records
  for delete using (auth.uid() = user_id);

-- ─── orgs: RLS was OFF by default until now (a brand-new table starts with
-- no RLS enabled, which in Supabase means any authenticated role can select
-- every row via the default grants). Lock it down: a member can read only
-- their own org's row. No insert/update/delete policy — org creation/rename
-- is service-role-only (the grandfather + demo-seed scripts), same lockdown
-- doctrine as everything else in this file.

alter table orgs enable row level security;

drop policy if exists "own org read" on orgs;
create policy "own org read" on orgs
  for select using (id = public.current_org_id());
