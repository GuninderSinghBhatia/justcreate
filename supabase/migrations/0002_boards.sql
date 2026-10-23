-- Phase 2: boards, canvas placement, labels/descriptions, inbox.

alter table public."references"
  add column if not exists labels text[] not null default '{}',
  add column if not exists description text;

create table public.boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  -- tldraw document snapshot (frames, text, arrows and card positions)
  document    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index boards_user_idx on public.boards (user_id, updated_at desc);

-- Which references sit on which board, and where. Kept in sync with the canvas document.
create table public.board_items (
  board_id     uuid not null references public.boards (id) on delete cascade,
  reference_id uuid not null references public."references" (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  x double precision not null default 0,
  y double precision not null default 0,
  w double precision not null default 280,
  h double precision not null default 320,
  z integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (board_id, reference_id)
);
create index board_items_reference_idx on public.board_items (reference_id);

alter table public.boards enable row level security;
alter table public.board_items enable row level security;

create policy "own boards" on public.boards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own board items" on public.board_items
  for all using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
    and exists (select 1 from public."references" r where r.id = reference_id and r.user_id = auth.uid())
  );

-- References that are on no board yet. security_invoker keeps RLS of the caller.
create view public.inbox_references with (security_invoker = true) as
  select r.* from public."references" r
  where not exists (select 1 from public.board_items bi where bi.reference_id = r.id);
