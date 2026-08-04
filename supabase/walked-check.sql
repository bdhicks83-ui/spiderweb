-- "Already Walked" — capture-time duplicate + conflict check (2026-08-04).
--
-- One nullable jsonb column on pattern_records. The check runs exactly ONCE
-- per capture session, server-side, right after the first rung's answer
-- folds; this column is both the result AND the "already ran" latch:
--   NULL                          -> check has not run (legacy rows included —
--                                    the check keys off session text, not branch)
--   {"status":"skipped", ...}     -> deliberately not run (e.g. /codify?gap=
--                                    entry — retrieval already failed at 0.75
--                                    for that gap, so a >=0.90 duplicate is
--                                    near-impossible and the interrupt would
--                                    be noise)
--   {"status":"clear"|"duplicate"|"conflict"|"error", ...}
--                                 -> the stored verdict the completion step
--                                    acts on without re-computing
--
-- No new thresholds live here or anywhere: 0.75 (relevance) and 0.90
-- (near-duplicate) only — both measured bars, reused.
--
-- ⚠️ DEPLOY ORDER: run this BEFORE pushing the code — /api/codify writes
-- walked_check on ?gap= entry and /api/codify/answer writes it after the
-- first answer. (Same run-order rule as capture-branches.sql.)
-- The Supabase SQL editor runs a pasted script as ONE transaction — paste
-- this complete, as one block. No check constraint is touched.

alter table pattern_records
  add column if not exists walked_check jsonb;

comment on column pattern_records.walked_check is
  'Already Walked (2026-08-04): capture-time duplicate/conflict check result. NULL = check not yet run (one check per session, after the first folded answer). status: skipped | clear | duplicate | conflict | error. Bonus path only — a capture must never block on this.';
