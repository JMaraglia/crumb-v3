-- Crumb Admin step 4 check (Inbox). Run in the SQL Editor AFTER 0008_feedback.sql.
-- Changes nothing: everything is rolled back at the end.
-- The last line should say: ALL 7 INBOX CHECKS PASSED

begin;

create temp table inbox_check_result (n int, ok boolean, what text) on commit drop;
grant all on inbox_check_result to authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  rep_id   uuid := gen_random_uuid();
  tid      bigint;
  refused  boolean;
begin
  insert into auth.users (id, email) values (rep_id, 'inbox-check-' || substr(md5(random()::text), 1, 8) || '@example.invalid');

  -- 1. A signed-in rep can send a problem report
  perform set_config('request.jwt.claims', json_build_object('sub', rep_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.submit_feedback('problem', 'Calendar', 'Inbox check', 'iPhone', 'test');
  insert into inbox_check_result values (1, tid is not null, 'rep can send a report');

  -- 2. The rep cannot read the inbox
  refused := false;
  begin perform public.admin_feedback_list(); exception when insufficient_privilege then refused := true; end;
  insert into inbox_check_result values (2, refused, 'rep cannot read the inbox');

  -- 3. The rep cannot change a status
  refused := false;
  begin perform public.admin_feedback_set_status(tid, 'closed'); exception when insufficient_privilege then refused := true; end;
  insert into inbox_check_result values (3, refused, 'rep cannot change status');
  reset role;

  -- 4. The admin sees it
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into inbox_check_result values (4, exists (select 1 from public.admin_feedback_list() l where l.id = tid and l.status = 'new'), 'admin sees the new ticket');

  -- 5. The admin can move it along
  perform public.admin_feedback_set_status(tid, 'investigating');
  insert into inbox_check_result values (5, exists (select 1 from public.admin_feedback_list() l where l.id = tid and l.status = 'investigating'), 'admin can change status');

  -- 6. A suggestion-only status is refused for a problem
  refused := false;
  begin perform public.admin_feedback_set_status(tid, 'approved'); exception when others then refused := true; end;
  insert into inbox_check_result values (6, refused, 'wrong status is refused');
  reset role;

  -- 7. Signed out: can't send
  refused := false;
  set local role anon;
  begin perform public.submit_feedback('problem', 'x', 'x', 'x', 'x'); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into inbox_check_result values (7, refused, 'signed-out visitor cannot send');
end $$;

select case when bool_and(ok) and count(*) = 7
            then 'ALL 7 INBOX CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from inbox_check_result;

rollback;
