-- ═══ TRAINING DEMO — the "who else needs it" beat ══════════════════════════
-- Adds routing-target storage to training_requests. After a training is
-- generated, the Studio names the specific people (or the role) who share the
-- same gap, WITH THE REASON each one is flagged, and the leader routes it in
-- one click.
--
-- 🛡️ TRAINING-NOT-SURVEILLANCE (P-7 / Phase C doctrine): routing_targets
-- reasons are exposure / recency / role only — "holds the same seat," "the
-- fix never formally reached them," "the gap is seat-shaped." The writer
-- (src/lib/training-routing.ts) structurally cannot read performance or
-- coaching tables. Routing answers "who needs this training," never "who is
-- failing."
--
-- Plain columns, no new tables, no partial indexes (standing P-7/P-8 rule).
-- Read boundary: training_requests is already org-scoped by RLS ("org training
-- requests read") — these columns ride the same row policy, and no person-
-- level NEGATIVE signal is stored here (only "gets the training"), so the
-- P-8 widening check passes.
--
-- Paste this whole block into the Supabase SQL editor as ONE run.

alter table training_requests
  add column if not exists routing_targets jsonb not null default '[]'::jsonb;

alter table training_requests
  add column if not exists routed_at timestamptz;

alter table training_requests
  add column if not exists routed_by uuid references profiles(id);

comment on column training_requests.routing_targets is
  'The "who else needs it" beat: [{kind: person|role, user_id, label, detail, reason}]. Reasons are exposure/recency/role-framed only — never performance (training-not-surveillance).';
comment on column training_requests.routed_at is
  'When the leader clicked "Route it" — the who-else beat, confirmed by a human.';
comment on column training_requests.routed_by is
  'The manager who routed it. Human action, same doctrine as the approve gate.';
