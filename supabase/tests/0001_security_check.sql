-- Crumb security check for step 1.  Paste into Supabase → SQL Editor → Run (crumb-test first).
-- It creates two pretend users, tries to break every rule, then UNDOES EVERYTHING it did.
-- The result always shows as an error box ON PURPOSE (that's how it undoes itself):
--     "ALL 16 SECURITY CHECKS PASSED (everything undone)"   ← good
--     "SECURITY CHECK FAILED: …"                             ← send Claude a screenshot
do $$
declare
  a  uuid := '00000000-0000-4000-8000-00000000000a';
  b  uuid := '00000000-0000-4000-8000-00000000000b';
  wa uuid;
  wb uuid;
  n  int;
  ok int := 0;
  blocked boolean;
begin
  -- Two pretend people sign up.
  insert into auth.users (id, email) values (a, 'check-a@example.invalid'), (b, 'check-b@example.invalid');
  select workspace_id into wa from public.memberships where user_id = a;
  select workspace_id into wb from public.memberships where user_id = b;
  if wa is null or wb is null or wa = wb then
    raise exception 'SECURITY CHECK FAILED: 1 each sign-up gets its own workspace';
  end if;
  ok := ok + 1;

  -- ================= signed in as A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.accounts (workspace_id, id, kind, data) values (wa, '1001', 'customer', '{"name":"A Pizza"}');
  insert into public.notes (workspace_id, id, account_id, data) values (wa, 'n-1', '1001', '{"text":"private note"}');
  select count(*) into n from public.accounts;
  if n <> 1 then raise exception 'SECURITY CHECK FAILED: 2 A sees own account (saw %)', n; end if;
  ok := ok + 1;

  update public.accounts set data = '{"name":"A Pizza 2"}' where id = '1001';
  select version into n from public.accounts where id = '1001';
  if n <> 2 then raise exception 'SECURITY CHECK FAILED: 3 version goes up on save (got %)', n; end if;
  ok := ok + 1;

  blocked := false;
  begin
    insert into public.notes (workspace_id, id, account_id) values (wa, 'n-orphan', 'no-such-account');
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'SECURITY CHECK FAILED: 4 a note pointing at a missing account was allowed'; end if;
  ok := ok + 1;

  insert into public.accounts (workspace_id, id, kind) values (wa, '1002', 'prospect'); -- nothing linked to it
  begin
    delete from public.accounts where id = '1002';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.accounts where id = '1002';
  if n <> 1 then raise exception 'SECURITY CHECK FAILED: 5 the app hard-deleted a record'; end if;
  ok := ok + 1;

  blocked := false;
  begin
    perform 1 from public.admins;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'SECURITY CHECK FAILED: 6 the admins list is readable from the app'; end if;
  ok := ok + 1;

  blocked := false;
  begin
    insert into public.memberships (workspace_id, user_id, role) values (wb, a, 'owner');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'SECURITY CHECK FAILED: 7 A could add themselves to B''s workspace'; end if;
  ok := ok + 1;

  -- ================= signed in as B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  select count(*) into n from public.accounts;
  if n <> 0 then raise exception 'SECURITY CHECK FAILED: 8 B can see A''s accounts'; end if;
  ok := ok + 1;

  select count(*) into n from public.notes;
  if n <> 0 then raise exception 'SECURITY CHECK FAILED: 9 B can see A''s notes'; end if;
  ok := ok + 1;

  select count(*) into n from public.workspaces where id = wa;
  if n <> 0 then raise exception 'SECURITY CHECK FAILED: 10 B can see A''s workspace'; end if;
  ok := ok + 1;

  update public.accounts set data = '{"name":"hacked"}' where workspace_id = wa;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'SECURITY CHECK FAILED: 11 B changed A''s account'; end if;
  ok := ok + 1;

  blocked := false;
  begin
    insert into public.accounts (workspace_id, id, kind) values (wa, '666', 'prospect');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'SECURITY CHECK FAILED: 12 B added a record into A''s workspace'; end if;
  ok := ok + 1;

  blocked := false;
  begin
    insert into public.notes (workspace_id, id, account_id) values (wb, 'n-x', '1001');
  exception when foreign_key_violation then blocked := true;
  end;
  if not blocked then raise exception 'SECURITY CHECK FAILED: 13 B linked a note to A''s account'; end if;
  ok := ok + 1;

  insert into public.accounts (workspace_id, id, kind) values (wb, '1001', 'prospect'); -- same ID, different person: fine
  select count(*) into n from public.accounts;
  if n <> 1 then raise exception 'SECURITY CHECK FAILED: 14 B''s own records'; end if;
  ok := ok + 1;

  -- ================= not signed in at all
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  blocked := false;
  begin
    perform 1 from public.accounts;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'SECURITY CHECK FAILED: 15 someone not signed in can read accounts'; end if;
  ok := ok + 1;

  blocked := false;
  begin
    insert into public.accounts (workspace_id, id, kind) values (wa, 'x', 'customer');
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'SECURITY CHECK FAILED: 16 someone not signed in could add a record'; end if;
  ok := ok + 1;

  raise exception 'ALL % SECURITY CHECKS PASSED (everything undone)', ok;
end $$;
