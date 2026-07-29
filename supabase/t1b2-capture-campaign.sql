-- TIER 1 / BUILD 2 — CAPTURE CAMPAIGN
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires orgs, profiles, pattern_records, knowledge_gaps,
-- current_org_id(), is_manager(), is_manager_of(), is_org_admin()).
-- Safe to re-run (idempotent) throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--
-- Build 1 lets an admin put fifteen people on the account in ten minutes. Then
-- nothing happens. Nothing in this product ever ASKS any of them to codify
-- anything, and an org with zero frameworks has no retrieval, no conflicts, no
-- prescriptions, no gaps worth filling — every surface is dark. "Get the first
-- frameworks captured" is the setup-checklist item that stays unticked, and it
-- is the only one the admin cannot tick by themselves.
--
-- A capture campaign is the ask, made concrete and trackable: a named push
-- ("Little Rock line changeovers, before Chuck retires"), a list of specific
-- people, and a specific question for each of them. It is not a reminder
-- system. The unit is a QUESTION PUT TO A NAMED PERSON, because "please
-- document your knowledge" produces nothing and "how do you decide whether to
-- release the first run after a profile changeover?" produces a framework.
--
-- ⭐ AND THE FLYWHEEL CLOSES ON THE SUPPLY SIDE. P-9 made the demand side
-- durable: every question the org asked and could not answer is a row in
-- knowledge_gaps, ranked by how often it was asked. This build lets a manager
-- turn those rows directly into assignments. Demand → ask → capture →
-- retrieval → the next question. Nothing else in the product connects those
-- two ends.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Covers:
--   1. capture_campaigns — the named push. Org-readable.
--   2. capture_requests  — one question put to one person. NARROWER READ
--                          BOUNDARY than the campaign (see below).
--   3. RLS + indexes.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⭐ THE READ BOUNDARY — THE LOAD-BEARING DECISION IN THIS FILE
--
-- capture_campaigns → ORG-WIDE READ. "We are capturing changeover judgment
--                     this quarter" is a statement about the team, not about
--                     a person. Everyone should be able to see it.
--
-- capture_requests  → THE ASSIGNEE, THEIR DIRECT MANAGER, AND ORG ADMINS.
--                     NOT the org.
--
-- This is the P-8/P-9 lesson applied BEFORE it bites rather than after. A
-- request row carries, unavoidably, "this person was asked N things and has
-- captured none of them." Org-wide, that is a person-level negative signal on
-- a peer-visible surface — precisely the thing P-6 made manager-only and P-9
-- refused to put on the shared gap row (which carries a COUNT and never a
-- NAME). A capture campaign must not become a leaderboard of who is behind.
--
-- The aggregate counts a campaign shows ("6 of 15 captured") are computed
-- server-side from rows the CALLER can already read, so a non-manager peer
-- sees their own request and the campaign, never the roster.
--
-- ⚠️ There is also a DECLINE path, and it is not a courtesy. "I'm not the
-- right person for this — ask Dana" is a real, useful answer, and a system
-- that only offers done/not-done converts that signal into silence that looks
-- like non-compliance. declined is a first-class terminal status with a reason.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. CAPTURE_CAMPAIGNS ══════════════════════════════════════════════════

create table if not exists capture_campaigns (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references orgs(id),

  name         text not null,
  -- Why this campaign exists, in the owner's words. Shown to every assignee on
  -- their request: an ask with a reason attached gets answered, an ask without
  -- one reads as admin overhead.
  purpose      text,

  status       text not null default 'open'
               check (status in ('open', 'closed')),

  -- Soft target only. Nothing enforces it, nothing escalates on it, and it is
  -- never shown as overdue-red — a capture campaign that nags is a capture
  -- campaign people learn to ignore.
  due_on       date,

  created_by   uuid not null references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  closed_at    timestamptz,
  closed_by    uuid references profiles(id)
);

create index if not exists capture_campaigns_org_idx
  on capture_campaigns (org_id, status, created_at desc);

-- ═══ 2. CAPTURE_REQUESTS ═══════════════════════════════════════════════════
-- One question, put to one person. The unit of this whole build.

