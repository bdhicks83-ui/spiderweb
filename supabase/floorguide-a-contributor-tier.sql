-- FLOOR GUIDE / PHASE A — THE CONTRIBUTOR TIER + FLOOR GUIDE MODE
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires profiles, orgs, pattern_records, current_org_id(),
-- is_manager(), is_manager_of(), is_org_admin() from T1B1).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" /
-- drop+recreate for named constraints and triggers throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every ALTER above it that looked like it succeeded while you were
-- watching it run. Paste it all, run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--
-- Until now this product has been pitched to the BUYER: capture your experts'
-- judgment before it walks out the door. Phase A adds the frame that makes the
-- END USER want it — the nervous new hire on day one who knows nothing but
-- some on-the-job training, and the individual contributor who has real floor
-- knowledge but is not a designated expert.
--
-- It does that with two orthogonal things:
--
--   1. THE CONTRIBUTOR TIER — a role BELOW member. Contributors use the system
--      fully (retrieve, ask, Floor Guide, gaps) but their input NEVER becomes
--      canonical judgment. Judgment stays with the experts; that is what keeps
--      the expertise valuable and trustworthy.
--
--   2. FLOOR GUIDE MODE — an admin-assigned, per-person onboarding surface that
--      is PRIVATE and judgment-free. A person's Floor Guide questions are not
--      visible to their manager. The psychological safety is not a nice touch,
--      it is the entire reason a new hire will ask the system instead of
--      guessing.
--
-- Phase B (emergent insight → admin review queue) and Phase C (admin-requested
-- deep dives + training intelligence) build on this. Neither is in here.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Covers:
--   1. profiles_role_check              → 'contributor' added below 'member'
--   2. is_contributor()                 → SECURITY DEFINER capability check
--   3. is_manager() HARDENED            → a contributor is never a manager
--   4. profiles.floor_guide_active /    → the admin-assigned onboarding state
--      floor_guide_started_at /
--      floor_guide_activated_by
--   5. is_floor_guide_active()          → SECURITY DEFINER, for server routes
--   6. ⭐ THE INTEGRITY GUARD           → a BEFORE trigger on pattern_records
--                                         that makes "a contributor cannot
--                                         create canonical judgment" true in
--                                         the DATA, not just in the UI
--   7. Sanity checks (read-only)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⭐ DECISION 1: 'contributor' IS A NEW profiles.role VALUE, NOT A FLAG.
--
-- T1B1 made the opposite call for `is_org_admin` and the reasoning there still
-- holds: administering seats is ORTHOGONAL to managing people, so it got its
-- own boolean rather than a rung on the role ladder.
--
-- Contributor is the reverse case. It IS a rung on that same ladder:
--
--     contributor  →  member  →  manager     (+ admin as an orthogonal
--                                              capability, unchanged)
--
-- It is strictly LESS than member on the one axis role already means — "whose
-- input becomes the team's canonical judgment." A boolean would leave two
-- sources of truth for one question, and the first role check that read
-- `role = 'member'` without also consulting the flag would silently let a
-- contributor's capture become judgment. On a ladder, a default-deny check has
-- exactly one thing to read.
--
-- Because the value is NEW, nothing in the live data is a contributor when this
-- file runs, so every hardened check below is behaviour-identical on existing
-- rows. That is deliberate: this migration cannot change what any current user
-- can do.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. THE ROLE LADDER ════════════════════════════════════════════════════
-- p4b-prescription-engine-2.sql owns this constraint; this widens it.
-- ⚠️ The default stays 'member'. A new seat created by any existing path —
-- handle_new_user(), the grandfather script, the seeds — must NOT silently
-- become a contributor. Contributor is always an explicit, admin-made choice.

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('manager', 'member', 'contributor'));

-- ═══ 2. is_contributor() — the capability check ═════════════════════════════
-- SECURITY DEFINER for the same reason current_org_id(), is_manager() and
-- is_org_admin() are: a policy on profiles that queries profiles hits
-- "infinite recursion detected in policy." Also the reason the API routes call
-- it over RPC rather than selecting the column — the gate is then evaluated by
-- Postgres AS THE CALLER, so a forged request body can never widen it.
--
-- A DEACTIVATED contributor is still a contributor (unlike a deactivated admin,
-- who is not an admin). The asymmetry is intentional: is_org_admin() grants a
-- power, so closing the seat must revoke it; is_contributor() DENIES a power,
-- so a closed seat must not accidentally regain it.

