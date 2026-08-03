-- Capture Your Judgment — branches 4-6 (2026-08-03).
-- Extends pattern_records.capture_type from three approved interview branches
-- to six: adds top_topic | common_mistake | tell_early. Values mirror
-- src/lib/elicitation.ts CaptureType. NULL stays legal BY DESIGN (= unknown /
-- pre-branching / legacy Methodology Router session) — no backfill step, and
-- every existing row is unaffected.
--
-- Check constraints cannot be altered in place, so this drops and recreates
-- the constraint in ONE transaction. Run this in the Supabase SQL editor as
-- ONE pasted block, BEFORE deploying the branch 4-6 code (deployed code
-- inserting the new values pre-migration will 500 on the old constraint).
-- Column, index, and RLS from capture-branches.sql are already in place —
-- nothing else changes here.

begin;

alter table pattern_records drop constraint if exists pattern_records_capture_type_check;
alter table pattern_records add constraint pattern_records_capture_type_check
  check (
    capture_type is null
    or capture_type in (
      'current_issue', 'past_resolution', 'strategy',
      'top_topic', 'common_mistake', 'tell_early'
    )
  );

comment on column pattern_records.capture_type is
  'Capture Your Judgment interview branch: current_issue | past_resolution | strategy | top_topic | common_mistake | tell_early. NULL = pre-branching or legacy Methodology Router session.';

commit;
