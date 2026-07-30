-- FLOOR GUIDE / PHASE B — EMERGENT INSIGHT + THE ADMIN REVIEW QUEUE
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires profiles, orgs, pattern_records, current_org_id(),
-- is_org_admin(), is_contributor() and the Phase A integrity trigger).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" /
-- drop+recreate for named constraints and triggers throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every ALTER above it that looked like it succeeded while you were
-- watching it run. Paste it all, run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--
-- Phase A made one thing true in the data: a contributor's input never becomes
-- the org's canonical judgment. That was the integrity half. It left the other
-- half open, and it is the half the floor actually cares about — THE FLOOR
-- OFTEN KNOWS THINGS THE EXPERTS HAVEN'T WRITTEN DOWN. Phase A gave that
-- knowledge nowhere to go.
--
-- Phase B gives it somewhere to go WITHOUT weakening the rule by one inch:
--
--     contributor says something         →  candidate_insights row
--     a HUMAN ADMIN reads it             →  promote / route-to-expert / dismiss
--     promote or route                   →  pattern_records row owned by an
--                                           expert, credited "surfaced by them"
--
-- The rule that makes this trustworthy rather than a loophole: A CANDIDATE
-- INSIGHT IS NOT JUDGMENT UNTIL A HUMAN ACTS. There is no auto-promotion, no
-- confidence score high enough to skip the human, no batch job. Section 5
-- enforces that in the data the same way Phase A enforced its rule — with a
-- trigger, not a code path — because a code path is a promise and a trigger is
-- a fact.
--
-- Covers:
--   1. candidate_insights                → the queue's table
--   2. RLS                               → admin sees their org · the routed
--                                          expert sees theirs · the contributor
--                                          sees their own, POSITIVE-ONLY
--   3. pattern_records.surfaced_by_user_id + method 'floor_surfaced'
--   4. Indexes (all PLAIN — see the note in section 1)
--   5. ⭐ THE NO-AUTO-PROMOTION GUARD  → a surfaced framework cannot exist
--                                          unless a human acted on its candidate
--   6. Sanity checks (read-only)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⭐ DECISION 1: POSITIVE-ONLY IS AN RLS RULE, NOT A `WHERE` CLAUSE IN A ROUTE.
--
-- The product decision (settled in DESIGN-floor-guide-contributor-tier.md) is
-- that a contributor is told when their idea is noticed and when it is promoted,
-- and is told NOTHING when it is dismissed. No "rejected" state, ever — the
-- second somebody learns their idea was turned down, they stop offering them,
-- and the floor knowledge this whole phase exists to capture dries up.
--
-- That could have lived in the API as `.neq("status", "dismissed")`. It does
-- not, because that is one forgotten filter away from being false, and the
-- forgetting would be invisible — a dismissed row rendering on somebody's
-- screen months later with no error anywhere. The read policy for the
-- contributor's own rows excludes 'dismissed' AT THE DATA LAYER. A route that
-- forgets the filter still cannot show them.
-- ═══════════════════════════════════════════════════════════════════════════
-- ⭐ DECISION 2: THE CONTRIBUTOR IS user_id AND IT IS NOT NULLABLE.
--
-- Phase A's privacy work nulled the actor on Floor Guide writes, so the obvious
-- instinct here is to do the same. It is wrong here, and the difference matters:
-- a Floor Guide question is EVALUATIVE material (what don't you know) and is
-- suppressed. A candidate insight is RECOGNITION material (what do you know
-- that we don't) and is worthless anonymised — "somebody on the floor has a
-- better way" is not actionable, and the whole point of the attribution model
-- ("surfaced by X, codified with Y") is that a name reaches the Win Column.
--
-- The consequence is deliberate and is enforced in the application, not here:
-- PASSIVE DETECTION NEVER RUNS ON THE FLOOR GUIDE SURFACE. Silently escalating
-- a named row out of the one surface that promises "nobody's grading you" would
-- make that copy a lie. On Floor Guide the detector INVITES the person to share
-- it themselves and writes nothing until they click. See
-- src/lib/candidate-insights.ts and /api/insights/detect.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. THE TABLE ══════════════════════════════════════════════════════════
--
-- One row per candidate. `source` is the tiering axis the whole design rests
-- on: 'explicit' (they chose to tell us — ALWAYS queued, no scoring, no bar)
-- and 'passive' (we noticed — only ever written when the detector is highly
-- confident). An admin weighs those differently, so the queue shows which.

create table if not exists candidate_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,

  -- The contributor. See DECISION 2 — deliberately not nullable.
  user_id uuid not null references auth.users(id) on delete cascade,

  source text not null check (source in ('explicit', 'passive')),
  -- Which surface it came from. 'floor_guide' can only ever appear with
  -- source='explicit' (DECISION 2); nothing enforces that here because a
  -- check constraint spanning a product rule this young ages badly.
  surface text,

  -- Their words, unedited. The queue shows these verbatim: an admin judging
  -- "is this real judgment" needs the person's own phrasing, not a paraphrase.
  raw_input text not null,
  -- What they were looking at when they said it (the question they had asked,
  -- the framework on screen). Context, not content.
  context_note text,

  -- Detector output. Null on the explicit path — nothing scored it, because
  -- somebody choosing to share is the signal.
  summary text,
  suggested_title text,
  confidence numeric,
  detector text,

  status text not null default 'new'
    check (status in ('new', 'reviewing', 'promoted', 'routed', 'dismissed')),

  -- Route-to-expert.
  routed_to_user_id uuid references profiles(id),
  routed_at timestamptz,

  -- Who acted, and when. NOT NULL-able by policy rather than by constraint:
  -- section 5's guard refuses to let a framework carry surfaced-by credit
  -- unless acted_by is set, which is the same rule stated where it bites.
  acted_by uuid references profiles(id),
  acted_at timestamptz,
  promoted_record_id uuid references pattern_records(id) on delete set null,

  -- The contributor's positive-only signal, modelled exactly on
  -- knowledge_gap_askers (P-9): notified_at is stamped when there is something
  -- good to tell them, seen_at when they've read it. Unread is
  -- (notified_at is not null and seen_at is null), and a promotion re-stamps
  -- notified_at and clears seen_at so the badge lights up a second time.
  notified_at timestamptz,
  seen_at timestamptz,

  -- Normalised copy of raw_input, ONLY as a de-dupe key. The detector can fire
  -- more than once for the same words (a re-render, a re-ask, a double click)
  -- and an admin queue that shows the same idea three times is a queue that
  -- gets closed.
  input_norm text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table candidate_insights enable row level security;

-- ⚠️ THIS IS A PLAIN UNIQUE INDEX AND IT MUST STAY PLAIN. It is the ON
-- CONFLICT target for the de-dupe upsert in src/lib/candidate-insights.ts.
-- The P-7 PostgREST trap: `onConflict` pointed at a PARTIAL unique index
-- cannot be inferred, and every upsert then fails SILENTLY — no error, no row.
-- If you ever want this scoped ("only while status = 'new'"), do it in the
-- query, never by making this index partial.
create unique index if not exists candidate_insights_dedupe_idx
  on candidate_insights (org_id, user_id, input_norm);

-- The queue read: newest first within an org, and the status filter is the
-- leading predicate because 'new' is what an admin opens the page to see.
create index if not exists candidate_insights_queue_idx
  on candidate_insights (org_id, status, created_at desc);

-- The badge read. Kept PLAIN (not `where seen_at is null`) on purpose: P-9's
-- equivalent is partial and is fine because nothing upserts on it, but this
-- table already has one upsert target and one plain-index rule is cheaper to
-- remember than two indexes with different rules.
create index if not exists candidate_insights_owner_idx
  on candidate_insights (user_id, notified_at desc);

create index if not exists candidate_insights_routed_idx
  on candidate_insights (routed_to_user_id, status);

-- ═══ 2. RLS ════════════════════════════════════════════════════════════════
--
-- Three readers, three policies, and NO write policy for session clients at
-- all — every write goes through an API route on the service-role client, the
-- same shape as knowledge_gaps and capture_requests. A contributor cannot
-- create their own candidate by talking to PostgREST directly; the route
-- decides what a candidate is.

drop policy if exists "own candidate insights positive only" on candidate_insights;
create policy "own candidate insights positive only"
  on candidate_insights for select
  using (
    user_id = auth.uid()
    -- ⭐ DECISION 1. The positive-only rule, in the data.
    and status <> 'dismissed'
  );

drop policy if exists "org admin reads candidate queue" on candidate_insights;
create policy "org admin reads candidate queue"
  on candidate_insights for select
  using (
    org_id = public.current_org_id()
    and public.is_org_admin()
  );

-- The routed expert. Not an admin, so the queue policy above does not cover
-- them, and they must see exactly the one thing that was handed to them —
-- never the rest of the org's queue.
drop policy if exists "routed expert reads their candidate" on candidate_insights;
create policy "routed expert reads their candidate"
  on candidate_insights for select
  using (routed_to_user_id = auth.uid());

-- ═══ 3. pattern_records — DUAL ATTRIBUTION ═════════════════════════════════
--
-- "Surfaced by [contributor], codified with [expert]." Both credited, and the
-- expert is still the author: user_id is unchanged in meaning, and remains the
-- person whose judgment this is and whose name carries it. surfaced_by_user_id
-- is a SECOND, additive credit line.
--
-- ⭐ WHY NOT REUSE codified_from. codified_from already carries provenance
-- (P-8 Phase 2 uses it for training-derived nodes) and Phase B writes it too.
-- But it is jsonb, so it cannot be a foreign key, cannot be indexed usefully
-- for "everything Devin surfaced," and — the deciding reason — the recon found
-- that NOTHING IN THE UI HAS EVER RENDERED codified_from. A credit line that
-- lives only in a jsonb blob is a credit nobody receives. This is a real
-- column because it is a real promise to a real person.

alter table pattern_records
  add column if not exists surfaced_by_user_id uuid references profiles(id);

create index if not exists pattern_records_surfaced_by_idx
  on pattern_records (surfaced_by_user_id, created_at desc);

-- The method ladder gains one rung. p0.5 owns this constraint and
-- p8-phase2-training-graph.sql already widened it once for 'training_derived';
-- this is the same move for the same reason — a new way a record can come into
-- existence needs a name, or the complete-check has to be relaxed instead.
alter table pattern_records drop constraint if exists pattern_records_method_check;
alter table pattern_records add constraint pattern_records_method_check
  check (method in (
    '5whys_fishbone',
    'aar_success_case',
    'premortem',
    'a3',
    'cdm',
    'training_derived',
    'floor_surfaced'
  ));

-- ═══ 4. ⭐⭐⭐ THE NO-AUTO-PROMOTION GUARD ⭐⭐⭐ ══════════════════════════════
--
-- THE RULE: a contributor's input becomes judgment ONLY when a human admin (or
-- an expert an admin routed it to) says so. Not when a model is confident. Not
-- when a queue is long. Never automatically.
--
-- Phase A taught the lesson this section applies: the rule has to be true of
-- the TABLE, not of the buttons. Same reasoning, same placement, same reason
-- RLS is the wrong tool — service-role clients bypass it, and the promote path
-- is itself a service-role write.
--
-- So: any pattern_records row claiming surfaced-by credit must point at a
-- candidate_insights row that a named human has already acted on. The three
-- refusals below are the three ways a well-meaning future code path could
-- create judgment out of floor input without a human in the loop:
--
--   SURFACED_WITHOUT_CANDIDATE  — credit with no candidate to trace it to
--   SURFACED_CANDIDATE_MISSING  — credit pointing at a candidate that is gone
--   INSIGHT_NOT_PROMOTED_BY_HUMAN — a candidate nobody acted on
--
-- ⚠️ ORDERING CONSEQUENCE, and the promote path depends on it: the candidate
-- must be stamped (status → 'promoted'/'routed', acted_by → the admin) BEFORE
-- the pattern_records insert, or this trigger rejects the insert. That is the
-- right order anyway — it means a crash between the two leaves an acted-on
-- candidate with no framework (visible, fixable, re-promotable) rather than a
-- framework nobody approved (invisible, and a lie).

create or replace function public.guard_surfaced_insight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_id     uuid;
  candidate_status text;
  candidate_actor  uuid;
begin
  -- The overwhelmingly common case: an ordinary framework. Costs one null check.
  if new.surfaced_by_user_id is null then
    return new;
  end if;

  candidate_id := nullif(new.codified_from ->> 'candidate_insight_id', '')::uuid;

  if candidate_id is null then
    raise exception
      'SURFACED_WITHOUT_CANDIDATE: this pattern_record claims surfaced-by credit for profile % but carries no codified_from.candidate_insight_id, so there is no record of a human promoting it. Floor Guide Phase B routes floor input through candidate_insights -> an admin action -> here. Nothing else may write surfaced_by_user_id.',
      new.surfaced_by_user_id
      using errcode = '42501';
  end if;

  select ci.status, ci.acted_by
    into candidate_status, candidate_actor
    from candidate_insights ci
   where ci.id = candidate_id;

  if candidate_status is null then
    raise exception
      'SURFACED_CANDIDATE_MISSING: codified_from.candidate_insight_id % does not exist.',
      candidate_id
      using errcode = '42501';
  end if;

  if candidate_actor is null or candidate_status not in ('promoted', 'routed') then
    raise exception
      'INSIGHT_NOT_PROMOTED_BY_HUMAN: candidate_insight % is status ''%'' with acted_by %. A candidate insight is not judgment until a human admin promotes it or routes it to an expert — that is the Floor Guide Phase B integrity rule, enforced at the data layer on purpose. Stamp the candidate first, then write the framework.',
      candidate_id, candidate_status, coalesce(candidate_actor::text, 'nobody')
      using errcode = '42501';
  end if;

  return new;
end
$$;

drop trigger if exists pattern_records_surfaced_guard on pattern_records;
create trigger pattern_records_surfaced_guard
  before insert or update on pattern_records
  for each row execute function public.guard_surfaced_insight();

-- NOTE ON TRIGGER ORDER: Postgres fires BEFORE row triggers in NAME order, so
-- pattern_records_contributor_guard (Phase A) runs before
-- pattern_records_surfaced_guard (Phase B). That happens to be the order you
-- want — "a contributor can't own this" is a broader rule than "this credit
-- needs a human" — but nothing depends on it: both must pass, and the
-- alphabetical accident is not load-bearing.

-- ═══ 5. updated_at ═════════════════════════════════════════════════════════

create or replace function public.touch_candidate_insight()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists candidate_insights_touch on candidate_insights;
create trigger candidate_insights_touch
  before update on candidate_insights
  for each row execute function public.touch_candidate_insight();

-- ═══ 6. SANITY CHECKS (read-only — safe to run any time) ═══════════════════
--
-- The table and its policies exist:
--
-- select policyname, cmd from pg_policies where tablename = 'candidate_insights';
--
-- Both guards are installed on pattern_records:
--
-- select tgname, tgenabled from pg_trigger
-- where tgrelid = 'pattern_records'::regclass and not tgisinternal
-- order by tgname;
--
-- The method ladder has seven rungs:
--
-- select pg_get_constraintdef(oid) from pg_constraint
-- where conname = 'pattern_records_method_check';
--
-- The queue, as an admin would see it:
--
-- select ci.created_at, p.display_name, ci.source, ci.confidence, ci.status,
--        left(ci.raw_input, 80) as idea
-- from candidate_insights ci join profiles p on p.id = ci.user_id
-- order by ci.created_at desc;
--
-- ⭐ THE INTEGRITY PROOF, run by hand (expect an ERROR — that is the pass).
-- Try to create a surfaced framework without a human ever acting:
--
-- insert into pattern_records (user_id, status, qa_pairs, entity_map, surfaced_by_user_id)
-- values ('<a member profile id>', 'active', '[]'::jsonb, '[]'::jsonb, '<a contributor profile id>');
-- -- expected: ERROR  SURFACED_WITHOUT_CANDIDATE: ...
--
-- scripts/verify-floor-guide-b.mjs runs that proof plus the "candidate exists
-- but nobody acted" variant through the SERVICE-ROLE client, which is the
-- privilege level RLS would have missed.
--
-- Nothing was dropped and no existing framework changed:
--
-- select count(*) as frameworks, count(surfaced_by_user_id) as surfaced
-- from pattern_records;