create or replace function public.is_contributor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'contributor' from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ═══ 3. is_manager() — HARDENED so a contributor is never a manager ════════
-- P-7's original reads: role = 'manager' OR anybody has you as manager_id.
-- That second clause is the hole. A contributor who happens to be somebody's
-- manager_id (a data-entry slip, a reorg, a seed) would become a manager — and
-- a manager can create training, which in P-7 Build 6 CODIFIES INTO THE GRAPH
-- as a pattern_record. That is exactly the integrity rule leaking through a
-- side door nobody was watching.
--
-- Behaviour on existing data is UNCHANGED: no row is a contributor yet, so
-- not is_contributor() is true for every current user.
--
-- The companion guard lives in the API: /api/admin/members/[id] refuses to set
-- role='contributor' on somebody who has direct reports, so the inconsistent
-- state can't be created in the first place. Belt and braces, on purpose.

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not public.is_contributor()
    and (
      exists (select 1 from profiles where id = auth.uid() and role = 'manager')
      or exists (select 1 from profiles where manager_id = auth.uid())
    );
$$;

-- NOTE ON is_org_admin() / is_org_admin_of(): deliberately NOT narrowed here.
-- T1B1's doctrine stands — administering the account is orthogonal to the role
-- ladder, and an office manager who is a contributor on the floor can still be
-- the person who runs the account. Admin grants no judgment-creating power:
-- the trigger in section 6 blocks a contributor-admin's captures exactly like
-- anyone else's. The admin API does refuse the confusing contributor+admin
-- combination so nobody has to reason about it live.

-- ═══ 4. FLOOR GUIDE — the admin-assigned onboarding state ══════════════════
-- ⭐ DECISION 2: FLOOR GUIDE IS ADMIN-ASSIGNED, NOT ROLE-LOCKED.
-- A new hire may be an operator (contributor) OR a professional (a new PM, a
-- new analyst — role='member' or even 'manager'). Both are day-one nervous and
-- both need the same thing. Tying Floor Guide to the contributor role would
-- have meant the new PM never gets it, which is half the market for it.
--
-- ⭐ DECISION 3: PRIVATE + JUDGMENT-FREE, ENFORCED AT WRITE TIME.
-- These columns say WHETHER somebody is onboarding. They are readable by org
-- peers through the existing "org members read profiles" policy, and that is
-- correct — an admin turned it on, and the console shows an admin who is
-- currently onboarding. What is private is the QUESTIONS, and that privacy is
-- enforced in the application at the POINT OF WRITE (src/lib/floor-guide.ts,
-- /api/retrieve, /api/retrieve/signal, /api/gaps): a Floor-Guide-flagged
-- retrieval performs NO person-level write at all. Filtering at read time
-- would leave the row sitting there for the next reader to find.

alter table profiles add column if not exists floor_guide_active boolean not null default false;
alter table profiles add column if not exists floor_guide_started_at timestamptz;
alter table profiles add column if not exists floor_guide_activated_by uuid references profiles(id);

-- Partial index — this is an INDEX, never an ON CONFLICT target. (The P-7
-- PostgREST trap: `onConflict` pointed at a partial unique index cannot be
-- inferred and every upsert fails silently. Nothing upserts on this; if you
-- ever need to, add a PLAIN unique index instead of reusing this one.)
create index if not exists profiles_floor_guide_idx
  on profiles (org_id)
  where floor_guide_active;

-- ═══ 5. is_floor_guide_active() ════════════════════════════════════════════
-- "Is the caller currently in Floor Guide mode." Same SECURITY DEFINER family
-- as the checks above, and the reason the write-suppression decision is made
-- server-side from THIS answer rather than from a client-supplied flag.
--
-- A deactivated seat is not onboarding.

create or replace function public.is_floor_guide_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.floor_guide_active and p.deactivated_at is null
       from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ═══ 6. ⭐⭐⭐ THE INTEGRITY GUARD — IN THE DATA, NOT THE UI ⭐⭐⭐ ═══════════
