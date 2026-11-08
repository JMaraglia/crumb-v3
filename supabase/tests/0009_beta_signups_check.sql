-- Join The Beta check. Run in the SQL Editor AFTER 0009_beta_signups.sql.
-- Changes nothing (rolled back). The last line should say: ALL 7 BETA CHECKS PASSED

begin;

create temp table beta_check_result (n int, ok boolean, what text) on commit drop;
grant all on beta_check_result to anon, authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  mail     text := 'beta-check-' || substr(md5(random()::text), 1, 8) || '@example.com';
  refused  boolean;
  sid      bigint;
  seen     bigint;
begin
  -- 1. A website visitor (not signed in) can join
  set local role anon;
  perform public.join_beta('Beta Check', mail, 'Check Co');
  insert into beta_check_result values (1, true, 'visitor can join');

  -- 2. Joining again with the same email (any capitals) doesn't make a second row
  perform public.join_beta('Beta Check 2', upper(mail), null);
  reset role;
  insert into beta_check_result values (2, (select count(*) from public.beta_signups where lower(email) = mail) = 1, 'same email is kept once');

  -- 3. A bad email is refused
  refused := false;
  set local role anon;
  begin perform public.join_beta('X', 'not-an-email', null); exception when others then refused := true; end;
  insert into beta_check_result values (3, refused, 'bad email refused');

  -- 4. A visitor cannot read the list
  refused := false;
  begin perform public.admin_beta_list(); exception when insufficient_privilege then refused := true; end;
  insert into beta_check_result values (4, refused, 'visitor cannot read the list');

  -- 5. A visitor cannot read the table directly (either refused, or sees no rows)
  refused := false;
  seen := 0;
  begin select count(*) into seen from public.beta_signups; exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into beta_check_result values (5, refused or seen = 0, 'visitor cannot read the table');

  -- 6. The admin sees the sign-up
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select l.id into sid from public.admin_beta_list() l where lower(l.email) = mail;
  insert into beta_check_result values (6, sid is not null, 'admin sees the sign-up');

  -- 7. The admin can mark it Invited
  perform public.admin_beta_set_status(sid, 'invited');
  insert into beta_check_result values (7, exists (select 1 from public.admin_beta_list() l where l.id = sid and l.status = 'invited'), 'admin can mark Invited');
  reset role;
end $$;

select case when bool_and(ok) and count(*) = 7
            then 'ALL 7 BETA CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from beta_check_result;

rollback;
