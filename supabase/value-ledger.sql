-- THE VALUE LEDGER — value_events + value_assumptions.
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires orgs, profiles, current_org_id(), is_manager(),
-- is_org_admin()).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" /
-- drop+recreate for named constraints, policies and triggers throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every CREATE above it that looked like it succeeded. Paste it all,
-- run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️⚠️ A STANDING DOCTRINE IS BEING AMENDED HERE — READ BEFORE CHANGING ANYTHING
--
-- T1B3 (the Value Readout) shipped under a hard rule:
--     "NO DOLLAR FIGURE, ANYWHERE, EVER."
--
-- That rule is AMENDED, NOT DELETED. The amended rule is:
--
--     The system NEVER invents a rate. The customer supplies every rate and
--     every cost assumption. The system supplies only QUANTITIES it can
--     observe, and multiplies. Every figure shows its inputs, its basis and
--     its confidence tier, and every input is editable by the customer.
--
-- The original ban existed because a COMPUTED SAVINGS CLAIM is a guess wearing
-- a currency symbol. This build makes no savings claim. It makes an
-- ASSET-ACQUISITION-COST claim — "here is what this cost to acquire, and what
-- it would cost to acquire again" — which is the logic an accountant applies to
-- inventory. That distinction is load-bearing. Do not blur it in schema,
-- in code, or in copy.
--
-- The /readout "years of judgment" anchor is UNCHANGED and stays the headline.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Covers:
--   1. value_events      — APPEND ONLY. Stores QUANTITIES, never dollars.
--   2. value_assumptions — ONE ROW PER ORG. Customer-owned rates. Seeded with
--                          NULLs, never defaults.
--   3. An append-only ENFORCEMENT TRIGGER on value_events (a code comment is
--      not a guarantee; this is).
--   4. RLS on both, org-scoped.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⭐⭐ THE CORE ARCHITECTURAL DECISION: QUANTITIES, NOT DOLLARS
--
-- The ledger must be APPEND-ONLY and DATED (it only goes up, and every entry
-- traces to a dated occurrence) AND a CFO must be able to edit an assumption
-- and watch the total move. Storing dollars makes those two mutually
-- exclusive — an edited rate would require rewriting history.
--
-- Storing quantities makes both true at once. The dollar figure is computed at
-- READ time by joining the stored quantity against the org's current, editable
-- assumptions. History is immutable; the pricing of history is not.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. VALUE_EVENTS ═══════════════════════════════════════════════════════

create table if not exists value_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id),

  -- The six types. Closed vocabulary, mirrored in src/lib/value-ledger.ts
  -- (VALUE_EVENT_TYPES). Adding one = one entry there + one line here.
  event_type      text not null
                  check (event_type in (
                    'pattern_captured',      -- a framework now exists          (substitution)
                    'answer_applied',        -- a retrieval was marked useful   (realized)
                    'prescription_effective',-- an intervention held            (realized)
                    'training_generated',    -- a training module was built     (substitution)
                    'gap_closed',            -- an unanswered question got an answer (modeled)
                    'ramp_compressed'        -- a role onboarding track finished     (modeled)
                  )),

  -- ⭐ THE REAL DATE OF THE THING, not the date the row was written. The
  -- backfill sets this to true history; only created_at moves.
  occurred_at     timestamptz not null,

  subject_type    text not null
                  check (subject_type in (
                    'pattern_record', 'prescription', 'training_request',
                    'knowledge_gap', 'retrieval', 'onboarding'
                  )),
  -- TEXT, not uuid — same reasoning as learning_signals.subject_id: most
  -- subjects are row-backed but some are stable composite keys.
  subject_id      text not null,

  contributor_id  uuid references profiles(id),

  -- ⭐⭐ QUANTITIES ONLY. NO CURRENCY. NO RATE. NO DOLLARS.
  -- e.g. { "reproduction_hours": 14, "scarcity": 0.9, "blast_radius": "high",
  --        "half_life_years": 5 }
  -- If a key in here ever ends in _cost/_rate/_dollars and is not something the
  -- CUSTOMER typed, the doctrine has been broken. The one deliberate exception
  -- is prescription_effective.stated_problem_cost, which is a number a human
  -- entered about their own operation — never one this system produced.
  quantity_json   jsonb not null default '{}',

  -- realized      → it measurably happened
  -- substitution  → work you'd otherwise have paid someone else to do
  -- modeled       → exposure avoided; ALWAYS rendered as a range, never a point
  confidence_tier text not null
                  check (confidence_tier in ('realized', 'substitution', 'modeled')),

  -- Plain English, written for a skeptic to read and disagree with. Every row
  -- has one. Backfilled and seeded rows say so IN HERE, so they are auditable.
  basis_sentence  text not null,

  created_at      timestamptz not null default now()
);

