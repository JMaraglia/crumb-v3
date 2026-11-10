-- Crumb website: Join The Beta asks for Industry and State (both required), shown in Crumb Admin's Beta list.
-- Run AFTER 0010_sync_invites.sql. Safe to run more than once. All-or-nothing.
-- Existing sign-ups are kept as they are (their industry and state stay empty).
begin;

alter table public.beta_signups add column if not exists industry text check (industry is null or length(industry) <= 60);
alter table public.beta_signups add column if not exists state    text check (state is null or length(state) <= 40);

-- The old 3-field version goes away, so every new sign-up must include industry and state.
drop function if exists public.join_beta(text, text, text);

create or replace function public.join_beta(p_name text, p_email text, p_company text, p_industry text, p_state text)
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
  if (select count(*) from public.beta_signups b where b.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many sign-ups right now. Please try again later.' using errcode = '54000';
  end if;

  insert into public.beta_signups (name, email, company, industry, state)
  values (clean_name, clean_email, clean_co, clean_ind, clean_state)
  on conflict (lower(email)) do update
    set name = excluded.name,
        company = coalesce(excluded.company, public.beta_signups.company),
        industry = excluded.industry,
        state = excluded.state,
        updated_at = now();
  return 'ok';
end;
$$;

-- Admin list now includes industry and state (the return shape changes, so it's dropped first).
drop function if exists public.admin_beta_list();
create function public.admin_beta_list()
returns table (id bigint, name text, email text, company text, industry text, state text, status text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select b.id, b.name, b.email, b.company, b.industry, b.state, b.status, b.created_at, b.updated_at
    from public.beta_signups b
    order by b.created_at desc
    limit 1000;
end;
$$;

revoke all on function public.join_beta(text, text, text, text, text) from public;
revoke all on function public.admin_beta_list()                        from public, anon;
grant execute on function public.join_beta(text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_beta_list()                       to authenticated;

commit;

select 'Join The Beta now asks for Industry and State.' as result;
