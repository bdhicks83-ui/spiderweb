-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5 — Step 3: Consistency / Integrity check at /approve
-- Run ONCE in Supabase → SQL Editor. Idempotent.
--
-- When a new insight contradicts an established approved pattern, the user
-- either revises it (→ becomes consistent, no event) or approves it as a
-- "genuine exception" (→ justification stored on the insight + a countable
-- contradiction event logged). We log events but do NOT yet act on them
-- (credibility suppression is a later step).
-- ─────────────────────────────────────────────────────────────────────────

-- Justification captured when an insight is approved despite contradicting a
-- prior pattern (the "genuine exception" path).
alter table insights add column if not exists exception_justification text;

-- One row per detected-and-approved contradiction. `resolved=false` marks a
-- standing (unresolved) contradiction the expert acknowledged but didn't
-- reconcile — that's the count that will later dampen the credibility score.
create table if not exists contradiction_events (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  new_insight_id          uuid references insights(id) on delete cascade,
  contradicted_insight_id uuid references insights(id) on delete set null,
  justification           text,
  resolved                boolean not null default false,
  created_at              timestamptz not null default now()
);

create index if not exists contradiction_events_user_idx
  on contradiction_events (user_id, resolved);

alter table contradiction_events enable row level security;

-- Users may read their own contradiction history; writes happen via the
-- service role in the backend approval route.
drop policy if exists "own contradiction read" on contradiction_events;
create policy "own contradiction read" on contradiction_events
  for select using (auth.uid() = user_id);
