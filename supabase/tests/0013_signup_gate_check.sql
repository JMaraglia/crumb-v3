-- Sign-up gate check. Run in the SQL Editor AFTER 0013_signup_gate.sql.
-- Changes nothing (rolled back). The last line should say: ALL 7 SIGN-UP GATE CHECKS PASSED

begin;

create temp table gate_check_result (n int, ok boolean, what text) on commit drop;
grant all on gate_check_result to anon, authenticated;

do $$
declare
  mail    text := 'gate-check-' || substr(md5(random()::text), 1, 8) || '@example.com';
  j       jsonb;
  refused boolean;
begin
  insert into public.sync_invites (email, source) values (mail, 'admin');

  -- 1. Approved email: allowed
  j := public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', mail)));
  insert into gate_check_result values (1, j = '{}'::jsonb, 'approved email can create an account');

  -- 2. Same email typed with capitals and spaces: still allowed
  j := public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', '  ' || upper(mail) || ' ')));
  insert into gate_check_result values (2, j = '{}'::jsonb, 'capitals and spaces don''t matter');

  -- 3. Not approved: refused with the waitlist message
  j := public.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'not-' || mail)));
  insert into gate_check_result values (3, (j->'error'->>'http_code') = '403' and (j->'error'->>'message') like '%waitlist%', 'unapproved email refused');

  -- 4. No email at all: refused
  j := public.hook_before_user_created('{}'::jsonb);
  insert into gate_check_result values (4, j ? 'error', 'missing email refused');

  -- 5. A visitor can't call it
  set local role anon;
  refused := false;
  begin perform public.hook_before_user_created('{}'::jsonb); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into gate_check_result values (5, refused, 'visitor cannot call it');

  -- 6. A signed-in rep can't call it
  set local role authenticated;
  refused := false;
  begin perform public.hook_before_user_created('{}'::jsonb); exception when insufficient_privilege then refused := true; end;
  reset role;
  insert into gate_check_result values (6, refused, 'rep cannot call it');

  -- 7. Supabase's sign-up system is allowed to call it (checked without switching to that role,
  --    which the SQL Editor isn't allowed to do)
  insert into gate_check_result values (7,
    has_function_privilege('supabase_auth_admin', 'public.hook_before_user_created(jsonb)', 'execute'),
    'Supabase sign-up system can call it');
end $$;

select case when bool_and(ok) and count(*) = 7
            then 'ALL 7 SIGN-UP GATE CHECKS PASSED'
            else 'FAILED: ' || string_agg(case when not ok then n || ' ' || what end, ', ') end as result
from gate_check_result;

rollback;
