-- Phase 3: background jobs, per-reference analysis, embeddings, clusters.

create extension if not exists vector with schema extensions;

-- Work queue processed by the web app's job runner (server-side, secret key).
create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('analyze', 'embed', 'cluster')),
  reference_id uuid references public."references" (id) on delete cascade,
  board_id     uuid references public.boards (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  attempts     integer not null default 0,
  error        text,
  run_after    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index jobs_pending_idx on public.jobs (status, run_after) where status in ('pending', 'running');
-- At most one open job of a kind per reference / board, so re-enqueueing is idempotent.
create unique index jobs_open_reference_uniq on public.jobs (kind, reference_id)
  where status in ('pending', 'running') and reference_id is not null;
create unique index jobs_open_board_uniq on public.jobs (kind, board_id)
  where status in ('pending', 'running') and board_id is not null;

-- One analysis per reference. `observed` vs `inferred` is kept apart for design.md later.
create table public.analyses (
  reference_id uuid primary key references public."references" (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  model        text not null,
  summary      text,
  tags         text[] not null default '{}',
  colors       text[] not null default '{}',
  fonts        text[] not null default '{}',
  layout_notes text,
  components   text[] not null default '{}',
  effects      text[] not null default '{}',
  mood         text[] not null default '{}',
  observed     jsonb not null default '{}'::jsonb,
  inferred     jsonb not null default '{}'::jsonb,
  raw          jsonb,
  created_at   timestamptz not null default now()
);

create table public.embeddings (
  reference_id uuid primary key references public."references" (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  model        text not null,
  embedding    extensions.vector(1024) not null,
  created_at   timestamptz not null default now()
);

create table public.clusters (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references public.boards (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  status     text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  source     text not null default 'ai' check (source in ('ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clusters_board_idx on public.clusters (board_id, status);

create table public.cluster_members (
  cluster_id   uuid not null references public.clusters (id) on delete cascade,
  reference_id uuid not null references public."references" (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  score        real not null default 1,
  primary key (cluster_id, reference_id)
);
create index cluster_members_reference_idx on public.cluster_members (reference_id);

-- Tracks when a board was last clustered, for the "re-run after N new references" rule.
alter table public.boards add column if not exists clustered_at timestamptz;

alter table public.jobs enable row level security;
alter table public.analyses enable row level security;
alter table public.embeddings enable row level security;
alter table public.clusters enable row level security;
alter table public.cluster_members enable row level security;

-- Users can read their own AI data; writes happen in the job runner with the secret key,
-- except cluster curation (accept/reject/rename/merge/manual), which users do directly.
create policy "own jobs: read" on public.jobs for select using (auth.uid() = user_id);
create policy "own analyses: read" on public.analyses for select using (auth.uid() = user_id);
create policy "own embeddings: read" on public.embeddings for select using (auth.uid() = user_id);
create policy "own clusters" on public.clusters
  for all using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
  );
create policy "own cluster members" on public.cluster_members
  for all using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and exists (select 1 from public.clusters c where c.id = cluster_id and c.user_id = auth.uid())
    and exists (select 1 from public."references" r where r.id = reference_id and r.user_id = auth.uid())
  );

-- Claims up to `n` due jobs atomically (skip locked rows so parallel runners don't collide).
create or replace function public.claim_jobs(n integer)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs j
     set status = 'running', attempts = j.attempts + 1, updated_at = now()
   where j.id in (
     select id from public.jobs
      where (status = 'pending' and run_after <= now())
         or (status = 'running' and updated_at < now() - interval '10 minutes') -- crashed runner
      order by created_at
      limit n
      for update skip locked
   )
  returning j.*;
$$;
revoke all on function public.claim_jobs(integer) from public, anon, authenticated;
