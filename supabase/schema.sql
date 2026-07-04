-- Spiderweb Phase 1 schema — "It Remembers"
-- Run this in Supabase → SQL Editor after creating the project.
-- Users come free with Supabase Auth (auth.users).

-- ─── SOURCES: raw uploads (screenshot / text / voice memo) ───
create table sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('screenshot', 'text', 'voice')),
  storage_path text,              -- path in Supabase Storage (null for pasted text)
  raw_text    text,               -- pasted text, or OCR/transcript output
  status      text not null default 'uploaded'
              check (status in ('uploaded', 'processing', 'processed', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);

-- ─── INSIGHTS: discrete extracted units, awaiting approval ───
create table insights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   uuid not null references sources(id) on delete cascade,
  content     text not null,
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  decided_at  timestamptz,        -- when approved/rejected (for the 5-min exit test)
  created_at  timestamptz not null default now()
);

create index insights_pending_idx on insights (user_id, created_at)
  where status = 'pending';

-- ─── ROW LEVEL SECURITY: users only see their own rows ───
alter table sources enable row level security;
alter table insights enable row level security;

create policy "own sources" on sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own insights" on insights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── STORAGE bucket for uploads (run once) ───
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false);

create policy "own uploads read" on storage.objects
  for select using (bucket_id = 'uploads' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "own uploads write" on storage.objects
  for insert with check (bucket_id = 'uploads' and auth.uid()::text = (storage.foldername(name))[1]);
