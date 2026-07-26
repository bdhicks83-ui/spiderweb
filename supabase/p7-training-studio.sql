-- P-7 — On-Demand Training Studio, Builds 1-4.
-- Run this in the Supabase SQL editor, against the SAME project as
-- p4a-prescription-engine.sql / p4b-prescription-engine-2.sql /
-- p6-manager-retraining-watch.sql (additive — requires orgs, profiles,
-- pattern_records, prescription_detections, prescriptions,
-- prescription_trainings, current_org_id(), is_manager_of()).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" / drop+
-- recreate for constraints and policies throughout.
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
-- WHY THIS EXISTS: the Prescription Engine (P-4A/P-4B) is DETECTION-triggered
-- — the brain notices a gap and prescribes. This adds the other trigger: a
-- leader has a problem RIGHT NOW and asks for training. Same downstream
-- engine (a leader request becomes a real prescription_detections +
-- prescriptions row, so the manager gate, the training generator, the
-- efficacy loop and escalation all apply unchanged), different front door.
--
-- Covers:
--   1. prescription_detections.source_type — extended with 'leader_request'.
--      EXTENDED, not repurposed: the three detector-produced types are
--      untouched; a fourth source simply means "a human triggered this."
--   2. training_requests — the leader-initiated request: the issue in plain
--      language, the audience, the agent's ranked format recommendation with
--      its cited rationale, the leader's choice (and whether it overrode the
--      recommendation), and the lifecycle through deploy.
--   3. training_format_outcomes — THE FORMAT-OUTCOME LOG. Stubbed here in
--      full so Build 5 (self-learning) and Build 6 (graph feed) never need a
--      second migration: every attempt records format used · outcome · what
--      changed · manual enhancements, plus two reserved graph-feed columns.
--   4. prescription_trainings.format_key — which library format an artifact
--      was generated in (the existing `format` column holds the display
--      name; the key is what Build 5 learns over).
--   5. is_manager() — SECURITY DEFINER "is the caller a manager at all"
--      companion to P-6's is_manager_of(target). Manager+ gate for creating
--      training.
--   6. RLS — org members READ; every write is service-role only behind the
--      /api/training-studio routes, same lockdown doctrine as P-4A/P-4B.

-- ═══ 1. DETECTION SOURCE — add the human trigger ═══════════════════════════

alter table prescription_detections drop constraint if exists prescription_detections_source_type_check;
alter table prescription_detections add constraint prescription_detections_source_type_check
  check (source_type in ('conflict', 'coverage_gap', 'entity_signal', 'leader_request'));

-- ═══ 2. IS_MANAGER() — the manager+ gate ═══════════════════════════════════
-- P-6 shipped is_manager_of(target) — "is the caller THIS person's manager."
-- The Studio needs the broader question: "is the caller a manager at all,"
-- which is true if they carry the profiles.role='manager' label OR anybody
-- reports to them. SECURITY DEFINER for the same reason as current_org_id():
-- a policy that queries profiles from a profiles-backed check would otherwise
-- recurse.

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from profiles where id = auth.uid() and role = 'manager')
    or exists (select 1 from profiles where manager_id = auth.uid());
$$;

-- ═══ 3. TRAINING_REQUESTS — the leader-initiated front door ════════════════

