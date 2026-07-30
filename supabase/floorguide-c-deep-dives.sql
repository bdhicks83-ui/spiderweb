-- FLOOR GUIDE / PHASE C — ADMIN-REQUESTED DEEP DIVES + TRAINING INTELLIGENCE
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires profiles, orgs, pattern_records, candidate_insights,
-- training_requests, current_org_id(), is_org_admin(), is_manager_of()).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" /
-- drop+recreate for named constraints and policies throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back.
-- Paste it all, run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--
-- Phase A protected a promise: what a contributor asks in Floor Guide is
-- never recorded against their name. Phase B added recognition: what a
-- contributor KNOWS can reach the experts, positive-only.
--
-- Phase C is the third and deliberately DIFFERENT thing: an admin asks a
-- contributor how they actually handle X, and the answer IS assessed. It is
-- compared with the codified playbook; where it differs, that difference may
-- be seen by the person's manager and may lead to training. That is grading,
-- and it is legitimate ONLY because the ask says so before the person types
-- a word (DECISION 1, Brian's call — the disclosure is load-bearing product).
--
-- ⭐⭐ THE SEPARATION RULE (DECISION 2, the spine of this build):
-- Floor Guide and deep dives are two different promises and they must never
-- share a screen, a route, or a write path. Nothing in this migration touches
-- any Floor Guide table or path; the ONLY writers of these two tables are the
-- /api/deep-dives routes (service-role — there are NO session write policies);
-- and a deep-dive row can only exist downstream of an admin creating a request.
-- A Floor Guide question cannot produce a row here because no code path
-- connects them — and scripts/verify-floor-guide-c.mjs proves it behaviourally.
--
-- Covers:
--   1. deep_dive_requests   → the admin's ask, with its live target list
--   2. deep_dive_responses  → the answer + the divergence reading + links to
--                             both downstream lenses (candidate / training)
--   3. RLS                  → admin sees the org's · the targeted contributor
--                             sees their own ask · the responder sees their own
--                             answer · ⭐ the responder's MANAGER sees the
--                             response (DECISION 1, manager-visible)
--   4. candidate_insights.source gains 'deep_dive' (the second lens)
--   5. Sanity checks (read-only)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⭐ DECISION 5 IN THE SCHEMA: A DECLINE LEAVES NO RECORD.
--
-- There is no 'declined' status, no declined_at, no decline table. The target
-- list is a LIVE uuid[] on the request; declining removes your id from it and
-- writes nothing else, anywhere. `sent_to_count` is frozen at creation so the
-- admin's view never exposes the live list — an admin sees the ask and the
-- answers that arrived, never who hasn't answered and never who took
-- themselves off. A decline is indistinguishable from not-yet, by design:
-- a mandatory ask is a performance review with extra steps, and a TRACKED
-- optional ask is a mandatory one with deniability.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. THE REQUEST ═════════════════════════════════════════════════════════

create table if not exists deep_dive_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  -- The admin who asked. Named on the contributor's screen — the disclosure
  -- says who is asking, so this is not optional.
  created_by uuid not null references profiles(id),

  -- The ask itself, in the admin's words: "how do you actually handle X".
  topic text not null,

  -- The codified judgment to compare answers against. Optional — an ask with
  -- no anchor still collects answers; its divergence lens honestly reads
  -- "nothing codified to compare against."
  anchor_record_id uuid references pattern_records(id) on delete set null,

  -- ⭐ THE LIVE TARGET LIST (see DECISION 5 above). Who can currently see and
  -- answer this ask. Answering removes you; declining removes you; the two are
  -- indistinguishable here. Not a foreign key (arrays can't be) — the create
  -- route validates every id against profiles before writing.
  targets uuid[] not null default '{}',

  -- Frozen at creation. The only "how many were asked" number any surface
  -- shows, so the live list's shrinkage is never legible to anybody.
  sent_to_count integer not null default 0,

  status text not null default 'open' check (status in ('open', 'closed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table deep_dive_requests enable row level security;

create index if not exists deep_dive_requests_org_idx
  on deep_dive_requests (org_id, status, created_at desc);

-- The contributor's badge read ("is anything asked of me"). GIN because the
-- predicate is array containment.
create index if not exists deep_dive_requests_targets_idx
  on deep_dive_requests using gin (targets);

-- ═══ 2. THE RESPONSE ════════════════════════════════════════════════════════

create table if not exists deep_dive_responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  request_id uuid not null references deep_dive_requests(id) on delete cascade,

  -- The responder. Named ON PURPOSE and disclosed up front — this is the one
  -- surface in the product where a person's answer is assessed under their
  -- name (DECISION 1). Same reference shape as candidate_insights.user_id.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Their words, verbatim. Both lenses and every human reader work from this.
  answer text not null,

  -- ⭐ LENS 1 — the divergence reading. NULL means the reading did not run
  -- (model unavailable — fail-open; the answer still lands and says so).
  --   aligned  → matches the anchored playbook
  --   diverges → does it differently; divergence_note carries the specific
  --              point of difference, which is the useful part
  --   no_basis → nothing to honestly compare: no anchor was attached
  --              (compared_record_id null) or the answer and the playbook
  --              aren't about the same call (compared_record_id set)
  divergence text check (divergence in ('aligned', 'diverges', 'no_basis')),
  divergence_note text,
  -- Which record the reading actually compared against, at answer time. The
  -- request's anchor can be edited or deleted later; the reading's basis is a
  -- fact about the past and is recorded as one.
  compared_record_id uuid references pattern_records(id) on delete set null,
  divergence_detector text,

  -- ⭐ LENS 2 — the same answer through Phase B's candidate detection. Set when
  -- the answer cleared the bar and produced a candidate_insights row. The
  -- whole thesis of the contributor tier on one row: the floor either needs
  -- teaching (lens 1) or has something to teach (lens 2), and a HUMAN decides
  -- which — this table stores readings, never verdicts.
  candidate_insight_id uuid references candidate_insights(id) on delete set null,

  -- Where a diverging answer was routed into the EXISTING training engine
  -- (P-7 Training Studio). A link, not a copy — efficacy, escalation and
  -- format learning all live on the training side, untouched.
  training_request_id uuid references training_requests(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table deep_dive_responses enable row level security;

-- ⚠️ PLAIN unique index (the P-7 PostgREST rule: never point an upsert at a
-- partial index). One answer per person per ask.
create unique index if not exists deep_dive_responses_one_per_person_idx
  on deep_dive_responses (request_id, user_id);

create index if not exists deep_dive_responses_org_idx
  on deep_dive_responses (org_id, created_at desc);

create index if not exists deep_dive_responses_person_idx
  on deep_dive_responses (user_id, created_at desc);

-- ═══ 3. RLS ═════════════════════════════════════════════════════════════════
--
-- NO write policy for session clients on either table — every write goes
-- through /api/deep-dives on the service-role client, same shape as
-- candidate_insights, knowledge_gaps and capture_requests. The route decides
-- what a request or a response is; PostgREST accepts nothing from a browser.

-- The manager path needs a SECURITY DEFINER helper: a policy on
-- deep_dive_requests that subqueries deep_dive_responses would evaluate that
-- subquery under the CALLER's RLS, and a manager has no other path to the
-- responses on a request they weren't part of. The definer function reads
-- past RLS and asks exactly one question: does this request carry a response
-- from somebody the caller manages? (is_manager_of() is itself the P-6
-- SECURITY DEFINER relation check — reused, not re-implemented.)
create or replace function public.manages_deep_dive_responder(req_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from deep_dive_responses r
    where r.request_id = req_id
      and public.is_manager_of(r.user_id)
  );
$$;

revoke execute on function public.manages_deep_dive_responder(uuid) from anon;

-- ── deep_dive_requests ──

drop policy if exists "org admin reads deep dive requests" on deep_dive_requests;
create policy "org admin reads deep dive requests"
  on deep_dive_requests for select
  using (
    org_id = public.current_org_id()
    and public.is_org_admin()
  );

-- The targeted contributor sees the ask put to them, and keeps seeing an ask
-- they answered (their own answer page needs the topic). Somebody who
-- declined is no longer in targets and has no response — the ask disappears
-- for them, which is the point.
drop policy if exists "targeted contributor reads their ask" on deep_dive_requests;
create policy "targeted contributor reads their ask"
  on deep_dive_requests for select
  using (
    auth.uid() = any (targets)
    or exists (
      select 1 from deep_dive_responses r
      where r.request_id = deep_dive_requests.id
        and r.user_id = auth.uid()
    )
  );

-- ⭐ DECISION 1: the manager of a responder may read the request (they need
-- the topic to make sense of the response RLS already shows them).
drop policy if exists "manager of responder reads the ask" on deep_dive_requests;
create policy "manager of responder reads the ask"
  on deep_dive_requests for select
  using (
    org_id = public.current_org_id()
    and public.manages_deep_dive_responder(id)
  );

-- ── deep_dive_responses ──

drop policy if exists "own deep dive response" on deep_dive_responses;
create policy "own deep dive response"
  on deep_dive_responses for select
  using (user_id = auth.uid());

drop policy if exists "org admin reads deep dive responses" on deep_dive_responses;
create policy "org admin reads deep dive responses"
  on deep_dive_responses for select
  using (
    org_id = public.current_org_id()
    and public.is_org_admin()
  );

-- ⭐ DECISION 1, in the data: a responder's direct manager sees the response,
-- including the divergence reading. This is the deliberate, DISCLOSED
-- departure from the Floor Guide promise — the contributor read the words
-- "your manager may see where it differs" above the box before they typed.
-- Peers structurally cannot: there is no org-member policy on this table.
drop policy if exists "manager reads their report's response" on deep_dive_responses;
create policy "manager reads their report's response"
  on deep_dive_responses for select
  using (
    org_id = public.current_org_id()
    and public.is_manager_of(user_id)
  );

-- ═══ 4. THE SECOND LENS — candidate_insights.source gains 'deep_dive' ═══════
--
-- A deep-dive answer that clears Phase B's detection bar produces an ordinary
-- candidate_insights row, reviewed in the same /insights queue by the same
-- humans through the same promote path. 'deep_dive' is a THIRD source value,
-- not a reuse of 'passive', because an admin weighing the queue needs to know
-- this one was said in answer to a direct question with disclosure on screen —
-- a different provenance from both "they chose to send this" and "we noticed."
--
-- The Phase B positive-silence read policy (floorguide-b2) already does the
-- right thing untouched: it shows a person their own candidate only when
-- source = 'explicit' or a human has acted. A deep_dive candidate is neither,
-- so its author is told nothing until promote/route — exactly the Call-1
-- reasoning (being told you were noticed and then hearing nothing forever is
-- worse than never being told).

alter table candidate_insights drop constraint if exists candidate_insights_source_check;
alter table candidate_insights add constraint candidate_insights_source_check
  check (source in ('explicit', 'passive', 'deep_dive'));

-- ═══ 5. updated_at ══════════════════════════════════════════════════════════

create or replace function public.touch_deep_dive_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists deep_dive_requests_touch on deep_dive_requests;
create trigger deep_dive_requests_touch
  before update on deep_dive_requests
  for each row execute function public.touch_deep_dive_row();

drop trigger if exists deep_dive_responses_touch on deep_dive_responses;
create trigger deep_dive_responses_touch
  before update on deep_dive_responses
  for each row execute function public.touch_deep_dive_row();

-- ═══ 6. SANITY CHECKS (read-only — safe to run any time) ════════════════════
--
-- Tables and policies exist:
--
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('deep_dive_requests', 'deep_dive_responses')
-- order by tablename, policyname;
--
-- The source ladder has three rungs:
--
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'candidate_insights_source_check';
--
-- The asks, as an admin would see them:
--
-- select r.created_at, p.display_name as asked_by, left(r.topic, 80) as topic,
--        r.sent_to_count, r.status
-- from deep_dive_requests r join profiles p on p.id = r.created_by
-- order by r.created_at desc;
--
-- The answers, with both lenses:
--
-- select dr.created_at, p.display_name, dr.divergence,
--        left(coalesce(dr.divergence_note, ''), 60) as difference,
--        dr.candidate_insight_id is not null as produced_candidate,
--        dr.training_request_id is not null as routed_to_training
-- from deep_dive_responses dr join profiles p on p.id = dr.user_id
-- order by dr.created_at desc;
--
-- ⭐ THE SEPARATION PROOF lives in scripts/verify-floor-guide-c.mjs: it runs a
-- Floor Guide query as a real contributor under their own JWT and asserts the
-- row counts of BOTH tables above (and candidate_insights) did not move.
