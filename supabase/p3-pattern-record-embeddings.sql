-- P-3 — Contextual retrieval: embeddings over pattern_records.
-- Run this in the Supabase SQL editor, against the SAME project as
-- p1-org-foundation.sql / p2-conflict-xray.sql (additive — requires
-- pattern_records + org_id + current_org_id() + the org RLS from P-1).
-- Safe to re-run (idempotent): "if not exists" / "create or replace" / guarded
-- index creation throughout.
--
-- ⚠️⚠️⚠️ PASTE THIS COMPLETE, AS ONE BLOCK ⚠️⚠️⚠️
-- The Supabase SQL editor runs a pasted multi-statement script as ONE
-- transaction. If the LAST statement fails, the WHOLE thing rolls back —
-- including every ALTER above it that looked like it succeeded. Paste it all,
-- run it once.
--
-- Reminder: auth.uid() does not resolve in the SQL editor — for any manual
-- per-user query use the literal a7d205f0-778c-44b9-9e13-4ebd5f47e964.
--
-- Covers:
--   1. pgvector extension (already live for insights.embedding — the
--      committed SQL never had it; this makes the dependency explicit and is
--      a no-op if it's already installed).
--   2. pattern_records.embedding vector(1536) — matches voyage-large-2.
--      pattern_records.embedded_at — when the vector was last written (lets
--      the verification path and future re-embeds reason about freshness).
--   3. An ANN index, attempted best-effort (hnsw → ivfflat → none) inside
--      exception-guarded DO blocks so an older pgvector can't roll back the
--      whole migration. At demo scale (16 rows) exact KNN over the org-scoped
--      subset is correct and fast regardless — the index is a scale-ahead.
--   4. search_pattern_records_by_query() — org-scoped nearest-framework
--      search. SECURITY INVOKER: the caller's RLS ("org library read")
--      scopes results to their org + own rows for free, exactly like
--      /api/library. Returns top matches by cosine similarity; the API route
--      applies the honesty threshold so a weak match becomes "nothing
--      codified" instead of a confident wrong answer.

-- ═══ 1. EXTENSION ══════════════════════════════════════════════════════════
create extension if not exists vector;

-- ═══ 2. COLUMNS ════════════════════════════════════════════════════════════
alter table pattern_records add column if not exists embedding vector(1536);
alter table pattern_records add column if not exists embedded_at timestamptz;

-- ═══ 3. ANN INDEX (best-effort, never fatal) ═══════════════════════════════
-- Try hnsw (pgvector >= 0.5), then ivfflat, then give up gracefully. Each is
-- wrapped so a failure raises a NOTICE and is swallowed rather than aborting
-- the transaction and rolling back the column adds above.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'pattern_records_embedding_idx'
  ) then
    begin
      execute 'create index pattern_records_embedding_idx on pattern_records '
           || 'using hnsw (embedding vector_cosine_ops)';
      raise notice 'P-3: created hnsw index on pattern_records.embedding';
    exception when others then
      begin
        execute 'create index pattern_records_embedding_idx on pattern_records '
             || 'using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
        raise notice 'P-3: hnsw unavailable, created ivfflat index instead';
      exception when others then
        raise notice 'P-3: no ANN index created (pgvector too old) — exact KNN is fine at this scale';
      end;
    end;
  end if;
end $$;

-- ═══ 4. ORG-SCOPED NEAREST-FRAMEWORK SEARCH ════════════════════════════════
-- SECURITY INVOKER (the default): runs as the calling user, so the "org
-- library read" RLS policy on pattern_records restricts the scan to the
-- caller's org (plus their own rows) — no explicit org filter needed here, and
-- no cross-org leakage is structurally possible. Only COMPLETE, embedded
-- records are candidates. Contested records are deliberately NOT filtered:
-- surface-with-warning means they come back and wear their badge in the UI.
create or replace function search_pattern_records_by_query(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (id uuid, similarity float)
language sql
stable
as $$
  select
    pr.id,
    1 - (pr.embedding <=> query_embedding) as similarity
  from pattern_records pr
  where pr.status = 'complete'
    and pr.embedding is not null
  order by pr.embedding <=> query_embedding
  limit match_count;
$$;
