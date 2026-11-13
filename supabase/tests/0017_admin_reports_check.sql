-- Reports check. Run in the SQL Editor AFTER 0017_admin_reports.sql.
-- Changes nothing (rolled back). The last line should say: ALL 3 REPORT CHECKS PASSED

begin;

create temp table report_check_result (n int, ok boolean, what text) on commit drop;
grant all on report_check_result to anon, authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  refused  boolean;
  r        jsonb;
begin
  -- 1. A visitor can't call it at all
  insert into report_check_result values (1, not has_function_privilege('anon', 'public.admin_reports()', 'execute'), 'visitor cannot read reports');

  -- 2. A signed-in rep is refused
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_reports(); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into report_check_result values (2, refused, 'rep cannot read reports');

  -- 3. The admin gets every section
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.admin_reports();
  reset role;
  insert into report_check_result values (3, r ?& array['periods', 'funnel', 'sources', 'cohorts', 'features', 'quiet']
    and r -> 'periods' ?& array['week', 'month'], 'admin gets every section');
end $$;

select case when bool_and(ok) and count(*) = 3
            then 'ALL 3 REPORT CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from report_check_result;

rollback;
