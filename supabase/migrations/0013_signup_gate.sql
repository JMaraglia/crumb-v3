-- 0013_signup_gate.sql — Only approved emails can create a Crumb account (Nov 10, 2026).
--
-- HOW IT WORKS:
--   Supabase calls this function every time someone tries to create an account (the "Before User Created"
--   hook). If the email is on the Sync Access list (approved in Crumb Admin), the account is created.
--   If not, it is refused with a plain message, and nothing is created.
--
-- AFTER RUNNING THIS FILE, turn it on in Supabase:
--   Authentication → Hooks → Add hook → Before User Created → Postgres → schema public →
--   function hook_before_user_created → Create.
--   Until that switch is on, this function exists but nothing calls it (sign-ups work as before).
--
-- SAFETY:
--   * Existing accounts are never touched. Signing in is not affected, only creating a new account.
--   * Adds one function. Changes and deletes nothing that exists.
--   * Only Supabase's own sign-up system (supabase_auth_admin) may call it; visitors and reps can't.
--   * If the check itself fails for any reason, the sign-up is refused (never let in by mistake).
--   * Run once. Running it again changes nothing. All or nothing (one transaction).

begin;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(event->'user'->>'email', '')));
begin
  if e <> '' and exists (select 1 from public.sync_invites i where i.email = e) then
    return '{}'::jsonb;  -- approved: create the account
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This email isn’t approved for the Crumb beta yet. Join the beta waitlist at CrumbSales.com.'
  ));
exception when others then
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 500,
    'message', 'Couldn’t check whether this email is approved. Try again in a minute.'
  ));
end;
$$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin';
  end if;
end $$;

commit;

-- (end of file)
