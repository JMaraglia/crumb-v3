-- Crumb website: Join The Beta sign-ups (crumbsales.com) + the Beta tab in Crumb Admin's Inbox.
-- Run AFTER 0008_feedback.sql. Safe to run more than once.
--
-- Visitors can only ADD themselves (through join_beta). Only admins can read the list or change a status.
-- Spam limits: one row per email (a repeat just updates it) and at most 100 new sign-ups an hour overall.

create table if not exists public.beta_signups (
  id          bigint generated always as identity primary key,
  name        text not null check (length(name) between 1 and 100),
  email       text not null check (length(email) between 5 and 200),
  company     text check (company is null or length(company) <= 120),
  status      text not null default 'new' check (status in ('new', 'invited', 'declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists beta_signups_email_idx on public.beta_signups (lower(email));
alter table public.beta_signups enable row level security;  -- no rules = no direct access; only the functions below

-- ---------------------------------------------------------------- website form (anyone)
create or replace function public.join_beta(p_name text, p_email text, p_company text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
  clean_name  text := left(trim(coalesce(p_name, '')), 100);
  clean_co    text := nullif(left(trim(coalesce(p_company, '')), 120), '');
begin
  if clean_name = '' then
    raise exception 'Please enter your name.' using errcode = '22023';
  end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(clean_email) > 200 then
    raise exception 'Please enter a valid email.' using errcode = '22023';
  end if;
  if (select count(*) from public.beta_signups b where b.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many sign-ups right now. Please try again later.' using errcode = '54000';
  end if;

  insert into public.beta_signups (name, email, company)
  values (clean_name, clean_email, clean_co)
  on conflict (lower(email)) do update
    set name = excluded.name,
        company = coalesce(excluded.company, public.beta_signups.company),
        updated_at = now();
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------- Crumb Admin
create or replace function public.admin_beta_list()
returns table (id bigint, name text, email text, company text, status text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select b.id, b.name, b.email, b.company, b.status, b.created_at, b.updated_at
    from public.beta_signups b
    order by b.created_at desc
    limit 1000;
end;
$$;

create or replace function public.admin_beta_set_status(p_id bigint, p_status text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  b public.beta_signups;
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

revoke all on function public.join_beta(text, text, text)          from public;
revoke all on function public.admin_beta_list()                     from public, anon;
revoke all on function public.admin_beta_set_status(bigint, text)   from public, anon;
grant execute on function public.join_beta(text, text, text)        to anon, authenticated;
grant execute on function public.admin_beta_list()                  to authenticated;
grant execute on function public.admin_beta_set_status(bigint, text) to authenticated;

select 'Crumb website Join The Beta is set up.' as result;
