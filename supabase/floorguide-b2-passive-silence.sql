-- FLOOR GUIDE / PHASE B2 — PASSIVE CANDIDATES ARE SILENT UNTIL A HUMAN ACTS
-- Run this in the Supabase SQL editor, AFTER floorguide-b-emergent-insight.sql.
-- Idempotent (drop + recreate one policy). Nothing else changes.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS — a copy decision that turned out to be a data decision.
--
-- Phase B shipped with the design doc's original recommendation: tell a
-- contributor when the system NOTICES something they said, because being noticed
-- is motivating. Brian reversed it on 2026-07-30, and the reasoning is worth
-- keeping because it is not a matter of taste:
--
--   Most passive candidates will be DISMISSED. Dismissal is silent by design
--   (the positive-only rule — nobody is ever told their idea was turned down).
--   So notifying at creation produces this sequence:
--
--       "You spotted something. Leadership is taking a look."
--       ... then nothing. Forever.
--
--   Being told you were noticed and then hearing nothing is WORSE than never
--   being told. It reads as having been quietly passed over, which is exactly
--   the feeling the positive-only rule exists to prevent.
--
-- An EXPLICIT share is the opposite case and keeps its instant confirmation:
-- they took an action, so a receipt is honesty about where it went, not news.
--
-- ⭐ WHY THIS IS SQL AND NOT A `WHERE` CLAUSE.
-- Same argument as DECISION 1 in the first migration. The application half is
-- already done (notified_at is only stamped for explicit shares, so the badge
-- stays dark). But an un-acted passive candidate would still be READABLE by its
-- author — so anybody landing on /insights/mine for another reason would find a
-- "we noticed you" row sitting there, and the promise would be broken by
-- navigation rather than by notification.
--
-- Putting it in the policy means the row is not merely un-advertised, it is
-- invisible. A future route, a future export, or a forgotten filter cannot
-- surface it.
-- ═══════════════════════════════════════════════════════════════════════════

drop policy if exists "own candidate insights positive only" on candidate_insights;
create policy "own candidate insights positive only"
  on candidate_insights for select
  using (
    user_id = auth.uid()
    -- The positive-only rule: no dismissal is ever visible to its author.
    and status <> 'dismissed'
    -- ⭐ And a passive candidate is invisible to its author until a human has
    --    acted on it. An explicit share is visible immediately — they sent it,
    --    and hiding their own submission from them would be absurd.
    and (source = 'explicit' or status in ('promoted', 'routed'))
  );

-- ═══ SANITY CHECKS (read-only) ═════════════════════════════════════════════
--
-- The policy text now carries the source condition:
--
-- select policyname, qual from pg_policies
-- where tablename = 'candidate_insights' and cmd = 'SELECT'
-- order by policyname;
--
-- Which rows are invisible to their own author right now (expect: every passive
-- candidate that has not been promoted or routed):
--
-- select id, source, status, notified_at, left(raw_input, 60) as idea
-- from candidate_insights
-- where source = 'passive' and status not in ('promoted', 'routed')
-- order by created_at desc;
--
-- ⭐ THE PROOF, and it needs a browser because RLS is the thing being tested:
-- log in as the contributor and open /insights/mine. An un-acted passive
-- candidate must not appear, and the nav badge must not light. Then promote it
-- as an admin and reload: both appear. A service-role script cannot prove this —
-- it bypasses the policy, which is the whole mechanism.
