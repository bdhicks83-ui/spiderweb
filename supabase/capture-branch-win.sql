-- Capture Your Judgment — branch 7: "A win worth telling" (2026-08-04).
-- Extends pattern_records.capture_type from six approved interview branches
-- to seven: adds 'win'. Values mirror src/lib/elicitation.ts CaptureType.
-- NULL stays legal BY DESIGN (= unknown / pre-branching / legacy Methodology
-- Router session) — no backfill step, and every existing row is unaffected.
--
-- Branch 7 is the ONE branch that runs trigger_type='win' (the Win Column's
-- feed — see src/lib/elicitation.ts file-top comment). trigger_type needs no
-- migration: 'win' has been a legal trigger_type value since P-0.5.
--
-- Check constraints cannot be altered in place, so this drops and recreates
-- the constraint in ONE transaction. Run this in the Supabase SQL editor as
-- ONE pasted block, BEFORE deploying the branch 7 code (deployed code
-- inserting 'win' pre-migration will 500 on the old constraint).
-- Column, index, and RLS from capture-branches.sql are already in place —
-- nothing else changes here.

begin;

alter table pattern_records drop constraint if exists pattern_records_capture_type_check;
alter table pattern_records add constraint pattern_records_capture_type_check
  check (
    capture_type is null
    or capture_type in (
      'current_issue', 'past_resolution', 'strategy',
      'top_topic', 'common_mistake', 'tell_early',
      'win'
    )
  );

comment on column pattern_records.capture_type is
  'Capture Your Judgment interview branch: current_issue | past_resolution | strategy | top_topic | common_mistake | tell_early | win. NULL = pre-branching or legacy Methodology Router session. The win branch is the one branch that runs trigger_type=''win'' (Win Column feed).';

commit;
