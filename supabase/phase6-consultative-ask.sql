-- Phase 6 — Consultative Ask: multi-turn "Ask Your Spiderweb".
-- A session holds the original question, the matched insights (frozen at
-- session start so follow-ups don't re-search), the running follow-up Q&A,
-- and the final recommendation once synthesized.
--
-- Run this in the Supabase SQL editor.

create table ask_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  question         text not null,
  -- [{ "id": uuid, "content": text, "similarity": float }, ...]
  matched_insights jsonb not null default '[]',
  -- [{ "question": text, "answer": text }, ...] — follow-ups already answered
  qa_pairs         jsonb not null default '[]',
  -- The follow-up currently awaiting the user's answer (null once complete)
  pending_question text,
  status           text not null default 'active'
                   check (status in ('active', 'complete')),
  -- { "recommendation": text, "pros": [text], "cons": [text], "gaps": text|null }
  recommendation   jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index ask_sessions_user_idx on ask_sessions (user_id, created_at desc);

-- ─── ROW LEVEL SECURITY: users only see their own sessions ───
alter table ask_sessions enable row level security;

create policy "own ask sessions" on ask_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
