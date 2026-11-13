-- 0017_admin_reports.sql — the numbers behind Crumb Admin's Reports screen (Nov 12, 2026).
--
-- SAFETY:
--   * Adds one read-only function. Changes and deletes nothing.
--   * Admins only (is_admin()); visitors and reps can't call it.
--   * Returns counts, dates and emails only: never the contents of anyone's customers, notes or photos.
--   * Admins' own activity is left out of every number (they're always active).
--   * Run once. Running it again changes nothing. All or nothing (one transaction).
--
-- HOW THE NUMBERS ARE WORKED OUT:
--   * "Active" = synced at least one change. Days are counted in Eastern time.
--   * Week = the last 7 days, compared with the 7 days before. Month = the last 30 days vs the 30 before.
--   * Still Active After 1 Week = of the reps who joined, the share who synced a change 7 to 13 days later.
--     It can only be worked out for reps who joined at least 14 days ago (35 days for Week 4).
--   * What Reps Use Most = share of synced changes by section, last 30 days. Customers and Pipeline are one
--     section here because a change doesn't record which of the two it was. Settings changes are left out.

begin;

create or replace function public.admin_reports()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  with
  reps as (  -- every account that isn't an admin
    select u.id, lower(u.email::text) as email, u.created_at as joined
    from auth.users u
    where not exists (select 1 from public.admins a where a.user_id = u.id)
  ),
  ops as (   -- reps' synced changes
    select o.user_id, o.received_at, o.device, split_part(o.kind, ':', 2) as tbl,
           (o.received_at at time zone 'America/New_York')::date as day
    from public.operations o
    join reps r on r.id = o.user_id
  ),
  spans(key, days) as (values ('week', 7), ('month', 30)),
  period as (
    select s.key,
      (select count(*) from public.beta_signups b where b.created_at > now() - make_interval(days => s.days)) as signups,
      (select count(*) from public.beta_signups b where b.created_at <= now() - make_interval(days => s.days)
                                                     and b.created_at > now() - make_interval(days => 2 * s.days)) as signups_prev,
      (select count(distinct o.user_id) from ops o where o.received_at > now() - make_interval(days => s.days)) as active,
      (select count(distinct o.user_id) from ops o where o.received_at <= now() - make_interval(days => s.days)
                                                     and o.received_at > now() - make_interval(days => 2 * s.days)) as active_prev,
      (select round(avg(d.n), 1) from (select count(distinct o.day) as n from ops o
          where o.received_at > now() - make_interval(days => s.days) group by o.user_id) d) as days_per_rep,
      (select round(avg(d.n), 1) from (select count(distinct o.day) as n from ops o
          where o.received_at <= now() - make_interval(days => s.days)
            and o.received_at > now() - make_interval(days => 2 * s.days) group by o.user_id) d) as days_per_rep_prev,
      -- reps whose first-week check finished inside this period: joined 14 to (14 + days) days ago
      (select round(100.0 * count(*) filter (where exists (select 1 from ops o where o.user_id = r.id
                  and o.received_at >= r.joined + interval '7 days' and o.received_at < r.joined + interval '14 days'))
              / nullif(count(*), 0))
         from reps r where r.joined <= now() - interval '14 days'
                       and r.joined > now() - make_interval(days => 14 + s.days)) as kept1,
      (select round(100.0 * count(*) filter (where exists (select 1 from ops o where o.user_id = r.id
                  and o.received_at >= r.joined + interval '7 days' and o.received_at < r.joined + interval '14 days'))
              / nullif(count(*), 0))
         from reps r where r.joined <= now() - make_interval(days => 14 + s.days)
                       and r.joined > now() - make_interval(days => 14 + 2 * s.days)) as kept1_prev
    from spans s
  ),
  signup as (  -- every beta sign-up, with how far that email has got
    select b.id,
      case when b.heard is null or btrim(b.heard) = '' then 'Not Asked'
           when b.heard ilike 'Other%' then 'Other' else b.heard end as source,
      (b.status = 'invited' or exists (select 1 from public.sync_invites i where i.email = lower(btrim(b.email)))) as invited,
      r.id as rep_id,
      (r.id is not null and exists (select 1 from ops o where o.user_id = r.id)) as used,
      (r.id is not null and exists (select 1 from ops o where o.user_id = r.id and o.received_at > now() - interval '14 days')) as using_now
    from public.beta_signups b
    left join reps r on r.email = lower(btrim(b.email))
  ),
  cohort as (  -- reps grouped by the Monday of the week they joined (last 8 weeks that have anyone)
    select date_trunc('week', (r.joined at time zone 'America/New_York'))::date as week_start,
      count(*) as reps,
      count(*) filter (where r.joined <= now() - interval '14 days') as w1_ready,
      count(*) filter (where r.joined <= now() - interval '14 days' and exists (select 1 from ops o where o.user_id = r.id
              and o.received_at >= r.joined + interval '7 days' and o.received_at < r.joined + interval '14 days')) as w1_kept,
      count(*) filter (where r.joined <= now() - interval '35 days') as w4_ready,
      count(*) filter (where r.joined <= now() - interval '35 days' and exists (select 1 from ops o where o.user_id = r.id
              and o.received_at >= r.joined + interval '28 days' and o.received_at < r.joined + interval '35 days')) as w4_kept
    from reps r
    group by 1 order by 1 desc limit 8
  ),
  feature as (
    select case o.tbl when 'accounts' then 'Customers And Pipeline' when 'notes' then 'Notes' when 'events' then 'Calendar'
                      when 'stops' then 'Daily Stops' when 'day_marks' then 'Daily Stops' when 'todos' then 'To-Dos' end as name,
           count(*) as changes
    from ops o
    where o.received_at > now() - interval '30 days' and o.tbl in ('accounts', 'notes', 'events', 'stops', 'day_marks', 'todos')
    group by 1
  ),
  quiet as (  -- used Crumb before, nothing in the last 7 days
    select r.email, max(o.received_at) as last_change_at, count(distinct o.day) as active_days,
           count(distinct o.device) filter (where o.received_at > now() - interval '30 days') as devices_30d
    from reps r join ops o on o.user_id = r.id
    group by r.email
    having max(o.received_at) <= now() - interval '7 days'
  )
  select jsonb_build_object(
    'made_at', now(),
    'periods', (select jsonb_object_agg(p.key, to_jsonb(p) - 'key') from period p),
    'funnel', (select jsonb_build_object(
        'signed_up', count(*),
        'invited',   count(*) filter (where s.invited),
        'account',   count(*) filter (where s.invited and s.rep_id is not null),
        'used',      count(*) filter (where s.invited and s.used)) from signup s),
    'sources', (select coalesce(jsonb_agg(x order by x.signed_up desc, x.source), '[]'::jsonb) from (
        select s.source, count(*) as signed_up, count(*) filter (where s.using_now) as using_now from signup s group by s.source) x),
    'cohorts', (select coalesce(jsonb_agg(jsonb_build_object(
        'week_start', c.week_start, 'reps', c.reps,
        'week1', case when c.w1_ready > 0 then round(100.0 * c.w1_kept / c.w1_ready) end,
        'week4', case when c.w4_ready > 0 then round(100.0 * c.w4_kept / c.w4_ready) end) order by c.week_start desc), '[]'::jsonb) from cohort c),
    'features', (select coalesce(jsonb_agg(jsonb_build_object('name', f.name, 'changes', f.changes) order by f.changes desc, f.name), '[]'::jsonb) from feature f),
    'quiet', (select coalesce(jsonb_agg(to_jsonb(q) order by q.last_change_at desc), '[]'::jsonb) from quiet q)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_reports() from public, anon;
grant execute on function public.admin_reports() to authenticated;

commit;

select 'Crumb Admin Reports now has its numbers.' as result;
