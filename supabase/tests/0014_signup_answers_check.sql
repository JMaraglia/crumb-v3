-- Create Account answers check. Run in the SQL Editor AFTER 0014_signup_answers.sql.
-- Changes nothing (rolled back). The last line should say: ALL 3 ANSWERS CHECKS PASSED

begin;

create temp table ans_check_result (n int, ok boolean, what text) on commit drop;
grant all on ans_check_result to anon, authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  refused  boolean;
  n        int;
begin
  -- 1. A visitor can't read the answers
  set local role anon;
  refused := false;
  begin perform public.admin_signup_answers(); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into ans_check_result values (1, refused, 'visitor cannot read answers');

  -- 2. A signed-in rep can't read them
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_signup_answers(); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into ans_check_result values (2, refused, 'rep cannot read answers');

  -- 3. The admin can
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.admin_signup_answers();
  reset role;
  insert into ans_check_result values (3, n >= 0, 'admin can read answers');
end $$;

select case when bool_and(ok) and count(*) = 3
            then 'ALL 3 ANSWERS CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from ans_check_result;

rollback;
