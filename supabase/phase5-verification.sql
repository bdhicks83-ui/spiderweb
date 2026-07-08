-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5 — Step 4: Identity & credential verification (Tier 1+2, AI-driven)
-- Run ONCE in Supabase → SQL Editor. Idempotent.
--
-- Adds LinkedIn + verification fields to profiles, plus a set of structured
-- "claimed_*" attributes that a FUTURE Cross-Expert Benchmarking / Org-Fit
-- Matching feature will need. We populate these fields here (the verification
-- step extracts them) but build NO comparison/matching logic yet.
--
-- verification_tier defaults to 1 and is the extension point for Tier 3
-- (real ID / degree verification via a third-party service) — not built here.
-- ─────────────────────────────────────────────────────────────────────────

alter table profiles add column if not exists linkedin_url  text;
alter table profiles add column if not exists linkedin_text text;   -- pasted profile content used for the AI comparison

alter table profiles
  add column if not exists verification_flag text not null default 'no_linkedin_provided';
alter table profiles drop constraint if exists profiles_verification_flag_check;
alter table profiles
  add constraint profiles_verification_flag_check
  check (verification_flag in ('consistent', 'partial_mismatch', 'no_linkedin_provided'));

alter table profiles add column if not exists verification_tier       int not null default 1;
alter table profiles add column if not exists verification_notes      text;
alter table profiles add column if not exists verification_checked_at timestamptz;

-- Structured attributes for future benchmarking / org-fit (matching deferred).
alter table profiles add column if not exists claimed_title           text;
alter table profiles add column if not exists claimed_industry        text;
alter table profiles add column if not exists claimed_seniority       text;
alter table profiles add column if not exists claimed_years_experience int;
