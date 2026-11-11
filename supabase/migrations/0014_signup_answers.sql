-- 0014_signup_answers.sql — Crumb Admin can read the Create Account answers (Nov 10, 2026).
--
-- The answers are saved with each new account by Supabase itself (the account's own details,
-- under "crumb_signup"). This adds one read-only function so Crumb Admin can show them.
--
-- SAFETY:
--   * Adds one function. Changes and deletes nothing. Reads only the answers and the email.
--   * Admins only (is_admin()); visitors and reps can't call it.
--   * Run once. Running it again changes nothing. All or nothing (one transaction).

begin;

create or replace function public.admin_signup_answers()
returns table (email text, answers jsonb, created_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select lower(u.email::text), u.raw_user_meta_data -> 'crumb_signup', u.created_at
    from auth.users u
    where u.raw_user_meta_data ? 'crumb_signup'
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_signup_answers() from public, anon;
grant execute on function public.admin_signup_answers() to authenticated;

commit;

-- (end of file)
