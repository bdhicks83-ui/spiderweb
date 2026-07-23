-- P-2 — Conflict X-ray: first-class conflict rows.
-- Run this in the Supabase SQL editor, against the SAME project as
-- p1-org-foundation.sql (additive — requires orgs, pattern_records.org_id,
-- and current_org_id() from that migration).
-- Safe to re-run (idempotent): "if not exists" / drop+recreate throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every CREATE above it that looked like it succeeded. Paste it
-- all, run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ⭐ LOCKED DECISION (2026-07-23) — CONFLICT-FIRE BEHAVIOR: SURFACE-WITH-
-- WARNING. A conflicted framework is NEVER held out of the brain. It stays
-- live and retrievable, wearing a "⚠️ Contested" badge that links to both
-- sides + the resolution thread. Resolution clears the badge. This extends
-- the shipped Phase 7 flag-never-block doctrine. There is deliberately NO
-- hold/quarantine state anywhere in this schema: a conflict row only ever
-- ANNOTATES the two records — it never gates their visibility (the
-- "org library read" RLS policy on pattern_records is untouched by P-2).
--
-- Covers:
--   1. framework_conflicts — one row per detected cross-user conflict.
--      First-class so P-4's Prescription Engine can consume conflicts (and
--      their resolution history) as a detection input.
--   2. RLS — org members read their own org's conflicts; all writes are
--      service-role only (the detector and the resolve route), same
--      lockdown doctrine as profiles/orgs.

-- ═══ 1. FRAMEWORK_CONFLICTS ════════════════════════════════════════════════

create table if not exists framework_conflicts (
  id                    uuid primary key default gen_random_uuid(),

  -- Org scoping. Detection runs WITHIN one org only — never across orgs —
  -- and this column + the RLS policy below make cross-org leakage
  -- structurally impossible rather than merely avoided.
  org_id                uuid not null references orgs(id),

  -- The two conflicted Pattern Records, by different authors, same org.
  -- Ordered a < b (enforced below) so one pair can never appear twice as
  -- (a,b) and (b,a).
  record_a_id           uuid not null references pattern_records(id) on delete cascade,
  record_b_id           uuid not null references pattern_records(id) on delete cascade,

  status                text not null default 'open'
                        check (status in ('open', 'resolved')),

  -- ─── Detection provenance (P-4 consumes this as detection history) ───
  detected_at           timestamptz not null default now(),
  detected_by           text not null default 'conflict-xray-v1',
  -- The shared territory both frameworks claim (detector's words).
  territory             text,
  -- WHY the detector fired: the overlapping-boundaries + opposing-judgment
  -- reading, in plain language. Shown verbatim in the review UI.
  rationale             text not null,

  -- ─── Resolution (Build 3) ───
  -- The four options. Every one of them RESOLVES the conflict row and
  -- clears the contested badge — escalate is a handoff to a human owner,
  -- not a quarantine.
  resolution            text
                        check (resolution is null or resolution in
                          ('sharpen_boundaries', 'reconcile', 'supersede', 'escalate')),
  resolution_note       text,
  -- Belief-revision-style depth gate result for framework-changing
  -- resolutions (sharpen/reconcile/supersede). Null for escalate (no gate)
  -- and for conflicts not yet resolved. A FALSE here with status still
  -- 'open' means a shallow note was recorded but did not clear the gate.
  resolution_depth_ok   boolean,
  -- For 'supersede': which of the two records now carries the territory.
  superseding_record_id uuid references pattern_records(id) on delete set null,
  resolved_by           uuid references auth.users(id) on delete set null,
  resolved_at           timestamptz,

  -- Normalized pair order → the unique index below fully dedupes.
  constraint framework_conflict_pair_order check (record_a_id < record_b_id),

  -- A resolved row must say how, by whom, and when — this is P-4's history.
  constraint framework_conflict_resolved_check check (
    status <> 'resolved'
    or (resolution is not null and resolved_by is not null and resolved_at is not null)
  )
);

create unique index if not exists framework_conflicts_pair_idx
  on framework_conflicts (record_a_id, record_b_id);

create index if not exists framework_conflicts_org_idx
  on framework_conflicts (org_id, status, detected_at desc);

-- Badge lookups go record → open conflicts; index both sides.
create index if not exists framework_conflicts_record_a_idx
  on framework_conflicts (record_a_id) where status = 'open';
create index if not exists framework_conflicts_record_b_idx
  on framework_conflicts (record_b_id) where status = 'open';

-- ═══ 2. ROW LEVEL SECURITY ═════════════════════════════════════════════════

alter table framework_conflicts enable row level security;

-- Org members read their own org's conflicts — nothing else. Uses the
-- SECURITY DEFINER helper from P-1 (any policy that queried profiles
-- directly from a profiles-adjacent context risks the recursion error).
drop policy if exists "org conflicts read" on framework_conflicts;
create policy "org conflicts read" on framework_conflicts
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- No insert/update/delete policies on purpose: detection writes and
-- resolution writes both go through service-role API routes
-- (/api/conflicts/detect and /api/conflicts/[id]/resolve), same lockdown
-- doctrine as profiles.plan/persona and orgs.
