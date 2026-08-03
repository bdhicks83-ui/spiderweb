-- Capture Your Judgment — branching interview (2026-08-03).
-- Adds pattern_records.capture_type: which of the three approved interview
-- branches produced this capture. Nullable BY DESIGN — every pre-existing row
-- stays NULL (= unknown / pre-branching / legacy Methodology Router session),
-- so there is no backfill step. Values mirror src/lib/elicitation.ts
-- CaptureType: current_issue | past_resolution | strategy.
--
-- Run this in the Supabase SQL editor as ONE pasted block, BEFORE deploying
-- the capture-branch code (the picker's insert writes this column).
-- Plain index, never partial (standing rule — the P-7 PostgREST onConflict
-- trap). No RLS change: the column rides on pattern_records' existing
-- policies.

alter table pattern_records add column if not exists capture_type text;

alter table pattern_records drop constraint if exists pattern_records_capture_type_check;
alter table pattern_records add constraint pattern_records_capture_type_check
  check (
    capture_type is null
    or capture_type in ('current_issue', 'past_resolution', 'strategy')
  );

create index if not exists pattern_records_capture_type_idx
  on pattern_records (capture_type);

comment on column pattern_records.capture_type is
  'Capture Your Judgment interview branch: current_issue | past_resolution | strategy. NULL = pre-branching or legacy Methodology Router session.';
