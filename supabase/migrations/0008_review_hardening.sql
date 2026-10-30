-- Code review fixes (2026-10-30).

-- References: a row's files must be in its owner's own storage folder. Users write these rows, and
-- server code (agent API signed URLs, the worker) reads the files with the secret key, so a path
-- pointing into someone else's folder would hand out their file.
create or replace function public.references_own_paths()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.file_path is not null and split_part(new.file_path, '/', 1) <> new.user_id::text then
    raise exception 'file_path must be in the owner''s folder' using errcode = '42501';
  end if;
  if new.thumbnail_path is not null and split_part(new.thumbnail_path, '/', 1) <> new.user_id::text then
    raise exception 'thumbnail_path must be in the owner''s folder' using errcode = '42501';
  end if;
  if new.file_path like '%..%' or new.thumbnail_path like '%..%' then
    raise exception 'invalid storage path' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists references_own_paths on public."references";
create trigger references_own_paths before insert or update of file_path, thumbnail_path, user_id
  on public."references" for each row execute function public.references_own_paths();

-- And users may change only what the app lets them edit; files, links and type are set at capture.
revoke update on public."references" from anon, authenticated;
grant update (title, note, description, labels) on public."references" to authenticated;

-- Jobs: one that keeps killing the worker (out of memory, crash) stays 'running' with no Python
-- left to fail it. Once it has used its attempts, it is failed instead of reclaimed forever.
create or replace function public.claim_jobs(n integer)
returns setof public.jobs
language sql
security definer
set search_path = public
as $$
  update public.jobs
     set status = 'failed', error = 'The job stopped the worker too many times', updated_at = now()
   where status = 'running' and updated_at < now() - interval '10 minutes' and attempts >= 5;

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
