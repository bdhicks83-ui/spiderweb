-- Phase 5 — "Ask Your Spiderweb": query text → embedding → matching insights.
-- Companion to match_insights (insight-to-insight), but this one takes an
-- arbitrary query embedding and returns the user's closest APPROVED insights.
--
-- Run this in the Supabase SQL editor.

create or replace function search_insights_by_query(
  query_embedding vector(1536),
  p_user_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    i.id,
    i.content,
    1 - (i.embedding <=> query_embedding) as similarity
  from insights i
  where i.user_id = p_user_id
    and i.status = 'approved'
    and i.embedding is not null
  order by i.embedding <=> query_embedding
  limit match_count;
$$;
