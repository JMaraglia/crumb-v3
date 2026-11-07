-- Crumb Admin step 1 check. Run in the SQL Editor AFTER 0005_admin.sql.
-- Changes nothing: everything happens inside a transaction that is rolled back.
-- The last line should say: ALL 6 ADMIN CHECKS PASSED

begin;

create temp table admin_check_result (n int, ok boolean, what text) on commit drop;
grant all on admin_check_result to authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  other_id uuid := (select u.id from auth.users u where u.id not in (select user_id from public.admins) limit 1);
  ov jsonb;
  failed boolean;
begin
  -- 1. There is at least one admin
  insert into admin_check_result values (1, admin_id is not null, 'founder is an admin');

  -- 2. Signed in as the admin: overview answers
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ov := public.admin_overview();
  insert into admin_check_result values (2, (ov ->> 'users_total')::int >= 1, 'admin can see the overview');

  -- 3. Admin: user list answers
  insert into admin_check_result values (3, (select count(*) from public.admin_users()) >= 1, 'admin can see the user list');

  -- 4. Overview holds counts only (no customer contents)
  insert into admin_check_result values (4, not (ov ? 'accounts' or ov ? 'notes' or ov ? 'events'), 'overview has no record contents');
  reset role;

  -- 5. Signed in as someone who is not an admin: refused
  failed := false;
  perform set_config('request.jwt.claims', json_build_object('sub', coalesce(other_id, gen_random_uuid()), 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.admin_overview();
  exception when insufficient_privilege then failed := true;
  end;
  reset role;
  insert into admin_check_result values (5, failed, 'non-admin is refused');

  -- 6. Not signed in at all: no permission to run it
  failed := false;
  set local role anon;
  begin
    perform public.admin_users();
  exception when insufficient_privilege then failed := true;
  end;
  reset role;
  insert into admin_check_result values (6, failed, 'signed-out visitor is refused');
end $$;

select case when bool_and(ok) and count(*) = 6
            then 'ALL 6 ADMIN CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from admin_check_result;

rollback;
