-- Phase 4: video rendering pipeline
-- Run once in the Supabase SQL editor.

-- Where the rendered video lives in the `videos` storage bucket.
alter table insights add column if not exists video_path text;

-- ─── STORAGE bucket for generated audio + video ───
insert into storage.buckets (id, name, public) values ('videos', 'videos', false)
on conflict (id) do nothing;

create policy "own videos read" on storage.objects
  for select using (bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "own videos write" on storage.objects
  for insert with check (bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1]);
