-- 0016_admin_user_id.sql — lets Crumb Admin's "Send A Nudge" find a rep's account by email (Nov 11, 2026).
--
-- SAFETY:
--   * Adds one read-only function. Changes and deletes nothing.
--   * Admins only (is_admin()); visitors and reps can't call it. Returns only the account's ID.
--   * Run once. Running it again changes nothing. All or nothing (one transaction).

begin;

create or replace function public.admin_user_id(p_email text)
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return (select u.id from auth.users u where lower(u.email::text) = lower(trim(coalesce(p_email, ''))) limit 1);
end;
$$;

revoke all on function public.admin_user_id(text) from public, anon;
grant execute on function public.admin_user_id(text) to authenticated;

commit;

select 'Send A Nudge can now find a rep by email.' as result;
