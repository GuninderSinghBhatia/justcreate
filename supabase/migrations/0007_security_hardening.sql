-- Security test fixes (2026-10-30).

-- API tokens: created and revoked by the server (secret key) only. Users could otherwise un-revoke
-- a token, rewrite its scopes or pick their own hash through the REST API.
drop policy if exists "own tokens: create" on public.api_tokens;
drop policy if exists "own tokens: revoke" on public.api_tokens;

-- design.md versions: users save their own edits (kind 'edit') and can delete their versions;
-- AI versions ('generated', 'section', 'draft') are written by the worker only.
drop policy if exists "own design specs" on public.design_specs;
create policy "own design specs: read" on public.design_specs
  for select using (auth.uid() = user_id);
create policy "own design specs: save edits" on public.design_specs
  for insert with check (
    auth.uid() = user_id
    and kind = 'edit'
    and exists (select 1 from public.boards b where b.id = board_id and b.user_id = auth.uid())
  );
create policy "own design specs: delete" on public.design_specs
  for delete using (auth.uid() = user_id);

-- One board per user, enforced: parallel first captures on a new account could each create one
-- (the app retries the lookup when this index rejects the second insert).
create unique index if not exists boards_one_per_user on public.boards (user_id);
