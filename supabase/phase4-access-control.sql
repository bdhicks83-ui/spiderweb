-- Spiderweb Phase 4 — "It Pays" (access control only, no billing)
-- Run this in Supabase → SQL Editor.
--
-- What this does:
--   1. Creates a `profiles` table (one row per auth user) with a `plan` column
--   2. Auto-creates a profile row whenever a new user signs up
--   3. Backfills profiles for users who already exist (i.e., you)
--   4. RLS: users can read their own profile, but NOT change their own plan
--      (plan changes happen manually in Supabase for now — Stripe comes later)

-- ─── 1. PROFILES: one row per user, holds their plan ───
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'free'
             check (plan in ('free', 'professional', 'executive', 'legacy', 'enterprise')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── 2. AUTO-CREATE profile on signup ───
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 3. BACKFILL existing users (safe to re-run) ───
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ─── 4. ROW LEVEL SECURITY ───
alter table profiles enable row level security;

-- Users can read their own profile (dashboard needs this to know the plan)
create policy "own profile read" on profiles
  for select using (auth.uid() = id);

-- NO insert/update/delete policies for regular users on purpose:
-- users must not be able to upgrade their own plan. The trigger above runs
-- as security definer, and manual plan changes in the Supabase dashboard
-- use the service role, which bypasses RLS.

-- ─── TESTING: set your plan manually ───
-- Run one of these in the SQL Editor (service role bypasses RLS):
--
-- update profiles set plan = 'free'         where id = (select id from auth.users where email = 'bdhicks83@gmail.com');
-- update profiles set plan = 'professional' where id = (select id from auth.users where email = 'bdhicks83@gmail.com');
-- update profiles set plan = 'executive'    where id = (select id from auth.users where email = 'bdhicks83@gmail.com');
-- update profiles set plan = 'legacy'       where id = (select id from auth.users where email = 'bdhicks83@gmail.com');
-- update profiles set plan = 'enterprise'   where id = (select id from auth.users where email = 'bdhicks83@gmail.com');
