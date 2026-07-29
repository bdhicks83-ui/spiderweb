-- TIER 1 / BUILD 1 — ADMIN & ONBOARDING CONSOLE
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires orgs, profiles, current_org_id(), is_manager(),
-- is_manager_of()).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" /
-- drop+recreate for named constraints and policies throughout.
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
-- Every org in this product is currently born from a seed script
-- (scripts/seed-awip-demo.mjs). A real pilot customer therefore cannot create
-- their org, add their experts, set who reports to whom, or retire a seat
-- without somebody hand-running SQL against the database. That is the wall
-- between "a demo" and "a product a company can run."
--
-- This migration adds the DATA side of the admin console. It wires nothing new
-- into auth, orgs, or RLS doctrine — it adds one orthogonal capability flag,
-- a soft-deactivation record, and two invite-provenance columns.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Covers:
--   1. profiles.is_org_admin      — the admin capability. A BOOLEAN, NOT a new
--                                   value in profiles.role (see the decision
--                                   note below — this is the load-bearing call
--                                   in this migration).
--   2. profiles.deactivated_at /  — SOFT deactivation. Never a delete. The
--      deactivated_by                seat closes; the person's captured
--                                   judgment stays exactly where it is.
--   3. profiles.invited_at /      — invite provenance. No token is ever stored
--      invited_by                    (a stored invite token is a stored
--                                   credential); these two columns record only
--                                   that an invite happened and who sent it.
--   4. orgs.default_persona /     — the two org-level settings the console
--      orgs.industry /               exposes. Nothing destructive.
--      orgs.updated_at
--   5. is_org_admin()             — SECURITY DEFINER "is the caller an org
--                                   admin at all," the companion to P-7's
--                                   is_manager() and P-6's is_manager_of().
--   6. is_org_admin_of(uuid)      — SECURITY DEFINER "is the caller an admin
--                                   OF THE ORG THIS PERSON IS IN." The org
--                                   boundary, expressed in SQL rather than
--                                   trusted to a route.
--   7. Backfill                   — every existing org gets exactly one admin
--                                   so no org is left unadministered by this
--                                   migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⭐ THE DECISION: A SEPARATE BOOLEAN, NOT A THIRD profiles.role VALUE
--
-- The obvious move is `check (role in ('admin','manager','member'))`. It is
-- wrong here, and the reason is concrete rather than aesthetic:
--
--   public.is_manager() (P-7) reads
--     role = 'manager' OR anybody has you as manager_id.
--
-- An org admin promoted to role='admin' who happens to have no direct reports
-- would SILENTLY LOSE Training Studio access, prescription approval, and the
-- manager gate everywhere else — because 'admin' is not 'manager'. Making
-- admin a rung on the same ladder forces every existing manager check to be
-- re-derived, and every one that got missed would fail open or fail shut in a
-- way nobody would notice until a pilot customer hit it.
--
-- Administering seats and managing people are ORTHOGONAL capabilities. An
-- office manager can administer the account without managing a single person;
-- a plant manager can manage twelve people and have no business changing
-- roles. So: is_org_admin is its own boolean, role keeps its existing two
-- values and its existing meaning, and NOTHING that already checks role or
-- is_manager() changes behavior because of this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. PROFILES — the admin flag ══════════════════════════════════════════

alter table profiles add column if not exists is_org_admin boolean not null default false;

-- ═══ 2. PROFILES — soft deactivation ═══════════════════════════════════════
-- 🛑 STANDING RULE, ENCODED: never hard-delete a person. The +test1 lesson is
-- that a row which looks disposable can be the cascade parent of the live web
-- (29 sources → 1,248 insights). A deactivated person's frameworks, conflicts,
-- prescriptions, win-column mentions and gap fills all stay exactly where they
-- are and keep rendering under their name. Deactivation closes the SEAT.
--
-- It is also why the org-peer profiles read policy is NOT narrowed to active
-- people: an author's display_name has to keep resolving on every framework
-- they ever captured, forever. That is the product's entire premise.

alter table profiles add column if not exists deactivated_at timestamptz;
alter table profiles add column if not exists deactivated_by uuid references profiles(id);

-- ═══ 3. PROFILES — invite provenance (never a token) ═══════════════════════
-- invited_at is stamped when an admin creates the seat; it is NOT cleared on
-- first sign-in (the console derives "pending" by joining to the auth user's
-- last_sign_in_at server-side, which is service-role-only data and therefore
-- never lands in an org-readable column).

alter table profiles add column if not exists invited_at timestamptz;
alter table profiles add column if not exists invited_by uuid references profiles(id);

create index if not exists profiles_org_idx on profiles (org_id);

-- ═══ 4. ORGS — the two settings the console exposes ════════════════════════
-- default_persona seeds an invited member's persona so a fresh seat does not
-- land in /codify with no register at all. It uses the SAME vocabulary as
-- profiles.persona (P-0.5) — change one, change both.

alter table orgs add column if not exists default_persona text;
alter table orgs drop constraint if exists orgs_default_persona_check;
alter table orgs add constraint orgs_default_persona_check
  check (default_persona is null or default_persona in ('exec', 'technical_director', 'sr_manager'));

alter table orgs add column if not exists industry text;
alter table orgs add column if not exists updated_at timestamptz not null default now();

-- Who created the org (null for the grandfathered + seeded orgs).
alter table orgs add column if not exists created_by uuid references profiles(id);

