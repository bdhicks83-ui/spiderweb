-- EXPOSURE / BLOCK 2 — precedence_links.
-- Run this in the Supabase SQL editor, against the SAME project as everything
-- else (additive — requires orgs, profiles, pattern_records, current_org_id(),
-- pgvector).
-- Safe to re-run (idempotent): "if not exists" / drop+recreate for named
-- policies and indexes throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every CREATE above it that looked like it succeeded.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--
-- The conflict engine (P-2) points sideways: two experts, same ground,
-- opposite calls. This table points the same machinery FORWARD.
--
-- Somewhere in a captured framework, an expert wrote down that one observable
-- condition precedes another outcome — "slurry temperature drift shows up
-- before the transfer pump seal goes." That is a PREDICTION the organization
-- already owns and has never been able to act on, because it was buried in one
-- framework nobody re-reads.
--
-- This table pulls those assertions out and makes them fireable. When the
-- antecedent starts showing up again in recent captures and recent questions,
-- the org's OWN judgment warns it.
--
-- ⭐⭐ EVERY WARNING NAMES AND LINKS ITS SOURCE. source_pattern_id is NOT NULL
-- for exactly that reason: an unsourced warning is a guess, and this product
-- does not produce guesses. A row that cannot say who said it cannot exist.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists vector;

create table if not exists precedence_links (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references orgs(id),

  -- The observable condition, in the expert's own vocabulary.
  -- e.g. "slurry temperature drift"
  antecedent_text      text not null,
  -- What it precedes. e.g. "seal failure on the transfer pump"
  consequent_text      text not null,

  -- ⭐ NOT NULL. The captured judgment that asserts this. No source, no row.
  source_pattern_id    uuid not null references pattern_records(id) on delete cascade,

  -- The antecedent embedded as a QUERY (voyage-large-2, 1536) — deliberately
  -- the same input_type /api/retrieve uses, because the question being asked at
  -- read time is a retrieval question: "does this recent capture look like it is
  -- about this condition?" Matching a query-type vector against the
  -- document-type vectors on pattern_records is the exact geometry the 0.75
  -- threshold was tuned against.
  antecedent_embedding vector(1536),

  -- 'stated'  → the pattern says it outright
  -- 'implied' → the model inferred it
  -- ⭐ ONLY 'stated' EVER FIRES A WARNING. 'implied' rows are stored for a later
  -- build and never surface in this one. A warning built on an inference is a
  -- warning that trains people to ignore warnings.
  confidence           text not null check (confidence in ('stated', 'implied')),

  extracted_at         timestamptz not null default now(),
  created_at           timestamptz not null default now()
);

-- One assertion per (source, antecedent, consequent). Re-running extraction
-- must not multiply the same claim. A PLAIN unique index — PostgREST cannot
-- infer an ON CONFLICT target from a partial one (this cost a deploy cycle on
-- P-7's training_format_outcomes).
create unique index if not exists precedence_links_source_pair_uniq
  on precedence_links (source_pattern_id, antecedent_text, consequent_text);

create index if not exists precedence_links_org_conf_idx
  on precedence_links (org_id, confidence);

-- ANN index, best-effort and never fatal — same hnsw → ivfflat → none ladder as
-- P-3, wrapped so an older pgvector cannot roll back the table creation above.
-- At pilot scale exact KNN over the org-scoped subset is correct and fast
-- regardless; the index is a scale-ahead.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'precedence_links_embedding_idx'
  ) then
    begin
      execute 'create index precedence_links_embedding_idx on precedence_links '
           || 'using hnsw (antecedent_embedding vector_cosine_ops)';
      raise notice 'precedence: created hnsw index';
    exception when others then
      begin
        execute 'create index precedence_links_embedding_idx on precedence_links '
             || 'using ivfflat (antecedent_embedding vector_cosine_ops) with (lists = 100)';
        raise notice 'precedence: hnsw unavailable, created ivfflat instead';
      exception when others then
        raise notice 'precedence: no ANN index created — exact KNN is fine at this scale';
      end;
    end;
  end if;
end $$;

-- ═══ EXTRACTION LATCH ══════════════════════════════════════════════════════
-- NULL = extraction has never run for this record. Without it, a framework
-- that legitimately asserts nothing would be re-sent to the model forever.
alter table pattern_records
  add column if not exists precedence_checked_at timestamptz;

-- ═══ ROW LEVEL SECURITY ════════════════════════════════════════════════════
-- Org members read; nobody writes from a client. Extraction is a service-role
-- Inngest job — same lockdown doctrine as framework_conflicts, learning_signals
-- and value_events.
--
-- The read boundary is the ORG rather than the manager tier because /exposure
-- reads these AS THE CALLER (it is a row-level, source-attributed surface), and
-- the authority check for the page itself lives in requireExposureViewer.

alter table precedence_links enable row level security;

drop policy if exists "org precedence links read" on precedence_links;
create policy "org precedence links read" on precedence_links
  for select using (
    org_id is not null
    and org_id = public.current_org_id()
  );

-- ═══ SANITY (run separately AFTER the block above commits) ═════════════════
-- select confidence, count(*) from precedence_links group by 1;
--
-- select p.antecedent_text, p.consequent_text, p.confidence,
--        r.framework->>'name' as source_framework
--   from precedence_links p
--   join pattern_records r on r.id = p.source_pattern_id
--  order by p.confidence, p.antecedent_text;
--
-- -- How many records still await extraction:
-- select count(*) from pattern_records
--  where status = 'complete' and precedence_checked_at is null;
