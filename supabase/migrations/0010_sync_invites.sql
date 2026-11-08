-- 0010_sync_invites.sql — Invite-only cloud sync (Nov 8, 2026).
--
-- TWO SEPARATE PROTECTIONS:
--   1. Separation (from 0001/0004, NOT changed here): "members read / add / change" rules keep every
--      account's data inside its own workspace. Nothing in this file edits, replaces or removes them.
--   2. Invite eligibility (NEW): an extra RESTRICTIVE rule on the same tables. Postgres lets a request
--      through only if it passes BOTH: the separation rules AND this one. A restrictive rule can only
--      narrow access, never widen it.
--
-- SAFETY:
--   * No data is deleted, changed or moved. No existing table, rule or sync function is altered.
--     The only replaced function is admin_beta_set_status (same as before, plus: Invited = may sync).
--   * Lockout guard: every current admin is put on the invite list, admins always pass can_sync(),
--     and an admin's email can't be removed from the list.
--   * Run once. Running it again changes nothing.

-- ---------------------------------------------------------------- the list
create table if not exists public.sync_invites (
  email     text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  source    text not null default 'admin' check (source in ('founder', 'admin', 'beta')),
  added_at  timestamptz not null default now(),
  added_by  uuid
);
alter table public.sync_invites enable row level security;  -- no rules: only the functions below touch it
revoke all on public.sync_invites from anon, authenticated;

-- Lockout guard: every current admin (the founder) is invited.
insert into public.sync_invites (email, source)
select lower(btrim(u.email)), 'founder'
from public.admins a
join auth.users u on u.id = a.user_id
where u.email is not null
on conflict (email) do nothing;

-- ---------------------------------------------------------------- may the signed-in person sync?
create or replace function public.can_sync()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin()
      or exists (
           select 1
           from auth.users u
           join public.sync_invites i on i.email = lower(btrim(u.email))
           where u.id = auth.uid()
         );
$$;
revoke all on function public.can_sync() from public, anon;
grant execute on function public.can_sync() to authenticated;

-- ---------------------------------------------------------------- protection 2: invite eligibility
-- Restrictive = must ALSO pass, on top of the existing "members …" (separation) rules.
do $$
declare t text;
begin
  foreach t in array array['accounts', 'notes', 'events', 'stops', 'todos', 'day_marks', 'settings', 'photos', 'operations', 'conflicts'] loop
    execute format('drop policy if exists "invited only" on public.%I', t);
    execute format('create policy "invited only" on public.%I as restrictive for all to authenticated using (public.can_sync()) with check (public.can_sync())', t);
  end loop;
end $$;

-- Photo files: only the 'photos' bucket is affected.
drop policy if exists "crumb photos: invited only" on storage.objects;
create policy "crumb photos: invited only" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'photos' or public.can_sync())
  with check (bucket_id <> 'photos' or public.can_sync());

-- ---------------------------------------------------------------- Admin: see / add / remove
create or replace function public.admin_sync_invites_list()
returns table (email text, source text, added_at timestamptz, has_account boolean)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select i.email, i.source, i.added_at,
           exists (select 1 from auth.users u where lower(btrim(u.email)) = i.email)
    from public.sync_invites i
    order by i.added_at desc;
end;
$$;

create or replace function public.admin_sync_invite_add(p_email text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That doesn''t look like an email address.' using errcode = '22023';
  end if;
  insert into public.sync_invites (email, source, added_by) values (e, 'admin', auth.uid())
  on conflict (email) do nothing;
  insert into public.admin_log (admin_id, admin_email, action, target_email, details)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), 'invite_add', e, '{}'::jsonb);
  return e;
end;
$$;

create or replace function public.admin_sync_invite_remove(p_email text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Lockout guard: an admin's own access can't be removed here.
  if exists (select 1 from public.admins a join auth.users u on u.id = a.user_id where lower(btrim(u.email)) = e) then
    raise exception 'That email belongs to an admin, so its access can''t be removed.' using errcode = '42501';
  end if;
  delete from public.sync_invites where email = e;
  insert into public.admin_log (admin_id, admin_email, action, target_email, details)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), 'invite_remove', e, '{}'::jsonb);
  return e;
end;
$$;

revoke all on function public.admin_sync_invites_list() from public, anon;
revoke all on function public.admin_sync_invite_add(text) from public, anon;
revoke all on function public.admin_sync_invite_remove(text) from public, anon;
grant execute on function public.admin_sync_invites_list() to authenticated;
grant execute on function public.admin_sync_invite_add(text) to authenticated;
grant execute on function public.admin_sync_invite_remove(text) to authenticated;

-- ---------------------------------------------------------------- Beta: Invited = may sync
-- Same as 0009, plus: marking a sign-up Invited adds its email to the list; moving it back to New or
-- Declined takes it off again (only if it came from Beta, never an admin's or one added by hand).
create or replace function public.admin_beta_set_status(p_id bigint, p_status text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.beta_signups;
  e text;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_status not in ('new', 'invited', 'declined') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;
  select * into b from public.beta_signups where id = p_id;
  if b.id is null then
    raise exception 'No sign-up with that number.' using errcode = '22023';
  end if;
  e := lower(btrim(b.email));
  if p_status = 'invited' then
    insert into public.sync_invites (email, source, added_by) values (e, 'beta', auth.uid())
    on conflict (email) do nothing;
  else
    delete from public.sync_invites where email = e and source = 'beta';
  end if;
  if b.status = p_status then
    return p_status;
  end if;
  update public.beta_signups set status = p_status, updated_at = now() where id = p_id;
  insert into public.admin_log (admin_id, admin_email, action, target_email, details)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), 'beta_status', b.email,
          jsonb_build_object('id', b.id, 'from', b.status, 'to', p_status));
  return p_status;
end;
$$;

-- (end of file)
