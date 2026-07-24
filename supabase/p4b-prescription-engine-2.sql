-- P-4B — Prescription Engine, part 2: manager gate → expert fidelity →
-- training generation (3 altitudes) → teach-back → efficacy loop → regenerate.
-- Run this in the Supabase SQL editor, against the SAME project as
-- p4a-prescription-engine.sql (additive — requires prescriptions,
-- prescription_detections, profiles, orgs, current_org_id()).
-- Safe to re-run (idempotent): "if not exists" / drop+recreate for policies
-- and named constraints throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every ALTER/CREATE above it that looked like it succeeded.
-- Paste it all, run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- Covers:
--   1. profiles.role — the MINIMAL role model (DECISION 2026-07-23):
--      'manager' | 'member', default member, service-role write only. For
--      the demo any org member may approve, but WHO approved is always
--      recorded on the prescription. This is a label, not a permissions
--      system — do not grow it without a real customer requirement.
--   2. prescriptions — P-4B lifecycle columns: approval (who/when), snooze
--      (defers, never deletes — flag-never-block family), delivery, and the
--      efficacy state machine (watching → escalated | effective) with the
--      evidence that drove it.
--   3. prescription_fidelity — one row per (prescription × authoring
--      expert): "yes, that's how I think" / "not quite" + optional note.
--      NOTHING ships in an expert's name without a confirmed row. Capture-
--      first prescriptions never get rows here (nothing authored to confirm).
--   4. prescription_trainings — versioned training artifacts. Every
--      generate/regenerate INSERTS a new version (history is never
--      overwritten); each version carries its instructional strategy label
--      and the three audience altitudes (floor / supervisor / exec).
--   5. prescription_teachbacks — retrieval-practice checks: a FRESH scenario
--      generated from the framework, the learner's answer, and the scored
--      result. Feeds the efficacy picture (Kirkpatrick L2 next to the
--      loop's L4).
--   6. RLS — org members read all four surfaces; ALL writes stay
--      service-role only behind the API routes, same lockdown doctrine as
--      P-4A (prescription_detections / prescriptions have no write
--      policies either).

-- ═══ 1. PROFILES.ROLE — minimal manager label ══════════════════════════════

alter table profiles add column if not exists role text not null default 'member';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('manager', 'member'));

-- (Seeding Elena Ruiz as the demo org's manager happens in
-- scripts/seed-p4b.mjs — SQL can't reliably resolve auth emails here.)

-- ═══ 2. PRESCRIPTIONS — P-4B lifecycle columns ═════════════════════════════
-- Status flow stays open → approved/snoozed → delivered → closed (EXTENDED,
-- not repurposed — P-4A created 'open'; these columns record how a row moves
-- through the rest).

-- Manager gate: approve → 'approved' + who + when.
alter table prescriptions add column if not exists approved_by uuid references profiles(id);
alter table prescriptions add column if not exists approved_at timestamptz;

-- Snooze: 'snoozed' + a wake date. Defers, never deletes; the list API
-- lazily flips a past-wake row back to 'open'.
alter table prescriptions add column if not exists snoozed_by uuid references profiles(id);
alter table prescriptions add column if not exists snoozed_at timestamptz;
alter table prescriptions add column if not exists snoozed_until timestamptz;

-- Delivery: stamped when a training version is generated and shipped.
-- The efficacy loop scopes its re-scan to records dated AFTER this.
alter table prescriptions add column if not exists delivered_at timestamptz;

-- Efficacy state machine (DECISION 2026-07-23):
--   watching  — delivered, detector still watching post-delivery evidence
--   escalated — the same signal recurred on records dated after delivered_at
--               → the intervention didn't transfer; rung bumped one (capped
--               at 4), flagged for a redesigned attempt
--   effective — quiet across the 14-day window → Kirkpatrick Level 4
--               evidence, logged as proof; status moves to 'closed'
alter table prescriptions add column if not exists efficacy_status text;
alter table prescriptions drop constraint if exists prescriptions_efficacy_status_check;
alter table prescriptions add constraint prescriptions_efficacy_status_check
  check (efficacy_status is null or efficacy_status in ('watching', 'escalated', 'effective'));

alter table prescriptions add column if not exists efficacy_checked_at timestamptz;
-- Plain-language note explaining the current efficacy state. Wins-only
-- doctrine: this note names entities (error classes, machines, departments),
-- NEVER a person — no failure attribution ever rolls up to an individual.
alter table prescriptions add column if not exists efficacy_note text;
-- The post-delivery records that drove an escalation (evidence chain).
alter table prescriptions add column if not exists efficacy_evidence_record_ids uuid[] not null default '{}';
-- History: the rung this prescription held before its last auto-escalation.
alter table prescriptions add column if not exists escalated_from_rung int;

