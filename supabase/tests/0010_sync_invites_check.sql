-- Invite-only sync check. Run in the SQL Editor AFTER 0010_sync_invites.sql.
-- Changes nothing: it makes two throwaway test accounts, tries everything, then rolls EVERYTHING back.
-- Checks BOTH protections: invite eligibility (who may sync) and separation (nobody sees anyone else's data).
-- The last line should say: ALL 14 INVITE CHECKS PASSED

begin;

create temp table invite_check_result (n int, ok boolean, what text) on commit drop;
grant all on invite_check_result to authenticated;

do $$
declare
  admin_id   uuid := (select user_id from public.admins limit 1);
  admin_mail text := (select lower(btrim(u.email)) from auth.users u where u.id = (select user_id from public.admins limit 1));
  admin_ws   uuid := (select m.workspace_id from public.memberships m where m.user_id = (select user_id from public.admins limit 1) limit 1);
  admin_rows int  := (select count(*) from public.accounts a where a.workspace_id = (select m.workspace_id from public.memberships m where m.user_id = (select user_id from public.admins limit 1) limit 1));
  x_id   uuid := gen_random_uuid();
  y_id   uuid := gen_random_uuid();
  x_mail text := 'invite-check-x-' || substr(md5(random()::text), 1, 8) || '@example.invalid';
  y_mail text := 'invite-check-y-' || substr(md5(random()::text), 1, 8) || '@example.invalid';
  x_ws uuid;
  y_ws uuid;
  seen int;
  refused boolean;
  sid bigint;
begin
  -- Two throwaway accounts, each with one customer (the sign-up trigger gives each its own workspace).
  insert into auth.users (id, email) values (x_id, x_mail), (y_id, y_mail);
  select m.workspace_id into x_ws from public.memberships m where m.user_id = x_id;
  select m.workspace_id into y_ws from public.memberships m where m.user_id = y_id;
  insert into public.accounts (workspace_id, id, kind, data) values (x_ws, 'chk-x1', 'customer', '{"name":"X Check"}');
  insert into public.accounts (workspace_id, id, kind, data) values (y_ws, 'chk-y1', 'customer', '{"name":"Y Check"}');

  -- 1-2. No lockout: you're on the list, and you still see ALL of your own customers
  insert into invite_check_result values (1, exists (select 1 from public.sync_invites i where i.email = admin_mail), 'your email is on the invite list');
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from public.accounts a where a.workspace_id = admin_ws;
  insert into invite_check_result values (2, public.can_sync() and seen = admin_rows, 'you can sync and see all ' || admin_rows || ' of your records');
  reset role;

  -- 3-5. INVITE ELIGIBILITY: X is not invited, so X is blocked, even from X's own data
  perform set_config('request.jwt.claims', json_build_object('sub', x_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from public.accounts a where a.workspace_id = x_ws;
  insert into invite_check_result values (3, seen = 0 and not public.can_sync(), 'not invited: can''t read own data');
  refused := false;
  begin insert into public.accounts (workspace_id, id, kind, data) values (x_ws, 'chk-x2', 'customer', '{}'); exception when others then refused := true; end;
  insert into invite_check_result values (4, refused, 'not invited: can''t add data');
  refused := false;
  begin perform public.admin_sync_invite_add(x_mail); exception when others then refused := true; end;
  insert into invite_check_result values (5, refused, 'not invited: can''t invite itself');
  reset role;

  -- 6. You invite X and Y (as Admin would)
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_sync_invite_add(upper(x_mail));
  perform public.admin_sync_invite_add(y_mail);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from public.accounts a where a.workspace_id = x_ws;
  insert into invite_check_result values (6, seen = 1 and public.can_sync(), 'invited: X sees its own customer');

  -- 7-10. SEPARATION: invited X still can't see or touch Y's or your data
  select count(*) into seen from public.accounts a where a.workspace_id in (y_ws, admin_ws);
  insert into invite_check_result values (7, seen = 0, 'X sees none of Y''s or your customers');
  select count(*) into seen from public.accounts a where a.workspace_id <> x_ws;
  insert into invite_check_result values (8, seen = 0, 'X sees nothing outside its own workspace');
  refused := false;
  begin insert into public.accounts (workspace_id, id, kind, data) values (y_ws, 'chk-sneak', 'customer', '{}'); exception when others then refused := true; end;
  insert into invite_check_result values (9, refused, 'X can''t write into Y''s workspace');
  refused := false;
  begin perform public.pull_changes(y_ws, null); exception when others then refused := true; end;
  insert into invite_check_result values (10, refused, 'X can''t pull Y''s data');
  reset role;

  -- 11-12. Removing: your own email can't be removed; removing X blocks X again
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_sync_invite_remove(admin_mail); exception when others then refused := true; end;
  insert into invite_check_result values (11, refused, 'your own email can''t be removed');
  perform public.admin_sync_invite_remove(x_mail);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', x_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into seen from public.accounts a where a.workspace_id = x_ws;
  insert into invite_check_result values (12, seen = 0, 'removed: X is blocked again');
  reset role;

  -- 13. Beta: Invited adds the email, Declined takes it away
  insert into public.beta_signups (name, email) values ('Invite Check', x_mail) returning id into sid;
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.admin_beta_set_status(sid, 'invited');
  refused := exists (select 1 from public.admin_sync_invites_list() l where l.email = x_mail);
  perform public.admin_beta_set_status(sid, 'declined');
  insert into invite_check_result values (13, refused and not exists (select 1 from public.admin_sync_invites_list() l where l.email = x_mail), 'Beta Invited adds, Declined removes');
  reset role;

  -- 14. Both protections are in place on every table: the original separation rules AND the new invite rule
  insert into invite_check_result values (14,
    (select count(*) from pg_policies p where p.schemaname = 'public' and p.policyname = 'invited only' and p.permissive = 'RESTRICTIVE') = 10
    and (select count(distinct p.tablename) from pg_policies p where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
           and p.tablename in ('accounts', 'notes', 'events', 'stops', 'todos', 'day_marks', 'settings', 'photos', 'operations', 'conflicts')) = 10
    and exists (select 1 from pg_policies p where p.schemaname = 'storage' and p.policyname = 'crumb photos: invited only'),
    'both rule sets are on all 10 tables + photo files');
end $$;

select case when bool_and(ok) and count(*) = 14
            then 'ALL 14 INVITE CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from invite_check_result;

rollback;
