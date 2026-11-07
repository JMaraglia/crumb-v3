-- Crumb Admin, step 2: Delete Account (with guardrails) + a log of admin actions.
-- Run AFTER 0005_admin.sql. Safe to run more than once.
--
-- Guardrails (all checked here in the database, not just in the app):
--   * only admins can look or delete;
--   * the email must be typed again exactly to confirm;
--   * you can't delete yourself or another admin;
--   * workspaces that someone else also belongs to are never deleted;
--   * every delete is written to public.admin_log (who, when, what).
-- Deleting cannot be undone. The rep's phone keeps its own copy until the app is removed.

-- ---------------------------------------------------------------- admin log
create table if not exists public.admin_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  admin_id     uuid,
  admin_email  text,
  action       text not null,
  target_email text,
  details      jsonb not null default '{}'::jsonb
);
alter table public.admin_log enable row level security;  -- no rules = no direct access from any app

-- Recent admin actions (newest first).
create or replace function public.admin_log_recent(p_limit int default 10)
returns table (at timestamptz, admin_email text, action text, target_email text, details jsonb)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select l.at, l.admin_email, l.action, l.target_email, l.details
    from public.admin_log l
    order by l.at desc
    limit least(greatest(coalesce(p_limit, 10), 1), 100);
end;
$$;

-- ---------------------------------------------------------------- what would be deleted?
-- Counts only (no contents): what this person has in the cloud that would be deleted with them.
create or replace function public.admin_user_footprint(p_email text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  target uuid;
  solo uuid[];
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select u.id into target from auth.users u where lower(u.email) = lower(trim(p_email));
  if target is null then
    return jsonb_build_object('found', false);
  end if;

  -- workspaces where this person is the only member (these go with them)
  select coalesce(array_agg(m.workspace_id), '{}') into solo
  from public.memberships m
  where m.user_id = target
    and not exists (select 1 from public.memberships o where o.workspace_id = m.workspace_id and o.user_id <> target);

  return jsonb_build_object(
    'found',         true,
    'is_self',       target = auth.uid(),
    'is_admin',      exists (select 1 from public.admins a where a.user_id = target),
    'shared_workspaces', (select count(*) from public.memberships m where m.user_id = target) - coalesce(array_length(solo, 1), 0),
    'accounts',      (select count(*) from public.accounts  x where x.workspace_id = any (solo) and x.deleted_at is null),
    'notes',         (select count(*) from public.notes     x where x.workspace_id = any (solo) and x.deleted_at is null),
    'events',        (select count(*) from public.events    x where x.workspace_id = any (solo) and x.deleted_at is null),
    'stops',         (select count(*) from public.stops     x where x.workspace_id = any (solo) and x.deleted_at is null),
    'todos',         (select count(*) from public.todos     x where x.workspace_id = any (solo) and x.deleted_at is null),
    'photos',        (select count(*) from public.photos    x where x.workspace_id = any (solo) and x.deleted_at is null),
    'last_change_at',(select max(o.received_at) from public.operations o where o.user_id = target)
  );
end;
$$;

-- ---------------------------------------------------------------- delete
create or replace function public.admin_delete_user(p_email text, p_confirm text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me_email text;
  target uuid;
  target_email text;
  solo uuid[];
  footprint jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_email is null or p_confirm is null or lower(trim(p_email)) <> lower(trim(p_confirm)) then
    raise exception 'The typed email doesn''t match.' using errcode = '22023';
  end if;

  select u.id, u.email into target, target_email from auth.users u where lower(u.email) = lower(trim(p_email));
  if target is null then
    raise exception 'No account with that email.' using errcode = '22023';
  end if;
  if target = auth.uid() then
    raise exception 'You can''t delete your own account here.' using errcode = '42501';
  end if;
  if exists (select 1 from public.admins a where a.user_id = target) then
    raise exception 'Admins can''t be deleted here. Remove their admin rights first.' using errcode = '42501';
  end if;

  footprint := public.admin_user_footprint(target_email);

  select coalesce(array_agg(m.workspace_id), '{}') into solo
  from public.memberships m
  where m.user_id = target
    and not exists (select 1 from public.memberships o where o.workspace_id = m.workspace_id and o.user_id <> target);

  -- Their own workspaces: notes and photos first (they block deleting accounts), then the workspace,
  -- which takes accounts, events, stops, to-dos, marks, settings, history and memberships with it.
  delete from public.notes      where workspace_id = any (solo);
  delete from public.photos     where workspace_id = any (solo);
  delete from public.workspaces where id = any (solo);

  -- The sign-in itself (also removes any remaining memberships in shared workspaces).
  delete from auth.users where id = target;

  select u.email into me_email from auth.users u where u.id = auth.uid();
  insert into public.admin_log (admin_id, admin_email, action, target_email, details)
  values (auth.uid(), me_email, 'delete_account', target_email, footprint - 'found' - 'is_self' - 'is_admin');

  return footprint || jsonb_build_object('deleted', true, 'email', target_email);
end;
$$;

revoke all on function public.admin_log_recent(int)              from public, anon;
revoke all on function public.admin_user_footprint(text)         from public, anon;
revoke all on function public.admin_delete_user(text, text)      from public, anon;
grant execute on function public.admin_log_recent(int)           to authenticated;
grant execute on function public.admin_user_footprint(text)      to authenticated;
grant execute on function public.admin_delete_user(text, text)   to authenticated;

select 'Crumb Admin step 2 (Delete Account) is set up.' as result;
