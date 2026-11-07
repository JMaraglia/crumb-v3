-- Crumb Admin step 2 check (Delete Account). Run in the SQL Editor AFTER 0006_admin_delete.sql.
-- Changes nothing: it makes a throwaway test account, deletes it, and then rolls EVERYTHING back.
-- The last line should say: ALL 8 DELETE CHECKS PASSED

begin;

create temp table delete_check_result (n int, ok boolean, what text) on commit drop;
grant all on delete_check_result to authenticated;

do $$
declare
  admin_id   uuid := (select user_id from public.admins limit 1);
  admin_mail text := (select u.email from auth.users u where u.id = (select user_id from public.admins limit 1));
  test_id    uuid := gen_random_uuid();
  test_mail  text := 'delete-check-' || substr(md5(random()::text), 1, 8) || '@example.invalid';
  ws         uuid;
  fp         jsonb;
  res        jsonb;
  refused    boolean;
begin
  -- A throwaway account with one customer and one note (the sign-up trigger gives it a workspace).
  insert into auth.users (id, email) values (test_id, test_mail);
  select m.workspace_id into ws from public.memberships m where m.user_id = test_id;
  insert into public.accounts (workspace_id, id, kind, data) values (ws, 'chk-a1', 'customer', '{"name":"Check"}');
  insert into public.notes (workspace_id, id, account_id, data) values (ws, 'chk-n1', 'chk-a1', '{"text":"Check"}');

  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 1. The admin sees what would be deleted (counts only)
  fp := public.admin_user_footprint(test_mail);
  insert into delete_check_result values (1, (fp ->> 'accounts')::int = 1 and (fp ->> 'notes')::int = 1, 'footprint counts the test data');

  -- 2. A mistyped confirmation is refused
  refused := false;
  begin perform public.admin_delete_user(test_mail, 'someone-else@example.invalid'); exception when others then refused := true; end;
  insert into delete_check_result values (2, refused, 'mismatched email is refused');

  -- 3. Deleting yourself is refused
  refused := false;
  begin perform public.admin_delete_user(admin_mail, admin_mail); exception when others then refused := true; end;
  insert into delete_check_result values (3, refused, 'admin cannot delete themselves');

  -- 4. The real delete works
  res := public.admin_delete_user(test_mail, upper(test_mail));
  insert into delete_check_result values (4, (res ->> 'deleted')::boolean, 'delete succeeds with the right email');
  reset role;

  -- 5. The sign-in is gone
  insert into delete_check_result values (5, not exists (select 1 from auth.users u where u.id = test_id), 'account removed');

  -- 6. Their workspace and its data are gone
  insert into delete_check_result values (6,
    not exists (select 1 from public.workspaces w where w.id = ws)
    and not exists (select 1 from public.accounts a where a.workspace_id = ws)
    and not exists (select 1 from public.notes n where n.workspace_id = ws), 'their cloud data removed');

  -- 7. The delete was logged
  insert into delete_check_result values (7, exists (select 1 from public.admin_log l where l.target_email = test_mail and l.action = 'delete_account'), 'delete is logged');

  -- 8. A signed-out visitor can't call it
  refused := false;
  set local role anon;
  begin perform public.admin_delete_user('x@example.invalid', 'x@example.invalid'); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into delete_check_result values (8, refused, 'signed-out visitor is refused');
end $$;

select case when bool_and(ok) and count(*) = 8
            then 'ALL 8 DELETE CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from delete_check_result;

rollback;
