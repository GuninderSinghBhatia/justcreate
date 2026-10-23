-- Phase 5: personal API tokens for coding agents (MCP server). Read-only for now.
-- Only a SHA-256 hash is stored; the token itself is shown once at creation.

create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  token_hash   text not null unique,
  prefix       text not null,              -- first characters, to recognise a token in the list
  scopes       text[] not null default '{read}',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_tokens_user_idx on public.api_tokens (user_id, created_at desc);

alter table public.api_tokens enable row level security;
-- Users list, create and revoke their own tokens. Lookup by hash happens server-side (secret key).
create policy "own tokens: read" on public.api_tokens for select using (auth.uid() = user_id);
create policy "own tokens: create" on public.api_tokens for insert with check (auth.uid() = user_id);
create policy "own tokens: revoke" on public.api_tokens for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