-- ═══ 3. PRESCRIPTION_FIDELITY — the expert's 60-second confirm ═════════════

create table if not exists prescription_fidelity (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id),
  prescription_id uuid not null references prescriptions(id) on delete cascade,

  -- The authoring expert (must appear in prescriptions.experts — enforced in
  -- the API route; the fidelity check belongs to the named author only).
  expert_user_id  uuid not null references profiles(id),
  -- The framework record being confirmed (the expert's record_id from
  -- prescriptions.experts).
  record_id       uuid not null,

  -- 'confirmed' = "yes, that's how I think" → training may generate/ship.
  -- 'rejected'  = "not quite" → NOTHING ships in their name; the note goes
  --               back with the prescription.
  decision        text not null check (decision in ('confirmed', 'rejected')),
  note            text,
  decided_at      timestamptz not null default now(),

  -- One live decision per expert per prescription; a changed mind upserts
  -- over the old row (decided_at moves with it).
  constraint prescription_fidelity_one_per_expert unique (prescription_id, expert_user_id)
);

create index if not exists prescription_fidelity_rx_idx
  on prescription_fidelity (prescription_id);

-- ═══ 4. PRESCRIPTION_TRAININGS — versioned artifacts, 3 altitudes ══════════

create table if not exists prescription_trainings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id),
  prescription_id uuid not null references prescriptions(id) on delete cascade,

  -- Version history: generate = v1, every regenerate INSERTS the next
  -- version. Prior versions are never overwritten — the redesign trail is
  -- part of the product ("a curriculum designer on tap, not a template").
  version         int not null,

  -- The instructional-design strategy label the generator chose (e.g.
  -- "contrast-led error clinic"). Regenerate is REQUIRED to pick a strategy
  -- that differs from every prior version's — a visibly different design,
  -- not a re-roll of the same text.
  strategy        text not null,

  -- Rung + format at generation time (the prescription's rung can move via
  -- escalation; each artifact records what it was built as).
  rung            int not null check (rung between 1 and 4),
  format          text not null,

  title           text not null,
  -- { "floor": {"title","body"}, "supervisor": {...}, "exec": {...} } —
  -- same substance, three framings/levels of abstraction.
  altitudes       jsonb not null,

  -- Why a regenerate was requested (null on v1).
  regenerate_note text,

  generated_by    text not null default 'prescription-training-v1',
  generated_at    timestamptz not null default now(),

  constraint prescription_trainings_version unique (prescription_id, version)
);

create index if not exists prescription_trainings_rx_idx
  on prescription_trainings (prescription_id, version desc);

-- ═══ 5. PRESCRIPTION_TEACHBACKS — retrieval practice, scored ═══════════════

create table if not exists prescription_teachbacks (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  training_id     uuid not null references prescription_trainings(id) on delete cascade,

  learner_user_id uuid not null references profiles(id),

  -- A FRESH scenario generated from the framework's signal/play/boundaries —
  -- never a restatement of the training's own examples (that would test
  -- recognition, not retrieval).
  scenario        text not null,
  question        text not null,

  -- Filled on submit.
  answer          text,
  -- 0-100, scored by the model against the framework (signal read · play
  -- applied · boundaries respected). passed = score >= 70.
  score           int check (score is null or (score between 0 and 100)),
  passed          boolean,
  feedback        text,
  missed          jsonb not null default '[]',

  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists prescription_teachbacks_rx_idx
  on prescription_teachbacks (prescription_id, created_at desc);

-- ═══ 6. ROW LEVEL SECURITY ═════════════════════════════════════════════════

alter table prescription_fidelity enable row level security;
alter table prescription_trainings enable row level security;
alter table prescription_teachbacks enable row level security;

drop policy if exists "org fidelity read" on prescription_fidelity;
create policy "org fidelity read" on prescription_fidelity
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

drop policy if exists "org trainings read" on prescription_trainings;
create policy "org trainings read" on prescription_trainings
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

drop policy if exists "org teachbacks read" on prescription_teachbacks;
create policy "org teachbacks read" on prescription_teachbacks
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- No insert/update/delete policies on purpose: every write goes through the
-- service-role API routes (approve / snooze / fidelity / training /
-- teachback / efficacy), same lockdown doctrine as P-4A. The routes prove
-- membership through the SESSION client's RLS read before the service client
-- writes anything.
