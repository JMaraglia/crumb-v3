-- Crumb website: Join The Beta asks "How Did You Hear About Crumb?" (required), shown in Crumb Admin's Beta list.
-- Also: Admin's "Changes Today" / "This Week" counts leave out changes made by admins.
-- Run AFTER 0014_signup_answers.sql. Safe to run more than once. All-or-nothing.
-- Existing sign-ups are kept as they are (their answer stays empty). Nothing is deleted.
begin;

alter table public.beta_signups add column if not exists heard text check (heard is null or length(heard) <= 80);

-- The old 5-field version goes away, so every new sign-up must include the answer.
drop function if exists public.join_beta(text, text, text, text, text);

create or replace function public.join_beta(p_name text, p_email text, p_company text, p_industry text, p_state text, p_heard text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
  clean_name  text := left(trim(coalesce(p_name, '')), 100);
  clean_co    text := nullif(left(trim(coalesce(p_company, '')), 120), '');
  clean_ind   text := left(trim(coalesce(p_industry, '')), 60);
  clean_state text := left(trim(coalesce(p_state, '')), 40);
  clean_heard text := left(trim(coalesce(p_heard, '')), 80);
begin
  if clean_name = '' then
    raise exception 'Please enter your name.' using errcode = '22023';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(clean_email) > 200 then
    raise exception 'Please enter a valid email.' using errcode = '22023';
  end if;
  if clean_ind = '' then
    raise exception 'Please enter your industry.' using errcode = '22023';
  end if;
  if clean_state = '' then
    raise exception 'Please pick your state.' using errcode = '22023';
  end if;
  if clean_heard = '' then
    raise exception 'Please pick how you heard about Crumb.' using errcode = '22023';
  end if;
  if (select count(*) from public.beta_signups b where b.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many sign-ups right now. Please try again later.' using errcode = '54000';
  end if;

  insert into public.beta_signups (name, email, company, industry, state, heard)
  values (clean_name, clean_email, clean_co, clean_ind, clean_state, clean_heard)
  on conflict (lower(email)) do update
    set name = excluded.name,
        company = coalesce(excluded.company, public.beta_signups.company),
        industry = excluded.industry,
        state = excluded.state,
        heard = excluded.heard,
        updated_at = now();
  return 'ok';
end;
$$;

-- Admin list now includes the answer (the return shape changes, so it's dropped first).
drop function if exists public.admin_beta_list();
create function public.admin_beta_list()
returns table (id bigint, name text, email text, company text, industry text, state text, heard text, status text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select b.id, b.name, b.email, b.company, b.industry, b.state, b.heard, b.status, b.created_at, b.updated_at
    from public.beta_signups b
    order by b.created_at desc
    limit 1000;
end;
$$;

revoke all on function public.join_beta(text, text, text, text, text, text) from public;
revoke all on function public.admin_beta_list()                              from public, anon;
grant execute on function public.join_beta(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_beta_list()                             to authenticated;

-- Overview: the same numbers as before, except Changes Today / This Week leave out admins' own changes.
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
    'changes_24h',     (select count(*) from public.operations o where o.received_at > now() - interval '24 hours'
                          and not exists (select 1 from public.admins a where a.user_id = o.user_id)),
    'changes_7d',      (select count(*) from public.operations o where o.received_at > now() - interval '7 days'
                          and not exists (select 1 from public.admins a where a.user_id = o.user_id)),
    'overwrites_7d',   (select count(*) from public.conflicts c where c.created_at > now() - interval '7 days'),
    'needs_review',    (select count(*) from public.conflicts c where c.resolved_at is null),
    'last_change_at',  (select max(o.received_at) from public.operations o),
    'server_time',     now()
  );
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

commit;

select 'Join The Beta now asks how people heard about Crumb. Changes Today leaves out admins.' as result;