create table if not exists training_requests (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references orgs(id),

  -- WHO asked. A leader creates training for their own reports/teams; the
  -- API route enforces is_manager() before this row is ever written.
  requested_by          uuid not null references profiles(id),

  -- ─── The ask, in the leader's own words ───
  issue_text            text not null,

  -- ─── The audience (Build 1) ───
  audience_role         text,
  audience_team         text,
  audience_experience   text check (
                          audience_experience is null
                          or audience_experience in ('new', 'experienced', 'mixed')
                        ),
  -- Rendered one-liner ("Press operators — Second shift (mixed experience)"),
  -- stored so cards and prompts read identically.
  audience_summary      text not null,

  -- ─── Issue understanding (reuses the triage reasoning; the TRIGGER is the
  -- human, the reasoning is the same engine) ───
  issue_type            text,
  issue_restated        text,
  -- Entity-map-shaped subjects extracted from the issue text. THIS is what
  -- lets the existing efficacy loop watch a leader-initiated request without
  -- any change: the loop matches these keys against post-delivery
  -- broke/friction records exactly as it does for a detected gap.
  subject_entities      jsonb not null default '[]',
  understanding_note    text,

  -- ─── The bridge into the existing engine ───
  detection_id          uuid references prescription_detections(id) on delete set null,
  prescription_id       uuid references prescriptions(id) on delete set null,

  -- ─── Build 2: the L&D Format Agent's output ───
  -- Ranked: [{ format_key, rank, rationale, citations: [...], is_primary }]
  recommendations       jsonb not null default '[]',
  recommended_format    text,
  recommended_at        timestamptz,

  -- ─── Build 3: the leader's choice (override is a Build-5 learning signal) ───
  chosen_format         text,
  format_overridden     boolean not null default false,
  override_reason       text,
  format_chosen_by      uuid references profiles(id),
  format_chosen_at      timestamptz,

  -- ─── Lifecycle ───
  --   new        request created, understanding done
  --   recommended the format agent has ranked the options
  --   generated  training exists in the chosen format, awaiting the leader
  --   deployed   the leader approved it; the efficacy loop is watching
  --   closed     proven effective (or retired)
  status                text not null default 'new'
                        check (status in ('new', 'recommended', 'generated', 'deployed', 'closed')),

  current_training_id   uuid references prescription_trainings(id) on delete set null,

  -- Human-approves-before-deploy: WHO approved and WHEN, same record the
  -- manager gate keeps on a detected prescription.
  approved_by           uuid references profiles(id),
  approved_at           timestamptz,
  deployed_at           timestamptz,

  -- How many format attempts this issue has taken (Build 4 drive-until-solved).
  attempt_count         int not null default 0,

  created_at            timestamptz not null default now(),
  created_via           text not null default 'training-studio-v1'
);

create index if not exists training_requests_org_idx
  on training_requests (org_id, status, created_at desc);
create index if not exists training_requests_requester_idx
  on training_requests (requested_by, created_at desc);

-- Format keys are enum-driven in src/lib/training-formats.ts; this check is
-- the database's copy of the same set. Adding a format = one line here.
alter table training_requests drop constraint if exists training_requests_recommended_format_check;
alter table training_requests add constraint training_requests_recommended_format_check
  check (recommended_format is null or recommended_format in (
    'written_framework', 'hands_on_drill', 'scenario_walkthrough',
    'discussion_guide', 'job_aid', 'teach_back'
  ));

alter table training_requests drop constraint if exists training_requests_chosen_format_check;
alter table training_requests add constraint training_requests_chosen_format_check
  check (chosen_format is null or chosen_format in (
    'written_framework', 'hands_on_drill', 'scenario_walkthrough',
    'discussion_guide', 'job_aid', 'teach_back'
  ));

-- ═══ 4. PRESCRIPTION_TRAININGS — which format the artifact was built in ════
-- The existing `format` column carries the display name (it predates the
-- format library and holds rung labels like "Micro-training" for the
-- detected path). `format_key` is the machine key Build 5 learns over; null
-- on every pre-P-7 row, which is correct — those were rung-shaped, not
-- format-shaped.

alter table prescription_trainings add column if not exists format_key text;
alter table prescription_trainings drop constraint if exists prescription_trainings_format_key_check;
alter table prescription_trainings add constraint prescription_trainings_format_key_check
  check (format_key is null or format_key in (
    'written_framework', 'hands_on_drill', 'scenario_walkthrough',
    'discussion_guide', 'job_aid', 'teach_back'
  ));

-- ═══ 5. TRAINING_FORMAT_OUTCOMES — THE FORMAT-OUTCOME LOG ══════════════════
-- ⚠️ STUBBED IN FULL FOR BUILDS 5 + 6 ON PURPOSE. Builds 1-4 write every
-- column below except the two graph-feed reserves; Build 5 (self-learning)
-- reads this table to learn which formats actually work for which issue type
-- × audience, and Build 6 (graph feed) fills graph_node_id / graph_synced_at.
-- Stubbing now means neither later build needs a migration against live
-- pilot data.
--
-- ONE ROW PER ATTEMPT. A request that tries a written framework, doesn't
-- land, and then tries a hands-on drill produces TWO rows — that pair IS the
-- learning signal.