create table if not exists capture_requests (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references capture_campaigns(id) on delete cascade,
  -- Denormalized from the campaign so every RLS policy and every query can be
  -- org-scoped without a join. The API stamps it from the campaign, never from
  -- the client.
  org_id        uuid not null references orgs(id),

  person_id     uuid not null references profiles(id),

  -- ⭐ THE ASK ITSELF, in question form. Verbatim, never cleaned up: the
  -- phrasing is what determines whether the answer is a framework or a shrug.
  prompt        text not null,
  -- Lowercased / punctuation-stripped / whitespace-collapsed. Mirrors
  -- normalizeRequestPrompt() in src/lib/capture-campaign.ts — change one,
  -- change both. Exists ONLY to stop the same person being asked the same
  -- thing twice in one campaign.
  prompt_norm   text not null,

  -- Where the ask came from. 'gap' is the one that matters: this request
  -- exists because somebody actually asked this question and nobody could
  -- answer it. That provenance is shown to the assignee, because "4 people
  -- asked this and it wasn't there" is the most motivating sentence available.
  source        text not null default 'manual'
                check (source in ('manual', 'gap')),
  source_gap_id uuid references knowledge_gaps(id) on delete set null,

  -- open     → asked, not opened
  -- started  → they clicked into the interview (a soft claim, same shape as a
  --            P-9 gap claim; it is what the reconciler matches against)
  -- captured → a completed framework is linked
  -- declined → answered with "not me" / "this doesn't apply" + a reason.
  --            TERMINAL AND LEGITIMATE, not a failure state.
  status        text not null default 'open'
                check (status in ('open', 'started', 'captured', 'declined')),

  record_id     uuid references pattern_records(id) on delete set null,
  decline_reason text,

  started_at    timestamptz,
  captured_at   timestamptz,
  declined_at   timestamptz,

  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ⚠️ A PLAIN unique index, deliberately NOT partial. PostgREST cannot infer an
-- ON CONFLICT target from a partial unique index and every upsert against one
-- fails SILENTLY behind a console.warn — this cost a deploy cycle on P-7's
-- training_format_outcomes and is re-stated in P-8, P-9 and T1B1. The add-people
-- path genuinely upserts against this, so partial would have been the trap in
-- its purest form.
create unique index if not exists capture_requests_unique_idx
  on capture_requests (campaign_id, person_id, prompt_norm);

-- "What am I being asked?" — the assignee's queue, and the badge count.
create index if not exists capture_requests_person_idx
  on capture_requests (person_id, status, created_at desc);

-- "How is this campaign going?" — the owner's progress view.
create index if not exists capture_requests_campaign_idx
  on capture_requests (campaign_id, status);

-- The reconciler's scan: open claims in this org.
create index if not exists capture_requests_reconcile_idx
  on capture_requests (org_id, status, started_at);

-- ═══ 3. ROW LEVEL SECURITY ═════════════════════════════════════════════════
-- Reads only. Every WRITE is service-role behind an API route that has already
-- proven membership (and, for campaign writes, manager-or-admin) with the
-- SESSION client — the lockdown doctrine used by prescriptions,
-- learning_signals, knowledge_gaps and the T1B1 admin console.

alter table capture_campaigns enable row level security;

-- ORG-WIDE. A campaign is a statement about the team's priorities.
drop policy if exists "org capture campaigns read" on capture_campaigns;
create policy "org capture campaigns read" on capture_campaigns
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

alter table capture_requests enable row level security;

-- ⭐ NARROWER THAN THE ORG, ON PURPOSE. See the read-boundary note at the top:
-- org-wide, these rows are a leaderboard of who is behind, which is a
-- person-level negative signal on a peer-visible surface. Three readers only:
--   • the person who was asked            (it is their work)
--   • their DIRECT manager                (P-6's boundary, reused verbatim)
--   • an org admin                        (T1B1's capability)
-- A peer sees the campaign and their own request. Never the roster.
drop policy if exists "capture requests read" on capture_requests;
create policy "capture requests read" on capture_requests
  for select using (
    org_id = public.current_org_id()
    and (
      person_id = auth.uid()
      or public.is_manager_of(person_id)
      or public.is_org_admin()
    )
  );

-- No insert/update/delete policies on either table, on purpose.

-- ═══ 4. SANITY CHECKS (read-only — safe to run any time) ═══════════════════
--
-- Campaigns and how they're going:
--
-- select c.name, c.status, c.due_on,
--        count(r.*)                                        as asks,
--        count(r.*) filter (where r.status = 'captured')    as captured,
--        count(r.*) filter (where r.status = 'declined')    as declined,
--        count(r.*) filter (where r.status = 'open')        as untouched
-- from capture_campaigns c
-- left join capture_requests r on r.campaign_id = c.id
-- group by c.id, c.name, c.status, c.due_on
-- order by c.created_at desc;
--
-- ⭐ Demand-driven asks — how many requests came from a real unanswered question:
--
-- select source, count(*) from capture_requests group by 1;
--
-- The decline signal (this is intelligence, not failure):
--
-- select p.display_name, r.prompt, r.decline_reason
-- from capture_requests r
-- join profiles p on p.id = r.person_id
-- where r.status = 'declined'
-- order by r.declined_at desc;
--
-- Nothing was hard-deleted by this migration (it only CREATEs):
--
-- select count(*) from pattern_records;
