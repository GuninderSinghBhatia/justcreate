-- Phase 0: saved references + per-user storage access.
-- "references" is a reserved word in Postgres, so it is always quoted.

create table public."references" (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type           text not null default 'image'
                 check (type in ('image', 'screenshot', 'video', 'tweet', 'webpage')),
  source_url     text,
  page_url       text,
  title          text,
  file_path      text,           -- path inside the "captures" bucket
  thumbnail_path text,
  metadata       jsonb not null default '{}'::jsonb,
  note           text,
  created_at     timestamptz not null default now()
);

create index references_user_created_idx on public."references" (user_id, created_at desc);

alter table public."references" enable row level security;

create policy "own references: select" on public."references"
  for select using (auth.uid() = user_id);
create policy "own references: insert" on public."references"
  for insert with check (auth.uid() = user_id);
create policy "own references: update" on public."references"
  for update using (auth.uid() = user_id);
create policy "own references: delete" on public."references"
  for delete using (auth.uid() = user_id);

-- Storage: files live at captures/<user_id>/<file>. Users only touch their own folder.
create policy "captures: own folder read" on storage.objects
  for select using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "captures: own folder write" on storage.objects
  for insert with check (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "captures: own folder delete" on storage.objects
  for delete using (bucket_id = 'captures' and (storage.foldername(name))[1] = auth.uid()::text);