create table if not exists training_format_outcomes (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references orgs(id),

  -- On-demand attempts carry a request; the detected path can log here later
  -- with only a prescription_id (both nullable on purpose).
  training_request_id         uuid references training_requests(id) on delete cascade,
  prescription_id             uuid references prescriptions(id) on delete set null,
  training_id                 uuid references prescription_trainings(id) on delete set null,

  -- 1 for the first format tried, 2 for the re-recommended one, and so on.
  attempt                     int not null default 1,

  -- ─── The learning features (what Build 5 generalizes over) ───
  issue_type                  text,
  audience_role               text,
  audience_team               text,
  audience_experience         text,

  -- ─── The choice ───
  recommended_format          text,
  chosen_format               text not null,
  was_override                boolean not null default false,
  override_reason             text,
  -- The agent's full ranked output + citations for this attempt, verbatim.
  -- Build 5 needs the reasoning, not just the pick.
  agent_rationale             jsonb not null default '[]',

  -- ─── The outcome (Build 4 writes this from the efficacy loop) ───
  --   pending       delivered, still under watch
  --   effective     quiet across the window — it landed
  --   did_not_land  the target problem recurred after delivery
  --   inconclusive  retired/superseded before the watch could settle
  outcome                     text not null default 'pending'
                              check (outcome in ('pending', 'effective', 'did_not_land', 'inconclusive')),
  outcome_note                text,
  outcome_evidence_record_ids uuid[] not null default '{}',

  -- ─── Format-aware adaptation (Build 4) ───
  -- Set when this attempt didn't land and the system proposed a DIFFERENT
  -- modality rather than only escalating the rung.
  next_format_recommended     text,
  next_format_rationale       text,

  -- ─── Manual enhancements = effectiveness modifiers ───
  -- [{ "note": "added a real defective part to the drill", "added_by": uuid,
  --    "added_by_name": "...", "added_at": "..." }]
  -- A leader's hands-on improvement is a confound AND a signal: Build 5 must
  -- know an outcome was modified by a human before it credits the format.
  enhancements                jsonb not null default '[]',

  -- ─── Build 6 (graph feed) RESERVED — nothing writes these in Builds 1-4 ──
  graph_node_id               text,
  graph_synced_at             timestamptz,

  created_at                  timestamptz not null default now(),
  resolved_at                 timestamptz
);

create index if not exists training_format_outcomes_org_idx
  on training_format_outcomes (org_id, created_at desc);
create index if not exists training_format_outcomes_request_idx
  on training_format_outcomes (training_request_id, attempt);
-- The Build-5 read pattern: "for this issue type and audience, which formats
-- actually worked?"
create index if not exists training_format_outcomes_learning_idx
  on training_format_outcomes (org_id, issue_type, chosen_format, outcome);

alter table training_format_outcomes drop constraint if exists training_format_outcomes_chosen_format_check;
alter table training_format_outcomes add constraint training_format_outcomes_chosen_format_check
  check (chosen_format in (
    'written_framework', 'hands_on_drill', 'scenario_walkthrough',
    'discussion_guide', 'job_aid', 'teach_back'
  ));

-- One live row per (request, attempt) — a re-run of the same attempt upserts
-- rather than duplicating.
create unique index if not exists training_format_outcomes_attempt_idx
  on training_format_outcomes (training_request_id, attempt)
  where training_request_id is not null;

-- ═══ 6. ROW LEVEL SECURITY ═════════════════════════════════════════════════
-- Org members READ (the whole point is that training is visible to the org —
-- and "explainable, not black box" means the rationale is readable too).
-- Every write goes through a service-role API route that first proves
-- membership with the SESSION client and, for creation, is_manager().

alter table training_requests enable row level security;
alter table training_format_outcomes enable row level security;

drop policy if exists "org training requests read" on training_requests;
create policy "org training requests read" on training_requests
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

drop policy if exists "org format outcomes read" on training_format_outcomes;
create policy "org format outcomes read" on training_format_outcomes
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- No insert/update/delete policies on purpose — same lockdown doctrine as
-- prescription_detections / prescriptions / prescription_trainings.
