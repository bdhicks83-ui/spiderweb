-- Spiderweb Phase 3 schema — "It Reveals"
-- Run this in Supabase → SQL Editor.
--
-- Clusters are ephemeral (computed live by detect_clusters), so a framework
-- snapshots its cluster at draft time: hub insight id + the insight texts.

create table frameworks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  hub_insight_id   uuid not null references insights(id) on delete cascade,
  insight_snapshot jsonb not null,   -- array of insight texts the draft was built from
  name             text not null,
  description      text not null,
  writeup          text not null,    -- short AI-drafted write-up (deliberately thin)
  status           text not null default 'draft'
                   check (status in ('draft', 'approved', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One draft per cluster (hub) per user — re-drafting means replacing, not stacking.
create unique index frameworks_hub_unique
  on frameworks (user_id, hub_insight_id);

alter table frameworks enable row level security;

create policy "own frameworks" on frameworks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
