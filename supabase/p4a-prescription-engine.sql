-- P-4A — Prescription Engine, part 1: detection → triage → pairing → queue.
-- Run this in the Supabase SQL editor, against the SAME project as
-- p1-org-foundation.sql / p2-conflict-xray.sql / p3-pattern-record-embeddings.sql
-- (additive — requires orgs, pattern_records.org_id + embedding,
-- framework_conflicts, and current_org_id()).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" / drop+
-- recreate for policies throughout.
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
-- Covers:
--   1. prescription_detections — first-class detection rows. Three source
--      types (conflict · coverage_gap · entity_signal), each row carrying its
--      subject entities, evidence record ids, and provenance, so P-4B's
--      manager gate / fidelity check / efficacy loop consume detections
--      without re-deriving them.
--   2. prescriptions — one triaged prescription per detection: the severity-
--      matched rung (1-4), the one-line rung rationale, the concrete pairing
--      (or an honest capture-first flag), and the ROI rank inputs.
--   3. search_pattern_records_by_query_for_org() — an org-pinned variant of
--      P-3's search RPC for the SERVICE-ROLE detection path only. P-3's
--      SECURITY INVOKER function scopes by the caller's RLS, which is correct
--      for user-facing /api/retrieve — but the detector runs as service role
--      (which bypasses RLS), so it needs an explicit org filter or a
--      cross-org row could masquerade as coverage. Locked down: EXECUTE is
--      revoked from anon/authenticated; only service role can call it.
--   4. RLS — org members read their own org's detections + prescriptions;
--      all writes are service-role only (the detect route), same lockdown
--      doctrine as framework_conflicts.

-- ═══ 1. PRESCRIPTION_DETECTIONS ════════════════════════════════════════════

create table if not exists prescription_detections (
  id                  uuid primary key default gen_random_uuid(),

  -- Org scoping. Detection runs WITHIN one org only, like the Conflict X-ray.
  org_id              uuid not null references orgs(id),

  source_type         text not null
                      check (source_type in ('conflict', 'coverage_gap', 'entity_signal')),

  -- Idempotency: one detection per underlying signal per org. Keys look like
  -- 'conflict:<conflict_id>', 'coverage:department:<normalized name>',
  -- 'entity:error_class:<normalized name>'. Re-running detection upserts
  -- against this and never duplicates a row.
  dedupe_key          text not null,

  -- The entities this detection is ABOUT (subset of the evidence records'
  -- entity maps): the contested process, the recurring error class, the
  -- uncovered department. Same shape as pattern_records.entity_map.
  subject_entities    jsonb not null default '[]',

  -- The pattern_records backing this detection — the evidence chain the
  -- detail view walks. uuid[] (not FK rows) keeps re-detection cheap; the
  -- API resolves them through the caller's RLS so nothing leaks.
  evidence_record_ids uuid[] not null default '{}',

  -- Set only for source_type='conflict' — ties back to the P-2 row whose
  -- provenance + resolution history this detection consumes.
  conflict_id         uuid references framework_conflicts(id) on delete cascade,

  -- Plain-language: what was detected (shown verbatim in the queue).
  summary             text not null,
  -- Extra detector context: near-miss similarity on a coverage gap, solver
  -- attribution on an entity signal, suppression notes.
  detail              text,

  -- Evidence record count — the recurrence input to the ROI rank.
  recurrence          int not null default 1,

  status              text not null default 'open'
                      check (status in ('open', 'prescribed', 'dismissed')),

  detected_at         timestamptz not null default now(),
  detected_by         text not null default 'prescription-detect-v1'
);

create unique index if not exists prescription_detections_dedupe_idx
  on prescription_detections (org_id, dedupe_key);

create index if not exists prescription_detections_org_idx
  on prescription_detections (org_id, status, detected_at desc);

-- ═══ 2. PRESCRIPTIONS ══════════════════════════════════════════════════════

