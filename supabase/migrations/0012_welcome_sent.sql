-- 0012_welcome_sent.sql — Record each welcome email so approving never sends a second one by accident (Nov 10, 2026).
--
-- WHAT IT ADDS:
--   * welcome_emails: one row per email address — when the welcome email first went out, the last time, how many times.
--     Kept by email (not tied to Sync Access), so taking someone's access away and giving it back never re-sends.
--   * admin_welcome_claim(email, resend): the server asks this BEFORE sending. It says yes only if
--       - resend = false and no welcome email has ever gone to this address, or
--       - resend = true (the founder tapped Resend Welcome Email and confirmed).
--     A claim also blocks a second send for the same address for 2 minutes (double taps, two tabs).
--   * admin_welcome_done(email, ok): the server reports back. ok = true records the send (and logs it);
--     ok = false releases the claim so it can be tried again.
--   * admin_welcome_list(): for Crumb Admin, to show "Welcome Sent Nov 10" on each approved email.
--
-- SAFETY:
--   * Adds one new table and four new functions. Changes and deletes nothing that exists.
--   * Admins only (is_admin()); visitors and reps can't read or touch any of it.
--   * Run once. Running it again changes nothing. All or nothing (one transaction).

begin;

create table if not exists public.welcome_emails (
  email          text primary key check (email = lower(btrim(email)) and email like '%_@_%'),
  first_sent_at  timestamptz,
  last_sent_at   timestamptz,
  times          int not null default 0,
  claimed_at     timestamptz
);
alter table public.welcome_emails enable row level security;  -- no rules: only the functions below touch it
revoke all on public.welcome_emails from anon, authenticated;

-- ---------------------------------------------------------------- may the server send now?
create or replace function public.admin_welcome_claim(p_email text, p_resend boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  w public.welcome_emails;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sync_invites i where i.email = e) then
    raise exception 'Only approved emails can get the welcome email. Approve them first.' using errcode = '22023';
  end if;
  insert into public.welcome_emails (email) values (e) on conflict (email) do nothing;
  select * into w from public.welcome_emails where email = e for update;  -- one claim at a time per address
  if w.claimed_at is not null and w.claimed_at > now() - interval '2 minutes' then
    return jsonb_build_object('send', false, 'reason', 'sending', 'sent_at', w.last_sent_at, 'times', w.times);
  end if;
  if not coalesce(p_resend, false) and w.first_sent_at is not null then
    return jsonb_build_object('send', false, 'reason', 'already_sent', 'sent_at', w.last_sent_at, 'times', w.times);
  end if;
  update public.welcome_emails set claimed_at = now() where email = e;
  return jsonb_build_object('send', true, 'sent_at', w.last_sent_at, 'times', w.times);
end;
$$;

-- ---------------------------------------------------------------- the server reports back
create or replace function public.admin_welcome_done(p_email text, p_ok boolean, p_resend boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  w public.welcome_emails;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(p_ok, false) then
    update public.welcome_emails
       set first_sent_at = coalesce(first_sent_at, now()), last_sent_at = now(), times = times + 1, claimed_at = null
     where email = e
     returning * into w;
    insert into public.admin_log (admin_id, admin_email, action, target_email, details)
    values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), 'welcome_sent', e,
            jsonb_build_object('resend', coalesce(p_resend, false), 'times', w.times));
  else
    update public.welcome_emails set claimed_at = null where email = e returning * into w;
  end if;
  return jsonb_build_object('sent_at', w.last_sent_at, 'times', coalesce(w.times, 0));
end;
$$;

-- ---------------------------------------------------------------- Admin: who got one, and when
create or replace function public.admin_welcome_list()
returns table (email text, first_sent_at timestamptz, last_sent_at timestamptz, times int)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select w.email, w.first_sent_at, w.last_sent_at, w.times
    from public.welcome_emails w
    where w.times > 0
    order by w.last_sent_at desc;
end;
$$;

revoke all on function public.admin_welcome_claim(text, boolean) from public, anon;
revoke all on function public.admin_welcome_done(text, boolean, boolean) from public, anon;
revoke all on function public.admin_welcome_list() from public, anon;
grant execute on function public.admin_welcome_claim(text, boolean) to authenticated;
grant execute on function public.admin_welcome_done(text, boolean, boolean) to authenticated;
grant execute on function public.admin_welcome_list() to authenticated;

commit;

-- (end of file)
