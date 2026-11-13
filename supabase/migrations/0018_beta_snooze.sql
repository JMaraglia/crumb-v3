-- 0018_beta_snooze.sql — lets Crumb Admin snooze a beta sign-up (Nov 12, 2026).
--
-- A snoozed sign-up stops counting as "new", so its alert goes away. It stays snoozed until an admin
-- moves it back, invites it or declines it.
--
-- SAFETY:
--   * Adds one allowed status ("snoozed") for beta sign-ups. No sign-up is changed or deleted.
--   * Replaces one function (admin_beta_set_status): same as before, plus it accepts "snoozed".
--     Snoozed behaves like New and Declined for access: the email is not on the invite list.
--   * Admins only, as before. Run once. Running it again changes nothing. All or nothing (one transaction).

begin;

-- The list of allowed statuses lives in a rule on the table: swap it for one that includes "snoozed".
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.beta_signups'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.beta_signups drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.beta_signups
  add constraint beta_signups_status_check check (status in ('new', 'invited', 'declined', 'snoozed'));

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
  if p_status not in ('new', 'invited', 'declined', 'snoozed') then
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

commit;

select 'Beta sign-ups can now be snoozed.' as result;
