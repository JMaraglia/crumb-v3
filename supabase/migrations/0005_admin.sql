-- Crumb Admin, step 1: read-only summaries for the separate admin app.
--
-- Safe to run more than once. Adds no tables and changes no data except adding
-- the founder to public.admins.
--
-- Privacy rule: these return counts, dates, emails and device names only,
-- never customers, notes, events, stops, to-dos or photos.
-- Only people listed in public.admins can run them; everyone else gets "not allowed".

-- Is the signed-in person a Crumb admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- Overview: how is the business doing?
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'users_total',     (select count(*) from auth.users),
    'users_new_7d',    (select count(*) from auth.users u where u.created_at > now() - interval '7 days'),
    'users_active_7d', (select count(distinct o.user_id) from public.operations o where o.received_at > now() - interval '7 days'),
    'devices_30d',     (select count(distinct o.device) from public.operations o where o.received_at > now() - interval '30 days' and o.device is not null),
    'changes_24h',     (select count(*) from public.operations o where o.received_at > now() - interval '24 hours'),
    'changes_7d',      (select count(*) from public.operations o where o.received_at > now() - interval '7 days'),
    'overwrites_7d',   (select count(*) from public.conflicts c where c.created_at > now() - interval '7 days'),
    'needs_review',    (select count(*) from public.conflicts c where c.resolved_at is null),
    'last_change_at',  (select max(o.received_at) from public.operations o),
    'server_time',     now()
  );
end;
$$;

-- Users: one row per person who signed up. No record contents.
create or replace function public.admin_users()
returns table (
  email           text,
  joined_at       timestamptz,
  last_sign_in_at timestamptz,
  last_change_at  timestamptz,
  devices_30d     bigint,
  changes_7d      bigint,
  is_admin        boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
    select
      u.email::text,
      u.created_at,
      u.last_sign_in_at,
      (select max(o.received_at) from public.operations o where o.user_id = u.id),
      (select count(distinct o.device) from public.operations o
         where o.user_id = u.id and o.device is not null and o.received_at > now() - interval '30 days'),
      (select count(*) from public.operations o
         where o.user_id = u.id and o.received_at > now() - interval '7 days'),
      exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u
    order by u.created_at;
end;
$$;

-- Only signed-in people can even try (and only admins get an answer).
revoke all on function public.is_admin()       from public, anon;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_users()    from public, anon;
grant execute on function public.is_admin()       to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_users()    to authenticated;

-- The founder is the first admin.
insert into public.admins (user_id)
select u.id from auth.users u where lower(u.email) = 'jmaraglia@gmail.com'
on conflict (user_id) do nothing;

select 'Crumb Admin step 1 is set up. Admins: ' || (select count(*) from public.admins) as result;
