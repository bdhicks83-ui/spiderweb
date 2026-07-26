-- P-8 Phase 1 — ⭐ THE AUDIT QUERY.
--
-- "Every data point should feed the web" is a claim. This is the query that
-- makes it CHECKABLE. Paste it in the Supabase SQL editor (read-only, safe to
-- run any time).
--
-- learning_signals.consumed_by is a text[] that each Phase-2 reader appends its
-- own stable name to as it consumes a signal. An empty array means NOTHING has
-- learned from that row.
--
-- ⚠️ EXPECTED ANSWER AT THE END OF PHASE 1: every signal is unconsumed
-- (pct_unconsumed = 100.0 across the board). Phase 1 built WRITERS ONLY —
-- there are no readers yet, by decision. That result is correct, and it is
-- stated plainly rather than hidden: an audit that only ever reports good news
-- is not an audit.

-- ─── 1. The audit: what are we capturing, and what reads it? ───
select
  signal_type,
  source_surface,
  count(*)                                          as signals,
  count(*) filter (where consumed_by = '{}')        as unconsumed,
  round(
    100.0 * count(*) filter (where consumed_by = '{}') / count(*), 1
  )                                                 as pct_unconsumed,
  min(occurred_at)                                  as first_seen,
  max(occurred_at)                                  as last_seen
from learning_signals
group by 1, 2
order by unconsumed desc, signals desc;

-- ─── 2. Which readers exist at all (once Phase 2 lands)? ───
-- Returns zero rows after Phase 1. That is the point.
select reader, count(*) as signals_consumed
from learning_signals, unnest(consumed_by) as reader
group by 1
order by 2 desc;

-- ─── 3. Coverage by verdict — is the ledger only hearing bad news? ───
-- A ledger of nothing but negatives teaches a pessimistic prior. Both
-- directions are captured on purpose (fidelity confirms as well as rejects;
-- teach-back passes as well as fails; outcomes holding as well as regressed).
select signal_type, verdict, count(*)
from learning_signals
group by 1, 2
order by 1, 2;

-- ─── 4. Guardrail spot-check: no person-ish key ever reached `features`. ───
-- scrubFeatures() in src/lib/learning-ledger.ts enforces this at the write
-- layer; this is the independent check that it held. MUST return zero rows.
select id, signal_type, features
from learning_signals
where exists (
  select 1
  from jsonb_object_keys(features) as k
  where k ~* '(^|_)(user|person|profile|actor|learner|expert|author|manager|email|uid)(_|$)'
     or k ~* '(^|_)(name|names|display_name)$'
)
limit 50;
