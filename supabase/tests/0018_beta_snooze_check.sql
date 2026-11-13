-- Snooze check. Run in the SQL Editor AFTER 0018_beta_snooze.sql.
-- Uses one throwaway sign-up and changes nothing (rolled back). The last line should say: ALL 4 SNOOZE CHECKS PASSED

begin;

create temp table snooze_check_result (n int, ok boolean, what text) on commit drop;
grant all on snooze_check_result to anon, authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  sid      bigint;
  refused  boolean;
  got      text;
begin
  insert into public.beta_signups (name, email) values ('Snooze Check', 'snooze-check@example.invalid') returning id into sid;

  -- 1. A signed-in rep can't snooze anyone
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_beta_set_status(sid, 'snoozed'); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into snooze_check_result values (1, refused, 'rep cannot snooze');

  -- 2. The admin can snooze, and it gives no access
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  got := public.admin_beta_set_status(sid, 'snoozed');
  reset role;
  insert into snooze_check_result values (2, got = 'snoozed'
    and (select status from public.beta_signups where id = sid) = 'snoozed'
    and not exists (select 1 from public.sync_invites where email = 'snooze-check@example.invalid'), 'admin can snooze, no access given');

  -- 3. Snoozed -> Invited gives access; Invited -> Snoozed takes it away again
  set local role authenticated;
  perform public.admin_beta_set_status(sid, 'invited');
  reset role;
  refused := exists (select 1 from public.sync_invites where email = 'snooze-check@example.invalid');
  set local role authenticated;
  perform public.admin_beta_set_status(sid, 'snoozed');
  reset role;
  insert into snooze_check_result values (3, refused and not exists (select 1 from public.sync_invites where email = 'snooze-check@example.invalid'), 'invite and snooze keep access in step');

  -- 4. A made-up status is still refused
  set local role authenticated;
  refused := false;
  begin perform public.admin_beta_set_status(sid, 'whatever'); exception when others then refused := true; end;
  reset role;
  insert into snooze_check_result values (4, refused, 'unknown status refused');
end $$;

select case when bool_and(ok) and count(*) = 4
            then 'ALL 4 SNOOZE CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from snooze_check_result;

rollback;
