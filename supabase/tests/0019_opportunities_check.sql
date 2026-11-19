-- Crumb check for 0019 (Opportunities sync). Paste into Supabase → SQL Editor → Run, on crumb-prod, after 0019.
-- Pretends to be two people, tries everything, then UNDOES EVERYTHING (your real data is never touched).
-- The result always shows as an error box ON PURPOSE:
--     "ALL 8 OPPORTUNITY CHECKS PASSED (everything undone)"   ← good
--     "OPPORTUNITY CHECK FAILED: …"                           ← send Claude a screenshot
-- (Last line of this file is "end $$;" — make sure it got pasted.)
do $$
declare
  a  uuid := '00000000-0000-4000-8000-0000000000a9';
  b  uuid := '00000000-0000-4000-8000-0000000000b9';
  wa uuid;
  r  jsonb;
  v  jsonb;
  ok int := 0;
  fail text := 'OPPORTUNITY CHECK FAILED: ';
begin
  -- 1 the table is there with both sets of protections (separation + invite-only)
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'opportunities' and rowsecurity)
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'opportunities') <> 4
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'opportunities'
                    and policyname = 'invited only' and permissive = 'RESTRICTIVE') then
    raise exception '% 1 table or its protections missing', fail;
  end if;
  ok := ok + 1;

  -- two throwaway people, both invited
  insert into auth.users (id, email) values (a, 'opp-a@example.invalid'), (b, 'opp-b@example.invalid');
  insert into public.sync_invites (email, source) values ('opp-a@example.invalid', 'admin'), ('opp-b@example.invalid', 'admin');
  select workspace_id into wa from public.memberships where user_id = a;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 2 a customer and an opportunity for it go up together
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[
    {"op_id":"19000000-0000-4000-8000-000000000001","type":"upsert","table":"accounts","id":"900","base":null,"next":{"name":"Check Co"},"cols":{"kind":"customer"}},
    {"op_id":"19000000-0000-4000-8000-000000000002","type":"upsert","table":"opportunities","id":"o-chk","base":null,"next":{"title":"Patio","term":"short","status":"open","photoIds":["p1"]},"cols":{"account_id":"900"}}]}');
  if r -> 'results' -> 1 ->> 'status' <> 'inserted'
     or (select account_id from public.opportunities where workspace_id = wa and id = 'o-chk') <> '900' then
    raise exception '% 2 opportunity not saved (got %)', fail, r; end if;
  ok := ok + 1;

  -- 3 your other device gets it
  r := public.pull_changes(wa, null);
  if jsonb_array_length(r -> 'opportunities') <> 1 or r -> 'opportunities' -> 0 ->> 'account_id' <> '900'
     or r -> 'opportunities' -> 0 -> 'data' ->> 'title' <> 'Patio' then
    raise exception '% 3 pull missing the opportunity', fail; end if;
  ok := ok + 1;

  -- 4 a change (Won) goes up
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"19000000-0000-4000-8000-000000000003","type":"upsert","table":"opportunities","id":"o-chk","base":{"status":"open"},"next":{"status":"won"}}]}');
  if (select data ->> 'status' from public.opportunities where workspace_id = wa and id = 'o-chk') <> 'won' then
    raise exception '% 4 change not saved', fail; end if;
  ok := ok + 1;

  -- 5 photos linked on two devices at once: both are kept
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"19000000-0000-4000-8000-000000000004","type":"upsert","table":"opportunities","id":"o-chk","base":{"photoIds":["p1"]},"next":{"photoIds":["p1","p2"]}}]}');
  r := public.apply_changes(wa, '{"device":"iPad","ops":[{"op_id":"19000000-0000-4000-8000-000000000005","type":"upsert","table":"opportunities","id":"o-chk","base":{"photoIds":["p1"]},"next":{"photoIds":["p1","p3"]}}]}');
  select data -> 'photoIds' into v from public.opportunities where workspace_id = wa and id = 'o-chk';
  if not (v @> '["p1","p2","p3"]'::jsonb) then raise exception '% 5 photo links merge (got %)', fail, v; end if;
  ok := ok + 1;

  -- 6 delete: marked deleted (never erased), and other devices are told
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"19000000-0000-4000-8000-000000000006","type":"delete","table":"opportunities","id":"o-chk"}]}');
  r := public.pull_changes(wa, null);
  if (select deleted_at from public.opportunities where workspace_id = wa and id = 'o-chk') is null
     or (r -> 'opportunities' -> 0 ->> 'deleted')::boolean is not true then
    raise exception '% 6 delete', fail; end if;
  ok := ok + 1;

  -- 7 to-dos still sync exactly as before
  r := public.apply_changes(wa, '{"device":"iPhone","ops":[{"op_id":"19000000-0000-4000-8000-000000000007","type":"upsert","table":"todos","id":"t-chk","base":null,"next":{"text":"Call back"},"cols":{"account_id":"900"}}]}');
  r := public.pull_changes(wa, null);
  if jsonb_array_length(r -> 'todos') <> 1 or jsonb_array_length(r -> 'accounts') <> 1 then raise exception '% 7 to-dos broke', fail; end if;
  ok := ok + 1;

  -- 8 the other person sees none of it
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if (select count(*) from public.opportunities) <> 0 then raise exception '% 8 B saw A''s opportunities', fail; end if;
  ok := ok + 1;

  reset role;
  raise exception 'ALL % OPPORTUNITY CHECKS PASSED (everything undone)', ok;
end $$;
