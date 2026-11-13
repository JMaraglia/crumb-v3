-- LIVE SECURITY CHECK (Nov 12, 2026). Run in the Supabase SQL Editor. Run it without saving.
--
-- WHAT IT DOES: makes three throwaway accounts (audit-a, audit-b, audit-c @example.invalid), gives each
-- one made-up record of every kind, then tries to break in from each direction: one rep at another rep's
-- data, an unapproved account, an admin looking at reps' records, and a visitor with no sign-in.
--
-- SAFETY:
--   * Everything happens inside one transaction that is ROLLED BACK at the end. Nothing is kept:
--     no accounts, no records, no changes. If any line fails, the same rollback happens.
--   * It never reads, changes or deletes a real person's data. Every attack is aimed at the throwaway
--     accounts it made itself.
--   * No emails are sent and no one is signed out.
--
-- The last line should say: ALL <number> SECURITY CHECKS PASSED
-- If it says FAILED, it lists exactly which checks failed. Send that to Claude and change nothing.

begin;
create temp table r (n serial, ok boolean, what text) on commit drop;
grant all on r to anon, authenticated; grant usage on sequence r_n_seq to anon, authenticated;
do $$
declare
  a uuid := '00000000-0000-4000-8000-0000000000a1'; b uuid := '00000000-0000-4000-8000-0000000000b1'; c uuid := '00000000-0000-4000-8000-0000000000c1';
  adm uuid := (select user_id from public.admins limit 1);
  wa uuid; wb uuid; wc uuid; t text; n int; blocked boolean; cid uuid; j jsonb;
  tabs text[] := array['accounts','notes','events','stops','todos','day_marks','settings','photos','operations','conflicts'];
