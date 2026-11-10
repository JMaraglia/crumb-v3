-- Join The Beta (Industry + State) check. Run in the SQL Editor AFTER 0011_beta_industry.sql.
-- Changes nothing (rolled back). The last line should say: ALL 6 INDUSTRY CHECKS PASSED

begin;

create temp table ind_check_result (n int, ok boolean, what text) on commit drop;
grant all on ind_check_result to anon, authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  mail     text := 'ind-check-' || substr(md5(random()::text), 1, 8) || '@example.com';
  refused  boolean;
  r        record;
begin
  set local role anon;

  -- 1. A visitor can join with industry and state
  perform public.join_beta('Industry Check', mail, null, 'Roofing & Construction', 'Ohio');
  insert into ind_check_result values (1, true, 'visitor can join with industry and state');

  -- 2. Missing industry is refused
  refused := false;
  begin perform public.join_beta('X', 'x-' || mail, null, '', 'Ohio'); exception when others then refused := true; end;
  insert into ind_check_result values (2, refused, 'missing industry refused');

  -- 3. Missing state is refused
  refused := false;
  begin perform public.join_beta('X', 'y-' || mail, null, 'Beverage', ' '); exception when others then refused := true; end;
  insert into ind_check_result values (3, refused, 'missing state refused');

  -- 4. The old 3-field version is gone (can't skip industry)
  refused := false;
  begin perform public.join_beta('X', 'z-' || mail, null); exception when others then refused := true; end;
  insert into ind_check_result values (4, refused, 'old version without industry is gone');

  -- 5. A visitor still cannot read the list
  refused := false;
  begin perform public.admin_beta_list(); exception when insufficient_privilege then refused := true; end;
  insert into ind_check_result values (5, refused, 'visitor cannot read the list');
  reset role;

  -- 6. The admin sees industry and state
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.admin_beta_list() l where lower(l.email) = mail;
  insert into ind_check_result values (6, r.industry = 'Roofing & Construction' and r.state = 'Ohio', 'admin sees industry and state');
  reset role;
end $$;

select case when bool_and(ok) and count(*) = 6
            then 'ALL 6 INDUSTRY CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from ind_check_result;

rollback;