-- ═══ 5. is_org_admin() — the capability check ══════════════════════════════
-- SECURITY DEFINER for the same reason current_org_id() is: a policy on
-- profiles that queries profiles hits "infinite recursion detected in policy."
-- Also the reason the API routes call this over RPC rather than selecting the
-- column: the gate is then evaluated by Postgres AS THE CALLER, so a forged
-- request body can never widen it.
--
-- A DEACTIVATED admin is not an admin. That check lives here, once, rather
-- than in each of the six routes that would otherwise each have to remember.

create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_org_admin and p.deactivated_at is null
       from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ═══ 6. is_org_admin_of(target) — the ORG BOUNDARY in SQL ══════════════════
-- "Is the caller an admin, and is this person in the caller's org?" Companion
-- to P-6's is_manager_of(target) and deliberately NOT collapsed into
-- is_org_admin(): an admin acting on a person is only ever legitimate inside
-- their own org, and that sentence belongs in the database rather than in six
-- route handlers that each have to remember to add .eq("org_id", orgId).
-- (The routes DO also scope by org_id — belt and braces, on purpose.)

create or replace function public.is_org_admin_of(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles me
    join profiles target on target.org_id = me.org_id
    where me.id = auth.uid()
      and me.is_org_admin
      and me.deactivated_at is null
      and me.org_id is not null
      and target.id = target_person_id
  );
$$;

-- ═══ 7. BACKFILL — every org gets exactly one admin ════════════════════════
-- Without this, this migration would ship an admin console that NOBODY can
-- open, on every org that already exists. Choice order, most-defensible first:
--   1. the top of the reporting chain (a manager nobody manages)
--   2. failing that, the org's earliest profile
-- Only runs for orgs that have no admin yet, so re-running never reshuffles a
-- decision an admin has since made.

do $$
declare
  o      record;
  chosen uuid;
begin
  for o in select id, name from orgs loop
    if exists (select 1 from profiles where org_id = o.id and is_org_admin) then
      continue;
    end if;

    select p.id into chosen
    from profiles p
    where p.org_id = o.id
      and p.role = 'manager'
      and p.manager_id is null
      and p.deactivated_at is null
    order by p.created_at asc
    limit 1;

    if chosen is null then
      select p.id into chosen
      from profiles p
      where p.org_id = o.id
        and p.deactivated_at is null
      order by p.created_at asc
      limit 1;
    end if;

    if chosen is not null then
      update profiles set is_org_admin = true, updated_at = now() where id = chosen;
      raise notice 'T1B1 backfill: org "%" (%) → admin %', o.name, o.id, chosen;
    else
      raise notice 'T1B1 backfill: org "%" (%) has no profiles — no admin assigned', o.name, o.id;
    end if;
  end loop;
end $$;

-- Brian's real account is always an admin of whatever org it sits in.
update profiles
  set is_org_admin = true, updated_at = now()
  where id = 'a7d205f0-778c-44b9-9e13-4ebd5f47e964';

-- ⭐ DEMO SEAT: chuck.milner is the seat the AWIP walkthrough logs in as, so he
-- gets the admin flag too. Additive only — it grants a capability, it changes
-- no demo content, no framework, no conflict, no count. Remove this statement
-- if the demo should show a non-admin manager seat instead.
update profiles
  set is_org_admin = true, updated_at = now()
  where id in (
    select id from auth.users where email = 'chuck.milner@awip-demo.example'
  );

-- ═══ 8. ROW LEVEL SECURITY ═════════════════════════════════════════════════
-- Deliberately NO new write policies. Every admin write (invite, edit role,
-- reassign manager, deactivate, rename the org) goes through a service-role
-- API route that has FIRST proven the caller is an org admin via the
-- is_org_admin() RPC on the SESSION client — the exact lockdown doctrine used
-- by prescriptions, training_format_outcomes, learning_signals and
-- knowledge_gaps. A client that can UPDATE profiles.role is a client that can
-- promote itself.
--
-- Reads need nothing new either: "org members read profiles" (P-1) already
-- scopes the people list to the caller's own org, and the four new profiles
-- columns ride along inside that existing boundary. An admin literally cannot
-- SELECT another org's profiles — not because the route filters, but because
-- the policy does.
--
-- orgs: "own org read" (P-1) still governs reads; renames stay service-role.
-- This comment block is the whole of section 8 on purpose. Nothing to run.

-- ═══ 9. SANITY CHECKS (read-only — safe to run any time) ═══════════════════
--
-- Who administers each org:
--
-- select o.name as org, p.display_name as admin, p.role, p.deactivated_at
-- from orgs o
-- left join profiles p on p.org_id = o.id and p.is_org_admin
-- order by o.name;
--
-- The people list the console will render for the AWIP demo org:
--
-- select display_name, role, is_org_admin, claimed_title, manager_id,
--        deactivated_at, invited_at
-- from profiles
-- where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
-- order by is_org_admin desc, role, display_name;
--
-- Nobody was hard-deleted by this migration (should equal your pre-run count):
--
-- select count(*) as profiles_total,
--        count(*) filter (where deactivated_at is not null) as deactivated
-- from profiles;
--
-- The two new functions resolve (returns false in the SQL editor because
-- auth.uid() does not resolve there — that is expected, not a failure):
--
-- select public.is_org_admin();