--
-- THE RULE: a contributor's input never becomes canonical org judgment.
-- pattern_records IS the canonical judgment table — it is what /library shows,
-- what retrieval embeds and ranks, what carries an author's name, and what the
-- whole product's credibility rests on. So the rule has to be true of that
-- table, not of the buttons that write to it.
--
-- ⭐ WHY A TRIGGER AND NOT RLS. RLS was the obvious first answer and it is the
-- WRONG one here, for a concrete reason rather than an aesthetic one:
-- SERVICE-ROLE CLIENTS BYPASS RLS ENTIRELY. In this codebase the realistic
-- writers of pattern_records include the seed scripts, the Training Studio's
-- graph codification (P-7 Build 6) and the gap-fill path — all service-role.
-- A restrictive RLS policy would have produced a guard that passes every test
-- run through a session client and silently does nothing on every path that
-- actually matters. A BEFORE trigger runs for service-role too. It is the only
-- placement where "verify this can't be bypassed" is answerable with yes.
--
-- ⭐ WHY IT KEYS ON new.user_id, NOT auth.uid(). The question is not "who is
-- typing" but "whose judgment would this become." A service-role route writing
-- a record ON BEHALF OF a contributor is precisely the bypass to close, and
-- auth.uid() is null on those paths anyway.
--
-- ⭐ WHY IT ONLY FIRES ON THE CANONICAL TRANSITION. An UPDATE that merely
-- embeds a row, stamps a timestamp, or links a gap must still work — including
-- on the historical records of somebody who was a member when they captured
-- them and has since been moved to contributor. Their judgment STAYS (never
-- hard-delete, never retroactively erase); what they cannot do is create NEW
-- judgment. So: every INSERT is blocked, and an UPDATE is blocked only when it
-- would newly make the row canonical (framework appearing, status becoming
-- complete) or re-point ownership at a contributor.
--
-- Phase B is what gives contributor input somewhere useful to GO (candidate
-- insight → admin review → promotion). Phase A just makes sure it cannot land
-- in the canonical table by accident. The error message says so, because the
-- next person to hit this will be a developer wondering whether it is a bug.

create or replace function public.guard_contributor_judgment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_role        text;
  becoming_canonical boolean;
begin
  if TG_OP = 'INSERT' then
    becoming_canonical := true;
  else
    becoming_canonical :=
         (new.framework is not null and old.framework is null)
      or (new.status = 'complete' and coalesce(old.status, '') <> 'complete')
      or (new.user_id is distinct from old.user_id);
  end if;

  if not becoming_canonical then
    return new;
  end if;

  select p.role into owner_role from profiles p where p.id = new.user_id;

  if owner_role = 'contributor' then
    raise exception
      'CONTRIBUTOR_CANNOT_CODIFY: pattern_records holds the org''s canonical judgment, and profile % has role ''contributor''. This is the Floor Guide Phase A integrity rule, enforced at the data layer on purpose — a contributor''s input never auto-becomes the team''s judgment. Contributors retrieve, ask, use Floor Guide and flag gaps. Routing what they DO produce (candidate insight -> admin review -> promotion) is Phase B.',
      new.user_id
      using errcode = '42501';
  end if;

  return new;
end
$$;

drop trigger if exists pattern_records_contributor_guard on pattern_records;
create trigger pattern_records_contributor_guard
  before insert or update on pattern_records
  for each row execute function public.guard_contributor_judgment();

-- ═══ 7. SANITY CHECKS (read-only — safe to run any time) ═══════════════════
--
-- The role ladder now has three rungs:
--
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint where conname = 'profiles_role_check';
--
-- The four functions resolve (all return false in the SQL editor because
-- auth.uid() does not resolve there — that is expected, not a failure):
--
-- select public.is_contributor(), public.is_floor_guide_active(),
--        public.is_manager(), public.is_org_admin();
--
-- The guard trigger is installed:
--
-- select tgname, tgenabled from pg_trigger
-- where tgrelid = 'pattern_records'::regclass and not tgisinternal;
--
-- Who is a contributor, and who is currently onboarding:
--
-- select p.display_name, p.role, p.claimed_title, p.floor_guide_active,
--        p.floor_guide_started_at, o.name as org
-- from profiles p join orgs o on o.id = p.org_id
-- where p.role = 'contributor' or p.floor_guide_active
-- order by o.name, p.display_name;
--
-- ⭐ THE INTEGRITY PROOF, run by hand (expect an ERROR, that is the pass):
-- substitute a real contributor's profile id.
--
-- insert into pattern_records (user_id, status, qa_pairs, entity_map)
-- values ('<a contributor profile id>', 'active', '[]'::jsonb, '[]'::jsonb);
-- -- expected: ERROR  CONTRIBUTOR_CANNOT_CODIFY: ...
--
-- scripts/verify-floor-guide.mjs runs that same proof through the SERVICE-ROLE
-- client, which is the privilege level RLS would have missed.
--
-- Nobody was hard-deleted and no existing role changed (both counts should
-- match your pre-run numbers; contributors should be 0 until an admin assigns
-- one or the demo seed runs):
--
-- select role, count(*) from profiles group by role order by role;
