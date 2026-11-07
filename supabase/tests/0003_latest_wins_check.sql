-- Crumb check for 0003 (latest change wins). Paste into Supabase → SQL Editor → Run, on crumb-test, after 0003.
-- Pretends to be two people and two devices, tries the situations, then UNDOES EVERYTHING.
-- The result always shows as an error box ON PURPOSE:
--     "ALL 8 LATEST-WINS CHECKS PASSED (everything undone)"   ← good
--     "LATEST-WINS CHECK FAILED: …"                            ← send Claude a screenshot
-- (Last line of this file is "end $$;" — make sure it got pasted.)
do $$
declare
  a  uuid := '00000000-0000-4000-8000-0000000000a3';
  b  uuid := '00000000-0000-4000-8000-0000000000b3';
  wa uuid;
  wb uuid;
  r  jsonb;
  n  int;
  v  jsonb;
  ver int;
  ok int := 0;
  fail text := 'LATEST-WINS CHECK FAILED: ';
begin
  insert into auth.users (id, email) values (a, 'lw-a@example.invalid'), (b, 'lw-b@example.invalid');
  select workspace_id into wa from public.memberships where user_id = a;
  select workspace_id into wb from public.memberships where user_id = b;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- setup: an account with a note
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[
    {"op_id":"30000000-0000-4000-8000-000000000001","type":"upsert","table":"accounts","id":"500","base":null,"next":{"name":"Joe''s","phone":"111","competitors":["Sysco"]},"cols":{"kind":"customer"}},
    {"op_id":"30000000-0000-4000-8000-000000000002","type":"upsert","table":"notes","id":"n-5","base":null,"next":{"text":"Hello"},"cols":{"account_id":"500"}}]}');

  -- 1 both devices change the same phone number: the latest one wins, nobody is asked
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"30000000-0000-4000-8000-000000000003","type":"upsert","table":"accounts","id":"500","base":{"phone":"111"},"next":{"phone":"222"}}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"30000000-0000-4000-8000-000000000004","type":"upsert","table":"accounts","id":"500","base":{"phone":"111"},"next":{"phone":"999"}}]}');
  select data into v from public.accounts where id = '500' and workspace_id = wa;
  if v ->> 'phone' <> '999' or (r ->> 'conflicts')::int <> 0 then raise exception '% 1 latest phone should win (got %)', fail, v ->> 'phone'; end if;
  ok := ok + 1;

  -- 2 the replaced number is kept as quiet history (already resolved)
  select count(*) into n from public.conflicts where workspace_id = wa and record_id = '500' and field = 'phone'
    and kept_value = '"999"' and other_value = '"222"' and resolved_at is not null and resolution = 'latest_wins';
  if n <> 1 then raise exception '% 2 history of the replaced value', fail; end if;
  ok := ok + 1;

  -- 3 note text changed on both: latest wins
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"30000000-0000-4000-8000-000000000005","type":"upsert","table":"notes","id":"n-5","base":{"text":"Hello"},"next":{"text":"Hello A"}}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"30000000-0000-4000-8000-000000000006","type":"upsert","table":"notes","id":"n-5","base":{"text":"Hello"},"next":{"text":"Hello B"}}]}');
  if (select data ->> 'text' from public.notes where id = 'n-5' and workspace_id = wa) <> 'Hello B' then raise exception '% 3 note text', fail; end if;
  ok := ok + 1;

  -- 4 lists still merge: each device adds a competitor, both are kept
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"30000000-0000-4000-8000-000000000007","type":"upsert","table":"accounts","id":"500","base":{"competitors":["Sysco"]},"next":{"competitors":["Sysco","US Foods"]}}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"30000000-0000-4000-8000-000000000008","type":"upsert","table":"accounts","id":"500","base":{"competitors":["Sysco"]},"next":{"competitors":["Sysco","Chef''s"]}}]}');
  select data -> 'competitors' into v from public.accounts where id = '500' and workspace_id = wa;
  if not (v @> '["Sysco","US Foods","Chef''s"]'::jsonb) then raise exception '% 4 list merge (got %)', fail, v; end if;
  ok := ok + 1;

  -- 5 a retry is still applied only once
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"30000000-0000-4000-8000-000000000004","type":"upsert","table":"accounts","id":"500","base":{"phone":"111"},"next":{"phone":"000"}}]}');
  if r -> 'results' -> 0 ->> 'status' <> 'duplicate' or (select data ->> 'phone' from public.accounts where id = '500' and workspace_id = wa) <> '999' then
    raise exception '% 5 retry applied twice', fail; end if;
  ok := ok + 1;

  -- 6 an out-of-date device deletes a note that was edited since: the edit stays, nobody is asked
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"30000000-0000-4000-8000-000000000009","type":"delete","table":"notes","id":"n-5","base_version":1}]}');
  if (select deleted_at from public.notes where id = 'n-5' and workspace_id = wa) is not null then raise exception '% 6 edited note deleted', fail; end if;
  ok := ok + 1;

  -- 7 deleted on one device, then edited on the other: it comes back; nothing is left open for review
  select version into ver from public.notes where id = 'n-5' and workspace_id = wa;
  r := public.apply_changes(wa, jsonb_build_object('device', 'iPhone', 'ops', jsonb_build_array(jsonb_build_object(
    'op_id', '30000000-0000-4000-8000-000000000010', 'type', 'delete', 'table', 'notes', 'id', 'n-5', 'base_version', ver))));
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"30000000-0000-4000-8000-000000000011","type":"upsert","table":"notes","id":"n-5","base":{"text":"Hello B"},"next":{"text":"Hello B, call Tue"}}]}');
  r := public.pull_changes(wa, null);
  if (select deleted_at from public.notes where id = 'n-5' and workspace_id = wa) is not null or jsonb_array_length(r -> 'conflicts') <> 0 then
    raise exception '% 7 edit after delete / nothing open for review', fail; end if;
  ok := ok + 1;

  -- 8 the other person sees none of this (not even the history)
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if (select count(*) from public.conflicts) <> 0 or (select count(*) from public.accounts) <> 0 then raise exception '% 8 B saw A''s data', fail; end if;
  ok := ok + 1;

  raise exception 'ALL % LATEST-WINS CHECKS PASSED (everything undone)', ok;
end $$;
