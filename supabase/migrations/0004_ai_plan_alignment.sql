-- Align Phase 3 storage with the execution plan:
-- two CLIP embeddings per reference (image + caption/tags text), a code-extracted palette,
-- cluster summaries, and the original AI name so "kept or only renamed" can be measured.

drop table if exists public.embeddings;
create table public.embeddings (
  reference_id    uuid primary key references public."references" (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  model_version   text not null,
  image_embedding extensions.vector(512),
  text_embedding  extensions.vector(512),
  created_at      timestamptz not null default now()
);
alter table public.embeddings enable row level security;
create policy "own embeddings: read" on public.embeddings for select using (auth.uid() = user_id);

alter table public.analyses
  add column if not exists caption text,
  add column if not exists palette text[] not null default '{}',   -- k-means on pixels (exact)
  add column if not exists image_hash text;                         -- cache: skip re-analysis of identical images
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'analyses' and column_name = 'model') then
    alter table public.analyses rename column model to model_version;
  end if;
end $$;

alter table public.clusters
  add column if not exists summary text,
  add column if not exists ai_name text,            -- name as first suggested; differs from name if renamed
  add column if not exists decided_at timestamptz;  -- when accepted/rejected

-- Board cover image (a reference on the board) for the board list.
alter table public.boards add column if not exists cover_reference_id uuid references public."references" (id) on delete set null;

-- Full-text search over title, note, description and labels.
-- array_to_string is only STABLE; generated columns need IMMUTABLE (safe for text[]).
create or replace function public.labels_text(labels text[]) returns text
  language sql immutable parallel safe as $f$ select array_to_string(labels, ' ') $f$;

alter table public."references" add column if not exists search tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', public.labels_text(labels)), 'A') ||
    setweight(to_tsvector('simple', coalesce(note, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored;
create index if not exists references_search_idx on public."references" using gin (search);

-- inbox view must be recreated because "references" gained columns.
drop view if exists public.inbox_references;
create view public.inbox_references with (security_invoker = true) as
  select r.* from public."references" r
  where not exists (select 1 from public.board_items bi where bi.reference_id = r.id);
