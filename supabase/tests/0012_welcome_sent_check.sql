-- Welcome email record check. Run in the SQL Editor AFTER 0012_welcome_sent.sql.
-- Changes nothing (rolled back). The last line should say: ALL 11 WELCOME CHECKS PASSED

begin;

create temp table wel_check_result (n int, ok boolean, what text) on commit drop;
grant all on wel_check_result to anon, authenticated;

do $$
declare
  admin_id uuid := (select user_id from public.admins limit 1);
  mail     text := 'wel-check-' || substr(md5(random()::text), 1, 8) || '@example.com';
  refused  boolean;
  j        jsonb;
  r        record;
begin
  -- 1. A visitor can't claim a send
  set local role anon;
  refused := false;
  begin perform public.admin_welcome_claim(mail, false); exception when others then refused := true; end;
  insert into wel_check_result values (1, refused, 'visitor cannot claim');

  -- 2. A visitor can't read the list
  refused := false;
  begin perform public.admin_welcome_list(); exception when others then refused := true; end;
  insert into wel_check_result values (2, refused, 'visitor cannot read the list');
  reset role;

  -- 3. A signed-in rep (not an admin) can't claim
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  set local role authenticated;
  refused := false;
  begin perform public.admin_welcome_claim(mail, false); exception when others then refused := true; end;
  insert into wel_check_result values (3, refused, 'rep cannot claim');
  reset role;

  -- From here on: the admin
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 4. Not approved yet: refused
  refused := false;
  begin perform public.admin_welcome_claim(mail, false); exception when others then refused := true; end;
  insert into wel_check_result values (4, refused, 'email not approved is refused');

  perform public.admin_sync_invite_add(mail);

  -- 5. First approval: may send
  j := public.admin_welcome_claim(mail, false);
  insert into wel_check_result values (5, (j->>'send')::boolean, 'first send allowed');

  -- 6. A double tap right after: blocked
  j := public.admin_welcome_claim(mail, true);
  insert into wel_check_result values (6, not (j->>'send')::boolean, 'double tap blocked while sending');

  -- 7. Sent: recorded once
  j := public.admin_welcome_done(mail, true, false);
  insert into wel_check_result values (7, (j->>'times')::int = 1, 'send recorded');

  -- 8. Approving again never re-sends
  j := public.admin_welcome_claim(mail, false);
  insert into wel_check_result values (8, not (j->>'send')::boolean and j->>'reason' = 'already_sent', 'approval does not re-send');

  -- 9. A failed send releases the claim so Resend can try again
  j := public.admin_welcome_claim(mail, true);
  perform public.admin_welcome_done(mail, false, true);
  j := public.admin_welcome_claim(mail, true);
  insert into wel_check_result values (9, (j->>'send')::boolean, 'failed send can be retried');

  -- 10. Resend is recorded as the second send
  j := public.admin_welcome_done(mail, true, true);
  insert into wel_check_result values (10, (j->>'times')::int = 2, 'resend recorded');

  -- 11. Admin list shows it
  select * into r from public.admin_welcome_list() l where l.email = mail;
  insert into wel_check_result values (11, r.times = 2 and r.first_sent_at is not null, 'admin list shows the record');
  reset role;
end $$;

select case when bool_and(ok) and count(*) = 11
            then 'ALL 11 WELCOME CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from wel_check_result;

rollback;