create index if not exists value_events_org_type_idx
  on value_events (org_id, event_type);
create index if not exists value_events_org_occurred_idx
  on value_events (org_id, occurred_at desc);
create index if not exists value_events_subject_idx
  on value_events (org_id, subject_type, subject_id);

-- ⭐⭐ IDEMPOTENCY FOR EVERY WRITER, LIVE AND BACKFILL ALIKE.
-- Both derive the SAME key for the same real-world occurrence — see
-- valueDedupeKey() in src/lib/value-ledger.ts. That shared namespace is what
-- makes "run the backfill after a month of live use" safe: the rows already
-- there win and nothing doubles.
--
-- ⚠️ WRITERS MUST USE ON CONFLICT **DO NOTHING**, never DO UPDATE. A DO UPDATE
-- fires the append-only trigger below and raises — which would make the
-- documented-safe "press backfill twice" action fail every row and report
-- zeroes, implying nothing had ever been backfilled. supabase-js:
-- .upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).
--
-- A PLAIN unique index, deliberately NOT partial: PostgREST cannot infer an
-- ON CONFLICT target from a partial unique index and every upsert against one
-- fails silently (this cost a deploy cycle on P-7's training_format_outcomes).
alter table value_events add column if not exists dedupe_key text;
create unique index if not exists value_events_dedupe_key_uniq
  on value_events (dedupe_key);

-- ═══ 2. APPEND-ONLY ENFORCEMENT ════════════════════════════════════════════
-- "Never UPDATE, never DELETE" is a doctrine. A trigger is a guarantee — and
-- unlike RLS it also binds the SERVICE ROLE, which is what actually writes here.
--
-- ⚠️ THE ESCAPE HATCH IS DELIBERATE AND LOUD: to correct bad ledger data you
-- must first `drop trigger value_events_append_only on value_events;`, which is
-- a decision somebody has to make on purpose and can be found in an audit log.
-- Re-run this file to put it back.

create or replace function public.value_events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'value_events is append-only (attempted %). Correct history by appending a new event, or drop trigger value_events_append_only deliberately.',
    tg_op;
end;
$$;

drop trigger if exists value_events_append_only on value_events;
create trigger value_events_append_only
  before update or delete on value_events
  for each row execute function public.value_events_append_only();

-- ═══ 3. VALUE_ASSUMPTIONS ══════════════════════════════════════════════════
--
-- ⭐⭐ SEEDED WITH NULLS, NEVER DEFAULTS. Until a customer enters a rate, the
-- ledger shows the QUANTITY and the words "no rate entered" — never an invented
-- industry average. A pre-filled default IS an invented number and reintroduces
-- exactly the failure mode the original doctrine was written to prevent.
--
-- There is no DEFAULT clause on any rate column in this table. That absence is
-- the feature. Do not add one.

create table if not exists value_assumptions (
  org_id                    uuid primary key references orgs(id) on delete cascade,

  -- $/hr — fully loaded cost of a senior person's time.
  senior_loaded_rate        numeric,
  -- $/hr — cost of interrupting an expert to ask them something.
  expert_interruption_rate  numeric,
  -- $ per finished training hour, the standard L&D unit.
  instructional_design_rate numeric,
  -- Weeks to full productivity in a typical role here.
  average_ramp_weeks        numeric,
  -- $ — fully loaded annual salary used for ramp math.
  loaded_salary_annual      numeric,
  -- $ — what one rework/quality incident costs this operation.
  rework_incident_cost      numeric,

  -- ───────────────────────────────────────────────────────────────────────
  -- ⚠️ THREE INPUTS ADDED TO THE BUILD BRIEF'S LIST, ON PURPOSE.
  --
  -- The brief's six assumptions leave three figures with nowhere to come from:
  -- how long an unanswered ask costs an expert, how likely a holder is to
  -- leave, and how many ramp weeks a completed onboarding track is credited
  -- with. Every one of those is a number about the CUSTOMER'S operation.
  --
  -- With no column for them, the code would have to invent them — which is the
  -- one thing the amended doctrine forbids. So they are customer inputs, NULL
  -- like every other rate, and the events that depend on them stay UNPRICED and
  -- visibly listed in "what this ledger can't see" until somebody fills them in.
  --
  -- 🔔 Brian owes a call on whether these three stay. The alternative is
  -- shipping three of the six event types permanently dark.
  -- ───────────────────────────────────────────────────────────────────────

  -- Minutes an unanswered question costs an expert (ask + context switch).
  expert_interruption_minutes numeric,
  -- 0–1. Probability a given holder leaves in a year. Shown inline on every
  -- modeled figure, never in a footnote.
  annual_departure_probability numeric
                              check (annual_departure_probability is null
                                     or (annual_departure_probability >= 0
                                         and annual_departure_probability <= 1)),
  -- Ramp weeks the org credits to one completed onboarding track. Capped in
  -- code at average_ramp_weeks — a credit larger than the whole ramp is not a
  -- number this page will render.
  ramp_weeks_credited_per_track numeric,

  updated_at                timestamptz not null default now(),
  updated_by                uuid references profiles(id)
);

-- Idempotent adds for a project where the table already exists.
alter table value_assumptions add column if not exists expert_interruption_minutes numeric;
alter table value_assumptions add column if not exists annual_departure_probability numeric;
alter table value_assumptions add column if not exists ramp_weeks_credited_per_track numeric;

-- The 0–1 bound again, for the ALTER path above: on a project where the table
-- already existed, ADD COLUMN IF NOT EXISTS attaches no check constraint, so
-- the inline one in the CREATE never applies. Named + drop-first so this whole
-- file stays re-runnable.
alter table value_assumptions drop constraint if exists value_assumptions_departure_prob_range;
alter table value_assumptions add constraint value_assumptions_departure_prob_range
  check (annual_departure_probability is null
         or (annual_departure_probability >= 0 and annual_departure_probability <= 1));

-- ═══ 4. ROW LEVEL SECURITY ═════════════════════════════════════════════════
--
-- Both tables: org members READ, nobody writes from a client. Every write goes
-- through a service-role path behind an authority check in the API route — the
-- same lockdown doctrine as profiles, onboarding_progress, capture_campaigns
-- and knowledge_gaps. A client that can UPDATE value_assumptions is a client
-- that can rewrite the number in front of the CFO.
--
-- Note the read boundary is the ORG, not the manager tier: the /ledger and
-- /readout AGGREGATE reads deliberately use the service role (a partial total
-- presented as a whole one is the exact T1B3 bug), and the authority check that
-- decides who may see the page lives in the route.

alter table value_events enable row level security;

drop policy if exists "org value events read" on value_events;
create policy "org value events read" on value_events
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

alter table value_assumptions enable row level security;

drop policy if exists "org value assumptions read" on value_assumptions;
create policy "org value assumptions read" on value_assumptions
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- ═══ 5. SANITY (run these separately AFTER the block above commits) ════════
-- select event_type, confidence_tier, count(*)
--   from value_events group by 1, 2 order by 1;
--
-- select * from value_assumptions;
--
-- -- Prove the append-only trigger is live (this SHOULD raise):
-- -- update value_events set basis_sentence = 'nope' where id = (select id from value_events limit 1);