create table if not exists prescriptions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id),

  -- One prescription per detection in P-4A (regenerate is P-4B).
  detection_id      uuid not null references prescription_detections(id) on delete cascade,

  -- ─── Triage: the severity-matched intervention ladder ───
  -- 1 Clarification card (2-min read) · 2 Micro-training (15-min session) ·
  -- 3 Designed session (facilitated) · 4 Full curriculum (multi-session).
  rung              int not null check (rung between 1 and 4),
  -- WHY this rung, in one line a human can read. Stored, never regenerated
  -- silently — this is the explainability requirement.
  rung_rationale    text not null,

  -- The gap, in plain language (usually the detection summary, sharpened).
  gap_summary       text not null,

  -- ─── Pairing: WHO HAS IT ↔ WHO NEEDS IT ───
  -- Experts who have it: [{ "user_id": uuid, "record_id": uuid }, ...].
  -- Two entries for a conflict (both authors), one for an entity signal
  -- (the solver), empty when capture_first.
  experts           jsonb not null default '[]',
  -- The honest no-expert case: nobody has authored on this territory, so the
  -- prescription is "capture first" — a codify target, never an invented
  -- facilitator.
  capture_first     boolean not null default false,
  -- WHO NEEDS IT: the team/dept/role from the gap or error evidence.
  audience          text not null,
  audience_entities jsonb not null default '[]',
  -- The concrete output: "Pair [expert] with [team] — [intervention]".
  pairing_summary   text not null,

  -- A prescription either names at least one expert or is honestly
  -- capture-first — never neither.
  constraint prescription_pairing_check check (
    capture_first or jsonb_array_length(experts) > 0
  ),

  -- ─── ROI rank (reuses the Thread ROI recurrence-first approach) ───
  recurrence        int not null,
  severity          int not null,
  roi_score         numeric not null,
  rank_rationale    text not null,

  -- P-4A only ever creates 'open'. approved/snoozed = P-4B manager gate;
  -- delivered/closed = P-4B delivery + efficacy loop.
  status            text not null default 'open'
                    check (status in ('open', 'approved', 'snoozed', 'delivered', 'closed')),

  triaged_by        text not null default 'prescription-triage-v1',
  created_at        timestamptz not null default now(),

  constraint prescriptions_one_per_detection unique (detection_id)
);

create index if not exists prescriptions_org_queue_idx
  on prescriptions (org_id, status, roi_score desc, created_at desc);

-- ═══ 3. ORG-PINNED SEMANTIC SEARCH (service-role detection path only) ═══════
-- P-3's search_pattern_records_by_query is SECURITY INVOKER on purpose — the
-- caller's RLS does the org scoping. The detector, however, runs as service
-- role, which bypasses RLS entirely; without an explicit org filter another
-- org's framework could satisfy a coverage check. This variant pins the org
-- in SQL. SECURITY DEFINER + revoked EXECUTE = only service role reaches it.
create or replace function search_pattern_records_by_query_for_org(
  target_org uuid,
  query_embedding vector(1536),
  match_count int default 5
)
returns table (id uuid, similarity float)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id,
    1 - (pr.embedding <=> query_embedding) as similarity
  from pattern_records pr
  where pr.org_id = target_org
    and pr.status = 'complete'
    and pr.embedding is not null
  order by pr.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function search_pattern_records_by_query_for_org(uuid, vector, int) from public;
revoke all on function search_pattern_records_by_query_for_org(uuid, vector, int) from anon;
revoke all on function search_pattern_records_by_query_for_org(uuid, vector, int) from authenticated;

-- ═══ 4. ROW LEVEL SECURITY ═════════════════════════════════════════════════

alter table prescription_detections enable row level security;
alter table prescriptions enable row level security;

-- Org members read their own org's detections — the evidence chain behind
-- every prescription must be inspectable ("why does it think that?").
drop policy if exists "org detections read" on prescription_detections;
create policy "org detections read" on prescription_detections
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

drop policy if exists "org prescriptions read" on prescriptions;
create policy "org prescriptions read" on prescriptions
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- No insert/update/delete policies on purpose: detection + triage write
-- through the service-role /api/prescriptions/detect route only, same
-- lockdown doctrine as framework_conflicts. P-4B's manager gate will add its
-- own service-role write path — not an RLS hole here.
