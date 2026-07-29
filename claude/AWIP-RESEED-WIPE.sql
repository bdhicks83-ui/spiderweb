-- ═══════════════════════════════════════════════════════════════════════
-- AWIP RESEED — STEP 1: WIPE MERIDIAN DEMO CONTENT (org-scoped, one block)
-- Paste the WHOLE file into the Supabase SQL editor and run ONCE.
-- The editor runs it as ONE transaction: any safety check failing rolls
-- back EVERYTHING.
--
-- Scope: content rows of demo org 0722f2f8-ecff-4ae3-81ea-1350454e9d54
--        ("Meridian Precision Manufacturing (DEMO)") ONLY.
-- NOT touched: auth users · orgs row · profiles rows · the
--   bdhicks83+test1@gmail.com account and its 29 sources / 1,248
--   cascade-dependent insights · the main account's data.
-- Verified live 2026-07-28 (scripts/diag-awip-reseed-introspect.mjs):
--   demo users own ZERO rows in sources/insights/frameworks/ask_sessions/
--   query_gaps/credibility_scores/contradiction_events — the legacy-
--   pipeline deletes below are defensive no-ops kept for completeness.
-- ═══════════════════════════════════════════════════════════════════════

-- ── SAFETY GATE: abort the whole transaction if the world has shifted ──
do $$
declare
  v_org_name  text;
  v_t1_src    int;
  v_t1_dep    int;
begin
  select name into v_org_name
    from orgs where id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
  if v_org_name is distinct from 'Meridian Precision Manufacturing (DEMO)' then
    raise exception 'SAFETY ABORT: org 0722f2f8 is % — expected Meridian demo org', coalesce(v_org_name, 'MISSING');
  end if;

  select count(*) into v_t1_src
    from sources where user_id = 'd7addc39-cb5f-4d0b-a029-7a6e9007407e';
  if v_t1_src <> 29 then
    raise exception 'SAFETY ABORT: +test1 has % sources, expected 29 — cascade landscape changed, re-verify before wiping', v_t1_src;
  end if;

  select count(*) into v_t1_dep
    from insights i
    join sources s on s.id = i.source_id
   where s.user_id = 'd7addc39-cb5f-4d0b-a029-7a6e9007407e';
  if v_t1_dep <> 1248 then
    raise exception 'SAFETY ABORT: % insights hang off +test1 sources, expected 1248 — re-verify before wiping', v_t1_dep;
  end if;
end $$;

-- ── LEGACY INSIGHT PIPELINE (demo users own 0 rows — defensive no-ops) ──
-- connections BEFORE insights (FK on insight_a_id AND insight_b_id).
delete from connections
 where insight_a_id in (select id from insights where user_id in (
         '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
         '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
         '9af4a566-b4cf-4bd2-a025-bb032a444ad7'))
    or insight_b_id in (select id from insights where user_id in (
         '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
         '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
         '9af4a566-b4cf-4bd2-a025-bb032a444ad7'));

delete from frameworks where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from insights where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from sources where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from ask_sessions where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from query_gaps where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from credibility_scores where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from contradiction_events where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from org_fit_assessments where expert_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from growth_snapshots where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

delete from voice_profiles where user_id in (
  '876f3bdb-87cd-4750-886e-fc8ee5cb0a0b','7f30f60f-2984-42e9-b976-98c3cfadcbc3',
  '3c3ade58-a60c-48fe-b8a4-11aa7301806c','c0c8dd9b-a311-44e0-9d71-967e1f70d5ce',
  '9af4a566-b4cf-4bd2-a025-bb032a444ad7');

-- ── TRACK-B DEMO CONTENT (org-scoped, children first) ──────────────────
-- P-9 gaps
delete from knowledge_gap_askers  where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from knowledge_gaps        where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';

-- P-4B / P-7 training + prescription lifecycle (leaves before roots)
delete from prescription_teachbacks   where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from training_format_outcomes  where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from prescription_trainings    where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from prescription_fidelity     where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from training_requests         where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from prescriptions             where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from prescription_detections   where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';

-- P-6 coaching + P-8 ledger
delete from retraining_signals  where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from learning_signals    where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';

-- P-2 conflicts, then the records themselves
delete from framework_conflicts where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
delete from pattern_records     where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';

-- ── VERIFICATION (returned as the query result) ────────────────────────
-- Every "demo org leftover" row must be 0; the two +test1 rows must be
-- 29 and 1248; insights_global must still be 1272.
select 'pattern_records (demo org leftover)' as check, count(*)::text as value from pattern_records where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'framework_conflicts leftover',        count(*)::text from framework_conflicts       where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'prescription_detections leftover',    count(*)::text from prescription_detections   where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'prescriptions leftover',              count(*)::text from prescriptions             where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'prescription_fidelity leftover',      count(*)::text from prescription_fidelity     where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'prescription_trainings leftover',     count(*)::text from prescription_trainings    where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'prescription_teachbacks leftover',    count(*)::text from prescription_teachbacks   where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'training_requests leftover',          count(*)::text from training_requests         where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'training_format_outcomes leftover',   count(*)::text from training_format_outcomes  where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'retraining_signals leftover',         count(*)::text from retraining_signals        where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'learning_signals leftover',           count(*)::text from learning_signals          where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'knowledge_gaps leftover',             count(*)::text from knowledge_gaps            where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select 'knowledge_gap_askers leftover',       count(*)::text from knowledge_gap_askers      where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54'
union all select '+test1 sources (MUST be 29)',         count(*)::text from sources                   where user_id = 'd7addc39-cb5f-4d0b-a029-7a6e9007407e'
union all select '+test1-parented insights (MUST be 1248)', count(*)::text from insights i join sources s on s.id = i.source_id where s.user_id = 'd7addc39-cb5f-4d0b-a029-7a6e9007407e'
union all select 'insights_global (MUST be 1272)',      count(*)::text from insights
union all select 'demo profiles kept (MUST be 5)',      count(*)::text from profiles where org_id = '0722f2f8-ecff-4ae3-81ea-1350454e9d54';
