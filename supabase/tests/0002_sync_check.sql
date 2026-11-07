-- Crumb sync check (step S1). Paste into Supabase → SQL Editor → Run, on crumb-test, after 0002.
-- Pretends to be two people and two devices, tries every sync situation, then UNDOES EVERYTHING.
-- The result always shows as an error box ON PURPOSE:
--     "ALL 20 SYNC CHECKS PASSED (everything undone)"   ← good
--     "SYNC CHECK FAILED: …"                             ← send Claude a screenshot
-- (Last line of this file is "end $$;" — make sure it got pasted.)
do $$
declare
  a  uuid := '00000000-0000-4000-8000-0000000000a1';
  b  uuid := '00000000-0000-4000-8000-0000000000b1';
  wa uuid;
  wb uuid;
  r  jsonb;
  n  int;
  t  text;
  v  jsonb;
  ok int := 0;
  failed boolean;
  t0 timestamptz;
  cid uuid;
  fail text := 'SYNC CHECK FAILED: ';
begin
  insert into auth.users (id, email) values (a, 'sync-a@example.invalid'), (b, 'sync-b@example.invalid');
  select workspace_id into wa from public.memberships where user_id = a;
  select workspace_id into wb from public.memberships where user_id = b;

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  t0 := clock_timestamp() - interval '1 second';

  -- 1 iPhone adds a prospect with a note (one batch)
  r := public.apply_changes(wa, jsonb_build_object('device', 'iPhone', 'ops', jsonb_build_array(
    jsonb_build_object('op_id', '10000000-0000-4000-8000-000000000001', 'type', 'upsert', 'table', 'accounts', 'id', '1730',
      'base', null, 'next', '{"name":"Joe''s Pizza","phone":"111","competitors":["Sysco"],"notesCount":1}'::jsonb, 'cols', '{"kind":"prospect"}'::jsonb),
    jsonb_build_object('op_id', '10000000-0000-4000-8000-000000000002', 'type', 'upsert', 'table', 'notes', 'id', 'n-1',
      'base', null, 'next', '{"text":"Met the owner"}'::jsonb, 'cols', '{"account_id":"1730"}'::jsonb))));
  select count(*) into n from public.accounts where workspace_id = wa;
  if n <> 1 or (select count(*) from public.notes where workspace_id = wa) <> 1 then raise exception '% 1 new account + note saved', fail; end if;
  ok := ok + 1;

  -- 2 the same batch again (a retry) changes nothing
  r := public.apply_changes(wa, jsonb_build_object('device', 'iPhone', 'ops', jsonb_build_array(
    jsonb_build_object('op_id', '10000000-0000-4000-8000-000000000001', 'type', 'upsert', 'table', 'accounts', 'id', '1730',
      'base', null, 'next', '{"name":"DIFFERENT"}'::jsonb, 'cols', '{"kind":"prospect"}'::jsonb))));
  if r -> 'results' -> 0 ->> 'status' <> 'duplicate' or (select data ->> 'name' from public.accounts where id = '1730' and workspace_id = wa) <> 'Joe''s Pizza' then
    raise exception '% 2 a retried change was applied twice', fail; end if;
  ok := ok + 1;

  -- 3 iPhone and iPad change DIFFERENT fields: both kept
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"10000000-0000-4000-8000-000000000003","type":"upsert","table":"accounts","id":"1730","base":{"phone":"111"},"next":{"phone":"222"}}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000004","type":"upsert","table":"accounts","id":"1730","base":{"address":null},"next":{"address":"1 Main St"}}]}');
  select data into v from public.accounts where id = '1730' and workspace_id = wa;
  if v ->> 'phone' <> '222' or v ->> 'address' <> '1 Main St' then raise exception '% 3 two edits to different fields (got %)', fail, v; end if;
  ok := ok + 1;

  -- 4 both change the SAME phone number differently: cloud keeps the first, the other goes to Needs Review
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000005","type":"upsert","table":"accounts","id":"1730","base":{"phone":"111"},"next":{"phone":"999"}}]}');
  select data into v from public.accounts where id = '1730' and workspace_id = wa;
  select count(*) into n from public.conflicts where workspace_id = wa and record_id = '1730' and field = 'phone' and other_value = '"999"' and kept_value = '"222"';
  if v ->> 'phone' <> '222' or n <> 1 or (r ->> 'conflicts')::int <> 1 then raise exception '% 4 phone conflict not kept for review', fail; end if;
  ok := ok + 1;

  -- 5 both make the SAME change: no conflict
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000006","type":"upsert","table":"accounts","id":"1730","base":{"phone":"111"},"next":{"phone":"222"}}]}');
  if (r ->> 'conflicts')::int <> 0 then raise exception '% 5 identical edits made a conflict', fail; end if;
  ok := ok + 1;

  -- 6 a low-stakes field changed on both: newest wins, no review
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"10000000-0000-4000-8000-000000000007","type":"upsert","table":"accounts","id":"1730","base":{"notesCount":1},"next":{"notesCount":2}}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000008","type":"upsert","table":"accounts","id":"1730","base":{"notesCount":1},"next":{"notesCount":5}}]}');
  if (select data ->> 'notesCount' from public.accounts where id = '1730' and workspace_id = wa) <> '5' or (r ->> 'conflicts')::int <> 0 then
    raise exception '% 6 newest-wins field', fail; end if;
  ok := ok + 1;

  -- 7 competitors: iPhone adds US Foods, iPad adds Baldor and removes Sysco → merged
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"10000000-0000-4000-8000-000000000009","type":"upsert","table":"accounts","id":"1730","base":{"competitors":["Sysco"]},"next":{"competitors":["Sysco","US Foods"]}}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000010","type":"upsert","table":"accounts","id":"1730","base":{"competitors":["Sysco"]},"next":{"competitors":["Baldor"]}}]}');
  select data -> 'competitors' into v from public.accounts where id = '1730' and workspace_id = wa;
  if v <> '["US Foods","Baldor"]'::jsonb then raise exception '% 7 competitor lists merged (got %)', fail, v; end if;
  ok := ok + 1;

  -- 8 a whole batch is all-or-nothing: one bad change (note for a missing account) → nothing in it is saved
  failed := false;
  begin
    r := public.apply_changes(wa, '{"device":"iPhone","ops":[
      {"op_id":"10000000-0000-4000-8000-000000000011","type":"upsert","table":"accounts","id":"1730","base":{"name":"Joe''s Pizza"},"next":{"name":"Joe''s Pizza & Subs"}},
      {"op_id":"10000000-0000-4000-8000-000000000012","type":"upsert","table":"notes","id":"n-bad","base":null,"next":{"text":"x"},"cols":{"account_id":"no-such-account"}}]}');
  exception when foreign_key_violation then failed := true;
  end;
  if not failed or (select data ->> 'name' from public.accounts where id = '1730' and workspace_id = wa) <> 'Joe''s Pizza' then
    raise exception '% 8 a failed batch was partly saved', fail; end if;
  ok := ok + 1;

  -- 9 delete on iPhone while iPad edited it (iPhone's version is old): edit wins, review note
  select version into n from public.notes where id = 'n-1' and workspace_id = wa;
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000013","type":"upsert","table":"notes","id":"n-1","base":{"text":"Met the owner"},"next":{"text":"Met the owner, Dana"}}]}');
  r := public.apply_changes(wa, jsonb_build_object('device', 'iPhone', 'ops', jsonb_build_array(jsonb_build_object(
    'op_id', '10000000-0000-4000-8000-000000000014', 'type', 'delete', 'table', 'notes', 'id', 'n-1', 'base_version', n))));
  if r -> 'results' -> 0 ->> 'status' <> 'kept_edited' or (select deleted_at from public.notes where id = 'n-1' and workspace_id = wa) is not null then
    raise exception '% 9 an edited note was deleted by an out-of-date device', fail; end if;
  ok := ok + 1;

  -- 10 a normal delete (up to date) is a recoverable mark, not an erase
  select version into n from public.notes where id = 'n-1' and workspace_id = wa;
  r := public.apply_changes(wa, jsonb_build_object('device', 'iPhone', 'ops', jsonb_build_array(jsonb_build_object(
    'op_id', '10000000-0000-4000-8000-000000000015', 'type', 'delete', 'table', 'notes', 'id', 'n-1', 'base_version', n))));
  if (select deleted_at from public.notes where id = 'n-1' and workspace_id = wa) is null then raise exception '% 10 delete mark', fail; end if;
  ok := ok + 1;

  -- 11 edit something deleted on the other device: it comes back, flagged for review
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000016","type":"upsert","table":"notes","id":"n-1","base":{"text":"Met the owner, Dana"},"next":{"text":"Met the owner, Dana. Call Tue"}}]}');
  if (select deleted_at from public.notes where id = 'n-1' and workspace_id = wa) is not null
     or not exists (select 1 from public.conflicts where workspace_id = wa and record_id = 'n-1' and field = '_deleted') then
    raise exception '% 11 edit after delete', fail; end if;
  ok := ok + 1;

  -- 12 convert, same ID: one step, kind changes, the note stays linked
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"10000000-0000-4000-8000-000000000017","type":"convert","table":"accounts","id":"1730","base":{"accountNumber":null},"next":{"accountNumber":"A100"}}]}');
  if (select kind from public.accounts where id = '1730' and workspace_id = wa) <> 'customer'
     or (select data ->> 'accountNumber' from public.accounts where id = '1730' and workspace_id = wa) <> 'A100'
     or (select account_id from public.notes where id = 'n-1' and workspace_id = wa) <> '1730' then
    raise exception '% 12 convert (same ID)', fail; end if;
  ok := ok + 1;

  -- 13 convert to a NEW ID: everything linked moves in the same step, the old one is retired
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[
    {"op_id":"10000000-0000-4000-8000-000000000018","type":"upsert","table":"accounts","id":"2000","base":null,"next":{"name":"Bella"},"cols":{"kind":"prospect"}},
    {"op_id":"10000000-0000-4000-8000-000000000019","type":"upsert","table":"notes","id":"n-2","base":null,"next":{"text":"x"},"cols":{"account_id":"2000"}},
    {"op_id":"10000000-0000-4000-8000-000000000020","type":"upsert","table":"events","id":"e-9","base":null,"next":{"title":"Meet"},"cols":{"account_id":"2000","day":"2026-11-10"}},
    {"op_id":"10000000-0000-4000-8000-000000000021","type":"convert","table":"accounts","id":"2000","new_id":"2001","base":{"accountNumber":null},"next":{"accountNumber":"B200"}}]}');
  if (select account_id from public.notes where id = 'n-2' and workspace_id = wa) <> '2001'
     or (select account_id from public.events where id = 'e-9' and workspace_id = wa) <> '2001'
     or (select kind from public.accounts where id = '2001' and workspace_id = wa) <> 'customer'
     or (select deleted_at from public.accounts where id = '2000' and workspace_id = wa) is null then
    raise exception '% 13 convert to a new ID', fail; end if;
  ok := ok + 1;

  -- 14 day lists (checked off) from two devices are merged
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"10000000-0000-4000-8000-000000000022","type":"upsert","table":"day_marks","id":"done|2026-11-10","base":null,"next":["c-1"]}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"10000000-0000-4000-8000-000000000023","type":"upsert","table":"day_marks","id":"done|2026-11-10","base":[],"next":["p-5"]}]}');
  select data into v from public.day_marks where workspace_id = wa and kind = 'done' and day = '2026-11-10';
  if v <> '["c-1","p-5"]'::jsonb then raise exception '% 14 day checkmarks merged (got %)', fail, v; end if;
  ok := ok + 1;

  -- 15 pull: the other device gets everything since a time, deleted marks included, plus open review items
  r := public.pull_changes(wa, t0);
  if jsonb_array_length(r -> 'accounts') <> 3 or jsonb_array_length(r -> 'notes') <> 2 or jsonb_array_length(r -> 'conflicts') < 2
     or not exists (select 1 from jsonb_array_elements(r -> 'accounts') x where x ->> 'id' = '2000' and (x ->> 'deleted')::boolean) then
    raise exception '% 15 pull (got % accounts, % notes, % conflicts)', fail, jsonb_array_length(r -> 'accounts'), jsonb_array_length(r -> 'notes'), jsonb_array_length(r -> 'conflicts');
  end if;
  ok := ok + 1;

  -- 16 resolve Needs Review: pick the other device's phone number
  select id into cid from public.conflicts where workspace_id = wa and field = 'phone' and resolved_at is null;
  r := public.resolve_conflict(cid, 'other');
  if (select data ->> 'phone' from public.accounts where id = '1730' and workspace_id = wa) <> '999'
     or (select resolved_at from public.conflicts where id = cid) is null then
    raise exception '% 16 resolving a review item', fail; end if;
  ok := ok + 1;

  -- ================= person B tries to get at A's data
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  failed := false;
  begin
    r := public.apply_changes(wa, '{"device":"evil","ops":[{"op_id":"10000000-0000-4000-8000-000000000099","type":"upsert","table":"accounts","id":"1730","base":null,"next":{"name":"hacked"}}]}');
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception '% 17 B sent changes into A''s workspace', fail; end if;
  ok := ok + 1;

  failed := false;
  begin
    r := public.pull_changes(wa, null);
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception '% 18 B pulled A''s data', fail; end if;
  ok := ok + 1;

  failed := false;
  begin
    select id into cid from public.conflicts limit 1;  -- B can't even see A's review items
    if cid is not null then raise exception 'B saw a review item'; end if;
    r := public.resolve_conflict((select id from public.conflicts where workspace_id = wa limit 1), 'kept');
  exception when no_data_found then failed := true;
  end;
  if not failed then raise exception '% 19 B resolved A''s review item', fail; end if;
  ok := ok + 1;

  -- 20 B's own sync works, and B's pull sees only B's things
  r := public.apply_changes(wb, '{"device":"B-phone","ops":[{"op_id":"10000000-0000-4000-8000-000000000001","type":"upsert","table":"accounts","id":"1730","base":null,"next":{"name":"B''s own"},"cols":{"kind":"customer"}}]}');
  r := public.pull_changes(wb, null);
  if jsonb_array_length(r -> 'accounts') <> 1 or r -> 'accounts' -> 0 -> 'data' ->> 'name' <> 'B''s own' or jsonb_array_length(r -> 'conflicts') <> 0 then
    raise exception '% 20 B''s own sync / isolation', fail; end if;
  ok := ok + 1;

  raise exception 'ALL % SYNC CHECKS PASSED (everything undone)', ok;
end $$;
