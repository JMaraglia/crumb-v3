-- "How Did You Hear About Crumb?" check. Run in the SQL Editor AFTER 0015_beta_heard.sql.
-- Changes nothing (rolled back). The last line should say: ALL 5 HEARD CHECKS PASSED

begin;

create temp table heard_check_result (n int, ok boolean, what text) on commit drop;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  refused  boolean;
  got      text;
  n        int;
begin
  -- 1. A sign-up without the answer is refused
  refused := false;
  begin perform public.join_beta('Check Person', 'heard-check@example.com', '', 'Food', 'Ohio', '');
  exception when others then refused := true; end;
  insert into heard_check_result values (1, refused, 'answer is required');

  -- 2. A sign-up with the answer saves it
  perform public.join_beta('Check Person', 'heard-check@example.com', '', 'Food', 'Ohio', 'LinkedIn');
  select b.heard into got from public.beta_signups b where b.email = 'heard-check@example.com';
  insert into heard_check_result values (2, got = 'LinkedIn', 'answer is saved');

  -- 3. The old 5-field version is gone
  insert into heard_check_result values (3, to_regprocedure('public.join_beta(text,text,text,text,text)') is null, 'old version removed');

  -- 4. A visitor can join, but can't read the list
  insert into heard_check_result values (4,
    has_function_privilege('anon', 'public.join_beta(text,text,text,text,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.admin_beta_list()', 'execute')
    and not has_function_privilege('anon', 'public.admin_overview()', 'execute'), 'visitor can join but not read');

  -- 5. The admin sees the answer in the list, and the overview still works
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  select count(*) into n from public.admin_beta_list() l where l.email = 'heard-check@example.com' and l.heard = 'LinkedIn';
  insert into heard_check_result values (5, n = 1 and (public.admin_overview() ? 'changes_24h'), 'admin sees the answer; overview works');
end $$;

select case when bool_and(ok) and count(*) = 5
            then 'ALL 5 HEARD CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from heard_check_result;

rollback;
