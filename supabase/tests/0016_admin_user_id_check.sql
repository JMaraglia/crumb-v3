-- Send A Nudge lookup check. Run in the SQL Editor AFTER 0016_admin_user_id.sql.
-- Changes nothing (rolled back). The last line should say: ALL 3 NUDGE CHECKS PASSED

begin;

create temp table nudge_check_result (n int, ok boolean, what text) on commit drop;
grant all on nudge_check_result to anon, authenticated;

do $$
declare
  admin_id    uuid := (select user_id from public.admins limit 1);
  admin_email text := (select u.email::text from auth.users u where u.id = (select user_id from public.admins limit 1));
  refused     boolean;
  got         uuid;
begin
  -- 1. A visitor can't call it at all
  insert into nudge_check_result values (1, not has_function_privilege('anon', 'public.admin_user_id(text)', 'execute'), 'visitor cannot look anyone up');

  -- 2. A signed-in rep is refused
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_user_id(admin_email); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into nudge_check_result values (2, refused, 'rep cannot look anyone up');

  -- 3. The admin gets the right account, and nothing for an unknown email
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  got := public.admin_user_id(upper(admin_email));
  refused := public.admin_user_id('nobody-here@example.com') is null;
  reset role;
  insert into nudge_check_result values (3, got = admin_id and refused, 'admin finds the right account');
end $$;

select case when bool_and(ok) and count(*) = 3
            then 'ALL 3 NUDGE CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from nudge_check_result;

rollback;
