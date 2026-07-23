-- P-0.5 — Methodology Router + Entity Map + Session Guardrails
-- Run this in the Supabase SQL editor, against the SAME project as
-- p0-pattern-records.sql (this migration is additive to that table).
-- Safe to re-run (idempotent): every change uses "if not exists" / drop+recreate
-- for constraints.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- Covers:
--   1. pattern_records.trigger_type   — which of the 5 router buttons was picked
--   2. pattern_records.method         — which methodology ran the ladder
--   3. pattern_records.entity_map     — Pattern Record field #8 (polymorphic)
--   4. pattern_records.session_start / framework_rendered_at /
--      time_to_first_value_seconds    — PM instrumentation (P-0.5 requirement)
--   5. profiles.persona               — exec | technical_director | sr_manager,
--      shades question wording only, never routing logic
--   6. scrub_status gets a third value — capture-time PII scrubbing is
--      deliberately OFF for P-0.5 (see DECISION-LOG 2026-07-22): names stay in
--      the entity map under org-scoped RLS, and are only stripped from export
--      surfaces (PDF) at generation time. The 'clean'/'scrubbed' values stay
--      for any rows written before this decision; new rows get the new value.

-- ═══ 1–2. TRIGGER TYPE + METHOD ═══════════════════════════════════════════

alter table pattern_records add column if not exists trigger_type text;
alter table pattern_records drop constraint if exists pattern_records_trigger_type_check;
alter table pattern_records
  add constraint pattern_records_trigger_type_check
  check (trigger_type is null or trigger_type in
    ('broke', 'win', 'concern', 'friction', 'judgment'));

alter table pattern_records add column if not exists method text;
alter table pattern_records drop constraint if exists pattern_records_method_check;
alter table pattern_records
  add constraint pattern_records_method_check
  check (method is null or method in
    ('5whys_fishbone', 'aar_success_case', 'premortem', 'a3', 'cdm'));

-- ═══ 3. ENTITY MAP — Pattern Record field #8 ══════════════════════════════
-- [{ "type": "equipment_asset"|"process"|"error_class"|"role_person"|"department",
--    "name": text, "detail": text|null }, ...]
-- Names ARE kept here (deliberate PII exception, org-scoped RLS covers it).

alter table pattern_records add column if not exists entity_map jsonb not null default '[]';

-- ═══ 4. SESSION GUARDRAILS + TIME-TO-FIRST-VALUE INSTRUMENTATION ══════════

alter table pattern_records add column if not exists session_start timestamptz not null default now();
alter table pattern_records add column if not exists framework_rendered_at timestamptz;
alter table pattern_records add column if not exists time_to_first_value_seconds int;

-- ═══ 5. PERSONA — carried on the expert's profile, shades wording only ════

alter table profiles add column if not exists persona text;
alter table profiles drop constraint if exists profiles_persona_check;
alter table profiles
  add constraint profiles_persona_check
  check (persona is null or persona in ('exec', 'technical_director', 'sr_manager'));

-- ═══ 6. SCRUB STATUS — add the new value, keep old rows valid ═════════════

alter table pattern_records drop constraint if exists pattern_records_scrub_status_check;
alter table pattern_records
  add constraint pattern_records_scrub_status_check
  check (scrub_status in ('clean', 'scrubbed', 'not_scrubbed_by_design'));
alter table pattern_records alter column scrub_status set default 'not_scrubbed_by_design';

-- ═══ COMPLETION GATE — field #8 (entity_map) now mandatory too ════════════
-- A record may only be marked complete when all 6 original required fields
-- AND the entity map (at least one entity) are populated, and we know which
-- trigger/method produced it.

alter table pattern_records drop constraint if exists pattern_record_complete_check;
alter table pattern_records
  add constraint pattern_record_complete_check check (
    status <> 'complete' or (
      context_summary is not null
      and trigger_signal is not null
      and signal_detail  is not null
      and judgment       is not null
      and rationale      is not null
      and boundaries     is not null
      and jsonb_array_length(entity_map) > 0
      and trigger_type is not null
      and method       is not null
    )
  );
