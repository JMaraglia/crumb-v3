-- Crumb Admin, step 4: Report A Problem + Make A Suggestion (Crumb app) and the Inbox (Crumb Admin).
-- Run AFTER 0006_admin_delete.sql. Safe to run more than once.
--
-- Reps send what they typed + area + device + app version. Nothing else from their data is attached.
-- Only the sender's own sign-in can send; only admins can read or change status.

create table if not exists public.feedback (
  id           bigint generated always as identity primary key,   -- the ticket number
  kind         text not null check (kind in ('problem', 'suggestion')),
  user_id      uuid references auth.users (id) on delete set null,
  email        text,
  area         text,
  message      text not null check (length(message) between 1 and 2000),
  device       text,
  app_version  text,
  status       text not null default 'new',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint feedback_status_ok check (
    (kind = 'problem'    and status in ('new', 'investigating', 'in_progress', 'resolved', 'closed')) or
    (kind = 'suggestion' and status in ('new', 'exploring', 'approved', 'postponed', 'declined'))
  )
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
alter table public.feedback enable row level security;  -- no rules = no direct access; only the functions below

-- ---------------------------------------------------------------- send (any signed-in Crumb user)
create or replace function public.submit_feedback(
  p_kind text, p_area text, p_message text, p_device text, p_version text
)
returns bigint
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  new_id bigint;
begin
  if me is null then
    raise exception 'Sign in to send.' using errcode = '42501';
  end if;
  if p_kind not in ('problem', 'suggestion') then
    raise exception 'Unknown kind.' using errcode = '22023';
  end if;
  if coalesce(length(trim(p_message)), 0) = 0 then
    raise exception 'Type a few words first.' using errcode = '22023';
  end if;
  if (select count(*) from public.feedback f where f.user_id = me and f.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'That''s a lot for one day. Try again tomorrow.' using errcode = '54000';
  end if;

  insert into public.feedback (kind, user_id, email, area, message, device, app_version)
  values (
    p_kind, me,
    (select u.email from auth.users u where u.id = me),
    left(nullif(trim(p_area), ''), 40),
    left(trim(p_message), 2000),
    left(nullif(trim(p_device), ''), 60),
    left(nullif(trim(p_version), ''), 60)
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------- admin: list + change status
create or replace function public.admin_feedback_list()
returns table (
  id bigint, kind text, email text, area text, message text, device text, app_version text,
  status text, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.kind, f.email, f.area, f.message, f.device, f.app_version, f.status, f.created_at, f.updated_at
    from public.feedback f
    order by f.created_at desc
    limit 500;
end;
$$;

create or replace function public.admin_feedback_set_status(p_id bigint, p_status text)
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  f public.feedback;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into f from public.feedback where id = p_id;
  if f.id is null then
    raise exception 'No ticket with that number.' using errcode = '22023';
  end if;
  if not ((f.kind = 'problem'    and p_status in ('new', 'investigating', 'in_progress', 'resolved', 'closed')) or
          (f.kind = 'suggestion' and p_status in ('new', 'exploring', 'approved', 'postponed', 'declined'))) then
    raise exception 'That status doesn''t fit this item.' using errcode = '22023';
  end if;
  if f.status = p_status then
    return p_status;
  end if;

  update public.feedback set status = p_status, updated_at = now() where id = p_id;
  insert into public.admin_log (admin_id, admin_email, action, target_email, details)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), 'feedback_status', f.email,
          jsonb_build_object('id', f.id, 'kind', f.kind, 'from', f.status, 'to', p_status));
  return p_status;
end;
$$;

revoke all on function public.submit_feedback(text, text, text, text, text)  from public, anon;
revoke all on function public.admin_feedback_list()                          from public, anon;
revoke all on function public.admin_feedback_set_status(bigint, text)        from public, anon;
grant execute on function public.submit_feedback(text, text, text, text, text) to authenticated;
grant execute on function public.admin_feedback_list()                         to authenticated;
grant execute on function public.admin_feedback_set_status(bigint, text)       to authenticated;

select 'Crumb Admin step 4 (Inbox) is set up.' as result;