begin
  insert into auth.users (id, email) values (a,'audit-a@example.invalid'),(b,'audit-b@example.invalid'),(c,'audit-c@example.invalid');
  insert into public.sync_invites (email) values ('audit-a@example.invalid'),('audit-b@example.invalid');
  select workspace_id into wa from public.memberships where user_id=a;
  select workspace_id into wb from public.memberships where user_id=b;
  select workspace_id into wc from public.memberships where user_id=c;
  insert into r(ok,what) values (wa is not null and wb is not null and wa<>wb and wb<>wc, 'each account gets its own separate workspace');
  -- seed one private record of every kind for A, B and C (as the database owner)
  for t in select unnest(array[wa::text, wb::text, wc::text]) loop
    insert into public.accounts (workspace_id,id,kind,data) values (t::uuid,'acc1','customer','{"name":"SECRET"}');
    insert into public.notes (workspace_id,id,account_id,data) values (t::uuid,'n1','acc1','{"text":"SECRET"}');
    insert into public.events (workspace_id,id,account_id,day,data) values (t::uuid,'e1','acc1','2026-11-12','{"title":"SECRET"}');
    insert into public.stops (workspace_id,id,account_id,day,data) values (t::uuid,'s1','acc1','2026-11-12','{}');
    insert into public.todos (workspace_id,id,account_id,data) values (t::uuid,'t1','acc1','{"text":"SECRET"}');
    insert into public.day_marks (workspace_id,kind,day,data) values (t::uuid,'done','2026-11-12','{}');
    insert into public.settings (workspace_id,key,data) values (t::uuid,'app','{}');
    insert into public.photos (workspace_id,id,account_id,storage_path) values (t::uuid,'p1','acc1',t||'/acc1/p1.jpg');
    insert into public.operations (workspace_id,id,kind,user_id) values (t::uuid,gen_random_uuid(),'upsert',null);
    insert into public.conflicts (workspace_id,table_name,record_id,field) values (t::uuid,'accounts','acc1','name');
  end loop;
  select id into cid from public.conflicts where workspace_id=wb limit 1;

  -- ===== signed in as A (approved), attacking B
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role','authenticated')::text, true);
  set local role authenticated;
  foreach t in array tabs loop
    execute format('select count(*) from public.%I where workspace_id = $1', t) into n using wa;
    insert into r(ok,what) values (n>=1, t||': A sees A''s own rows');
    execute format('select count(*) from public.%I where workspace_id <> $1', t) into n using wa;
    insert into r(ok,what) values (n=0, t||': A cannot READ anyone else''s rows (saw '||n||')');
    if t <> 'operations' then
      blocked := false;
      begin
        if t = 'conflicts' then execute format('update public.%I set resolution=''x'' where workspace_id = $1', t) using wb;
        else execute format('update public.%I set data=''{"hacked":true}'' where workspace_id = $1', t) using wb; end if;
        get diagnostics n = row_count;
      exception when others then blocked := true; n := 0; end;
      insert into r(ok,what) values (n=0, t||': A cannot CHANGE B''s rows');
      -- move own row into B's workspace
      blocked := false;
      begin execute format('update public.%I set workspace_id = $1 where workspace_id = $2', t) using wb, wa; get diagnostics n = row_count; if n=0 then blocked := true; end if;
      exception when others then blocked := true; end;
      insert into r(ok,what) values (blocked, t||': A cannot MOVE rows into B''s workspace');
    end if;
    blocked := false;
    begin execute format('delete from public.%I where workspace_id = $1', t) using wb; get diagnostics n = row_count; if n=0 then blocked := true; end if;
    exception when others then blocked := true; end;
    insert into r(ok,what) values (blocked, t||': A cannot DELETE B''s rows');
  end loop;
  -- inserts into B's workspace
  blocked := false; begin insert into public.accounts (workspace_id,id,kind) values (wb,'evil','customer'); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'accounts: A cannot ADD a row to B''s workspace');
  blocked := false; begin insert into public.notes (workspace_id,id,account_id,data) values (wb,'evil','acc1','{}'); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'notes: A cannot ADD a note to B''s customer');
  blocked := false; begin insert into public.events (workspace_id,id,data) values (wb,'evil','{}'); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'events: A cannot ADD an appointment to B''s calendar');
  blocked := false; begin insert into public.operations (workspace_id,id,kind) values (wb,gen_random_uuid(),'upsert'); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'operations: A cannot ADD to B''s change log');
  -- sync functions aimed at B
  blocked := false; begin j := public.pull_changes(wb, null); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'pull_changes: A cannot download B''s data');
  blocked := false;
  begin j := public.apply_changes(wb, jsonb_build_object('device','x','changes', jsonb_build_array(jsonb_build_object('op', gen_random_uuid(), 'type','upsert','table','accounts','id','acc1','base',null,'next', jsonb_build_object('name','HACKED'),'cols', jsonb_build_object('kind','customer')))));
  exception when others then blocked := true; end;
  reset role;
  select count(*) into n from public.accounts where workspace_id=wb and (data->>'name'='HACKED' or id='evil');
  insert into r(ok,what) values (n=0, 'apply_changes: A cannot upload changes into B''s account (function '||case when blocked then 'refused' else 'returned, wrote nothing' end||')');
  set local role authenticated;
  blocked := false; begin j := public.resolve_conflict(cid, 'kept', null); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'resolve_conflict: A cannot touch B''s review items');
  select count(*) into n from public.memberships where user_id <> a; insert into r(ok,what) values (n=0, 'memberships: A cannot see who else has an account');
  begin
    select count(*) into n from storage.objects o where o.name not like wa::text || '/%';
    insert into r(ok,what) values (n=0, 'photo files: A cannot see anyone else''s stored photos (saw '||n||')');
  exception when undefined_table or invalid_schema_name then null; -- no photo storage on this database
  end;
  select count(*) into n from public.workspaces where id <> wa; insert into r(ok,what) values (n=0, 'workspaces: A cannot see other workspaces');
  blocked := false; begin insert into public.memberships (workspace_id,user_id,role) values (wb,a,'owner'); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'memberships: A cannot add themselves to B''s workspace');
  foreach t in array array['admins','admin_log','beta_signups','feedback','sync_invites','welcome_emails'] loop
    blocked := false; begin execute format('select count(*) from public.%I', t) into n; exception when insufficient_privilege then blocked := true; end;
    insert into r(ok,what) values (blocked, t||': a rep cannot read this admin table');
  end loop;
  foreach t in array array['admin_users()','admin_overview()','admin_beta_list()','admin_feedback_list()','admin_signup_answers()','admin_sync_invites_list()','admin_welcome_list()','admin_health()','admin_user_id(''audit-b@example.invalid'')','admin_user_footprint(''audit-b@example.invalid'')','admin_delete_user(''audit-b@example.invalid'',''audit-b@example.invalid'')','admin_sync_invite_add(''x@example.invalid'')','admin_sync_invite_remove(''audit-b@example.invalid'')','admin_reports()','admin_log_recent(5)','admin_beta_set_status(0,''invited'')'] loop
    blocked := false; begin execute 'select public.'||t; exception when others then blocked := true; end;
    insert into r(ok,what) values (blocked, t||': a rep cannot call this admin function');
  end loop;
  reset role;
  select count(*) into n from auth.users where id=b; insert into r(ok,what) values (n=1, 'B''s account still exists after A''s delete attempt');

  -- ===== signed in as C (NOT approved)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role','authenticated')::text, true);
  set local role authenticated;
  n := 0; foreach t in array tabs loop execute format('select count(*) from public.%I', t) into j; n := n + (j#>>'{}')::int; end loop;
  insert into r(ok,what) values (n=0, 'unapproved account: reads nothing at all, not even its own workspace (saw '||n||')');
  blocked := false; begin insert into public.accounts (workspace_id,id,kind) values (wc,'new','customer'); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'unapproved account: cannot save anything');
  reset role;

  -- ===== admin (the founder) looking at reps' private data directly
  if adm is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
    set local role authenticated;
    n := 0; foreach t in array tabs loop execute format('select count(*) from public.%I where workspace_id in ($1,$2,$3)', t) into j using wa,wb,wc; n := n + (j#>>'{}')::int; end loop;
    insert into r(ok,what) values (n=0, 'admin: cannot read reps'' customers, notes or appointments through the tables (saw '||n||')');
    j := to_jsonb(public.admin_user_footprint('audit-b@example.invalid'));
    insert into r(ok,what) values (j::text not like '%SECRET%', 'admin: account footprint shows counts only, no contents');
    select to_jsonb(array_agg(u)) into j from public.admin_users() u;
    insert into r(ok,what) values (j::text not like '%SECRET%', 'admin: user list has no customer contents');
    reset role;
  end if;

  -- ===== anonymous visitor (no sign-in)
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  set local role anon;
  foreach t in array tabs || array['memberships','workspaces','admins','beta_signups','feedback','sync_invites','welcome_emails','admin_log'] loop
    blocked := false; begin execute format('select count(*) from public.%I', t) into n; if n=0 then blocked := true; end if; exception when insufficient_privilege then blocked := true; end;
    insert into r(ok,what) values (blocked, t||': anonymous visitor reads nothing');
  end loop;
  blocked := false; begin j := public.pull_changes(wb, null); exception when others then blocked := true; end;
  insert into r(ok,what) values (blocked, 'pull_changes: anonymous visitor refused');
  reset role;

  -- data untouched
  select count(*) into n from public.accounts where workspace_id=wb and data->>'name'='SECRET';
  insert into r(ok,what) values (n=1, 'B''s customer record is unchanged after every attack');
  select count(*) into n from public.notes where workspace_id=wb and data->>'text'='SECRET';
  insert into r(ok,what) values (n=1, 'B''s note is unchanged after every attack');
end $$;
select case when bool_and(ok)
            then 'ALL ' || count(*) || ' SECURITY CHECKS PASSED'
            else 'FAILED ' || count(*) filter (where not ok) || ' OF ' || count(*) || ': ' || string_agg(case when not ok then what end, ' | ' order by n) end as result
from r;

rollback;
