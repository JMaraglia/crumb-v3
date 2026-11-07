-- Crumb cloud database, step 2: SYNC (server side).  (Nov 7, 2026)  — sync plan step S1.
-- Run ONCE on crumb-test, after 0001. Adds functions only: no tables change, no data is touched.
--
--   apply_changes(workspace, batch)  — the phone sends its outbox here. The whole batch is saved, or none of it.
--                                      Each change is checked field by field against what the cloud has now:
--                                        * nobody else changed that field      → applied
--                                        * the cloud already has the new value → nothing to do
--                                        * another device changed it first     → critical field: cloud keeps its value
--                                          and the other value goes to `conflicts` (Needs Review);
--                                          list (competitors, day lists): merged; anything else: newest wins
--                                      A change already applied (same op_id) is ignored, so retries are safe.
--   pull_changes(workspace, since)   — everything in your workspace changed since a time, for your other devices.
--   resolve_conflict(conflict, pick) — Needs Review: keep this one / keep that one / a typed value.
--
-- Batch format (JSON):  { "device": "iPhone", "ops": [ change, … ] }
--   change = { "op_id": uuid, "type": "upsert" | "delete" | "convert", "table": "accounts" | "notes" | "events" |
--              "stops" | "todos" | "day_marks" | "settings", "id": text,
--              "base": { fields as this device last knew them } | null (new record),
--              "next": { fields now } (upsert/convert), "base_version": int | null,
--              "cols": { "kind": …, "account_id": …, "day": … } (record's place: which account/day/kind),
--              "new_id": text (convert only, when the customer needs a different ID) }
--   day_marks id = "<kind>|<YYYY-MM-DD>"  ·  settings id = the setting's key

-- ---------------------------------------------------------------- which fields are protected
-- 'critical' = never overwritten silently (Needs Review) · 'list' = merged · 'newest' = latest edit wins
create function public.sync_rule(tbl text, field text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when tbl = 'accounts' and field = 'competitors' then 'list'
    when tbl = 'accounts' and field in ('name', 'accountNumber', 'address', 'town', 'contacts', 'owner', 'phone',
         'email', 'website', 'stage', 'inactive', 'visitDays', 'deliveryDays', 'visitTime', 'visitFrequency',
         'visitStart', 'group') then 'critical'
    when tbl = 'notes' and field in ('text') then 'critical'
    when tbl = 'events' and field in ('title', 'date', 'start', 'end', 'location') then 'critical'
    when tbl = 'todos' and field in ('text') then 'critical'
    when tbl in ('day_marks', 'settings') and field = '_list' then 'list'
    else 'newest'
  end;
$$;

-- Merge two edits of a list of simple values: what this device added is added, what it removed is removed,
-- everything the other device did stays.  (current ∪ added) − removed, keeping the current order.
create function public.sync_list_merge(cur jsonb, base jsonb, nxt jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  with c as (select value, ord from jsonb_array_elements(coalesce(case when jsonb_typeof(cur) = 'array' then cur end, '[]')) with ordinality t(value, ord)),
       b as (select value from jsonb_array_elements(coalesce(case when jsonb_typeof(base) = 'array' then base end, '[]'))),
       n as (select value, ord from jsonb_array_elements(coalesce(case when jsonb_typeof(nxt) = 'array' then nxt end, '[]')) with ordinality t(value, ord)),
       added as (select value, ord from n where value not in (select value from b) and value not in (select value from c)),
       removed as (select value from b where value not in (select value from n)),
       kept as (select value, ord from c where value not in (select value from removed)),
       allv as (select value, ord, 1 as grp from kept union all select value, ord, 2 from added)
  select coalesce(jsonb_agg(value order by grp, ord), '[]'::jsonb) from allv;
$$;

-- ---------------------------------------------------------------- apply one batch
create function public.apply_changes(p_workspace uuid, p_batch jsonb)
returns jsonb
language plpgsql
security invoker            -- runs as the signed-in person: every security rule still applies
set search_path = ''
as $$
declare
  ch          jsonb;
  op          uuid;
  typ         text;
  tbl         text;
  rid         text;
  base        jsonb;
  nxt         jsonb;
  cols        jsonb;
  bver        int;
  device      text := coalesce(p_batch ->> 'device', '');
  cur         record;
  cur_data    jsonb;
  out_data    jsonb;
  k           text;
  rule        text;
  b_v         jsonb;
  n_v         jsonb;
  s_v         jsonb;
  results     jsonb := '[]'::jsonb;
  status      text;
  conflicts_n int := 0;
  where_sql   text;
  dm_kind     text;
  dm_day      date;
  new_id      text;
  new_ver     int;
begin
  if not public.is_member(p_workspace) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;

  for ch in select value from jsonb_array_elements(coalesce(p_batch -> 'ops', '[]'::jsonb)) loop
    op   := (ch ->> 'op_id')::uuid;
    typ  := ch ->> 'type';
    tbl  := ch ->> 'table';
    rid  := ch ->> 'id';
    base := ch -> 'base';
    nxt  := coalesce(ch -> 'next', '{}'::jsonb);
    cols := coalesce(ch -> 'cols', '{}'::jsonb);
    bver := (ch ->> 'base_version')::int;
    status := null;

    if op is null or rid is null or typ not in ('upsert', 'delete', 'convert')
       or tbl not in ('accounts', 'notes', 'events', 'stops', 'todos', 'day_marks', 'settings') then
      raise exception 'bad change in batch: %', ch::text using errcode = '22023';
    end if;
    if jsonb_typeof(cols) <> 'object' or jsonb_typeof(nxt) not in ('object', 'array', 'string', 'number', 'boolean') then
      raise exception 'bad change in batch (cols/next): %', ch::text using errcode = '22023';
    end if;
    if typ = 'convert' and tbl <> 'accounts' then
      raise exception 'convert is only for accounts' using errcode = '22023';
    end if;

    -- Already applied (a retry)? Then skip it.
    if exists (select 1 from public.operations o where o.workspace_id = p_workspace and o.id = op) then
      results := results || jsonb_build_object('op_id', op, 'status', 'duplicate');
      continue;
    end if;
    insert into public.operations (workspace_id, id, kind, device) values (p_workspace, op, typ || ':' || tbl, device);

    -- How to find this record
    if tbl = 'day_marks' then
      dm_kind := split_part(rid, '|', 1);
      dm_day  := split_part(rid, '|', 2)::date;
      where_sql := format('workspace_id = %L and kind = %L and day = %L', p_workspace, dm_kind, dm_day);
    elsif tbl = 'settings' then
      where_sql := format('workspace_id = %L and key = %L', p_workspace, rid);
    else
      where_sql := format('workspace_id = %L and id = %L', p_workspace, rid);
    end if;

    execute format('select data, version, deleted_at from public.%I where %s for update', tbl, where_sql) into cur;

    -- ================= delete
    if typ = 'delete' then
      if cur is null or cur.deleted_at is not null then
        status := 'already_gone';
      elsif bver is not null and cur.version <> bver then
        -- edited on another device since this device last saw it: the edit wins, the delete becomes a review note
        insert into public.conflicts (workspace_id, table_name, record_id, field, kept_value, other_value, other_device)
        values (p_workspace, tbl, rid, '_deleted', to_jsonb(false), to_jsonb(true), device);
        conflicts_n := conflicts_n + 1;
        status := 'kept_edited';
      else
        execute format('update public.%I set deleted_at = now() where %s', tbl, where_sql);
        status := 'deleted';
      end if;
      execute format('select version from public.%I where %s', tbl, where_sql) into new_ver;
      results := results || jsonb_build_object('op_id', op, 'status', status, 'version', new_ver);
      continue;
    end if;

    -- ================= convert prospect → customer (one step)
    if typ = 'convert' then
      new_id := coalesce(nullif(ch ->> 'new_id', ''), rid);
      if cur is null then
        raise exception 'convert: account % not found', rid using errcode = 'P0002';
      end if;
      if new_id <> rid then
        -- The customer needs a different ID: create it, move everything linked, retire the old one.
        insert into public.accounts (workspace_id, id, kind, data)
        values (p_workspace, new_id, 'customer', cur.data);
        update public.notes  set account_id = new_id where workspace_id = p_workspace and account_id = rid;
        update public.events set account_id = new_id where workspace_id = p_workspace and account_id = rid;
        update public.stops  set account_id = new_id where workspace_id = p_workspace and account_id = rid;
        update public.todos  set account_id = new_id where workspace_id = p_workspace and account_id = rid;
        update public.photos set account_id = new_id where workspace_id = p_workspace and account_id = rid;
        update public.accounts set deleted_at = now(), data = data || jsonb_build_object('convertedTo', new_id)
          where workspace_id = p_workspace and id = rid;
        rid := new_id;
        where_sql := format('workspace_id = %L and id = %L', p_workspace, rid);
        execute format('select data, version, deleted_at from public.%I where %s for update', tbl, where_sql) into cur;
      else
        update public.accounts set kind = 'customer' where workspace_id = p_workspace and id = rid;
      end if;
      -- then the customer's fields are merged like any other edit (below)
    end if;

    -- ================= upsert (and the field part of convert)
    if cur is null then
      if tbl = 'accounts' then
        insert into public.accounts (workspace_id, id, kind, data)
        values (p_workspace, rid, coalesce(cols ->> 'kind', 'prospect'), nxt);
      elsif tbl = 'notes' then
        insert into public.notes (workspace_id, id, account_id, data) values (p_workspace, rid, cols ->> 'account_id', nxt);
      elsif tbl in ('events', 'stops') then
        execute format('insert into public.%I (workspace_id, id, account_id, day, data) values ($1, $2, $3, $4, $5)', tbl)
          using p_workspace, rid, cols ->> 'account_id', (cols ->> 'day')::date, nxt;
      elsif tbl = 'todos' then
        insert into public.todos (workspace_id, id, account_id, data) values (p_workspace, rid, cols ->> 'account_id', nxt);
      elsif tbl = 'day_marks' then
        insert into public.day_marks (workspace_id, kind, day, data) values (p_workspace, dm_kind, dm_day, nxt);
      else
        insert into public.settings (workspace_id, key, data) values (p_workspace, rid, nxt);
      end if;
      status := 'inserted';
    else
      cur_data := cur.data;
      if cur.deleted_at is not null then
        -- deleted on another device but edited here: the edit wins, and it's flagged for review
        insert into public.conflicts (workspace_id, table_name, record_id, field, kept_value, other_value, other_device)
        values (p_workspace, tbl, rid, '_deleted', to_jsonb(false), to_jsonb(true), device);
        conflicts_n := conflicts_n + 1;
      end if;

      if jsonb_typeof(nxt) = 'object' and jsonb_typeof(cur_data) = 'object' then
        -- field by field
        out_data := cur_data;
        for k in select jsonb_object_keys(nxt) union select jsonb_object_keys(coalesce(case when jsonb_typeof(base) = 'object' then base end, '{}'::jsonb)) loop
          b_v := case when jsonb_typeof(base) = 'object' then base -> k end;
          n_v := nxt -> k;
          s_v := cur_data -> k;
          continue when n_v is not distinct from b_v;          -- this device didn't change it
          continue when s_v is not distinct from n_v;          -- the cloud already has it
          rule := public.sync_rule(tbl, k);
          if base is null or s_v is not distinct from b_v then
            out_data := case when n_v is null then out_data - k else jsonb_set(out_data, array[k], n_v) end;
          elsif rule = 'list' then
            out_data := jsonb_set(out_data, array[k], public.sync_list_merge(s_v, b_v, n_v));
          elsif rule = 'critical' then
            insert into public.conflicts (workspace_id, table_name, record_id, field, kept_value, other_value, other_device)
            values (p_workspace, tbl, rid, k, s_v, n_v, device);
            conflicts_n := conflicts_n + 1;
          else
            out_data := case when n_v is null then out_data - k else jsonb_set(out_data, array[k], n_v) end;
          end if;
        end loop;
      elsif jsonb_typeof(nxt) = 'array' then
        -- a whole list (day lists, competitor list): merged
        if base is null or cur_data is not distinct from base then
          out_data := nxt;
        else
          out_data := public.sync_list_merge(cur_data, base, nxt);
        end if;
      else
        -- a single value (e.g. check-in days): newest wins
        out_data := nxt;
      end if;

      execute format('update public.%I set data = $1, deleted_at = null where %s', tbl, where_sql) using out_data;
      -- where it belongs (which account / day) follows the latest edit
      if tbl in ('notes', 'todos', 'events', 'stops') and cols ? 'account_id' then
        execute format('update public.%I set account_id = $1 where %s', tbl, where_sql) using cols ->> 'account_id';
      end if;
      if tbl in ('events', 'stops') and cols ? 'day' then
        execute format('update public.%I set day = $1 where %s', tbl, where_sql) using (cols ->> 'day')::date;
      end if;
      status := case when typ = 'convert' then 'converted' else 'updated' end;
    end if;

    execute format('select version from public.%I where %s', tbl, where_sql) into new_ver;
    results := results || jsonb_build_object('op_id', op, 'status', status, 'version', new_ver, 'id', rid);
  end loop;

  return jsonb_build_object('results', results, 'conflicts', conflicts_n, 'server_time', now());
end;
$$;

-- ---------------------------------------------------------------- pull
-- Everything in the workspace changed after `since` (deleted records included, as marks), plus open conflicts.
-- Devices ask again with a small overlap; applying the same record twice is harmless (same version).
create function public.pull_changes(p_workspace uuid, p_since timestamptz)
returns jsonb
language plpgsql
security invoker
stable
set search_path = ''
as $$
declare
  since timestamptz := coalesce(p_since, '-infinity'::timestamptz);
begin
  if not public.is_member(p_workspace) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'server_time', now(),
    'accounts',  (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'data', data, 'version', version, 'deleted', deleted_at is not null)), '[]') from public.accounts  where workspace_id = p_workspace and updated_at > since),
    'notes',     (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'account_id', account_id, 'data', data, 'version', version, 'deleted', deleted_at is not null)), '[]') from public.notes where workspace_id = p_workspace and updated_at > since),
    'events',    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'account_id', account_id, 'day', day, 'data', data, 'version', version, 'deleted', deleted_at is not null)), '[]') from public.events where workspace_id = p_workspace and updated_at > since),
    'stops',     (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'account_id', account_id, 'day', day, 'data', data, 'version', version, 'deleted', deleted_at is not null)), '[]') from public.stops where workspace_id = p_workspace and updated_at > since),
    'todos',     (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'account_id', account_id, 'data', data, 'version', version, 'deleted', deleted_at is not null)), '[]') from public.todos where workspace_id = p_workspace and updated_at > since),
    'day_marks', (select coalesce(jsonb_agg(jsonb_build_object('id', kind || '|' || day, 'data', data, 'version', version, 'deleted', deleted_at is not null)), '[]') from public.day_marks where workspace_id = p_workspace and updated_at > since),
    'settings',  (select coalesce(jsonb_agg(jsonb_build_object('id', key, 'data', data, 'version', version, 'deleted', deleted_at is not null)), '[]') from public.settings where workspace_id = p_workspace and updated_at > since),
    'conflicts', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'table', table_name, 'record_id', record_id, 'field', field, 'kept', kept_value, 'other', other_value, 'other_device', other_device, 'created_at', created_at)), '[]') from public.conflicts where workspace_id = p_workspace and resolved_at is null)
  );
end;
$$;

-- ---------------------------------------------------------------- Needs Review: resolve
-- pick = 'kept' (leave the cloud's value), 'other' (use the other device's value), or 'custom' (p_value).
create function public.resolve_conflict(p_conflict uuid, p_pick text, p_value jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c     record;
  val   jsonb;
  where_sql text;
begin
  select * into c from public.conflicts where id = p_conflict and resolved_at is null for update;
  if c is null then
    raise exception 'that review item is already resolved or does not exist' using errcode = 'P0002';
  end if;
  if p_pick not in ('kept', 'other', 'custom') then
    raise exception 'pick must be kept, other or custom' using errcode = '22023';
  end if;
  if c.table_name = 'day_marks' then
    where_sql := format('workspace_id = %L and kind = %L and day = %L', c.workspace_id, split_part(c.record_id, '|', 1), split_part(c.record_id, '|', 2));
  elsif c.table_name = 'settings' then
    where_sql := format('workspace_id = %L and key = %L', c.workspace_id, c.record_id);
  else
    where_sql := format('workspace_id = %L and id = %L', c.workspace_id, c.record_id);
  end if;
  if c.field = '_deleted' and p_pick = 'other' then
    -- "it was deleted on the other device": go ahead and delete it after all
    execute format('update public.%I set deleted_at = now() where %s', c.table_name, where_sql);
  elsif c.field <> '_deleted' and p_pick <> 'kept' then
    val := case when p_pick = 'other' then c.other_value else p_value end;
    execute format('update public.%I set data = case when $1 is null then data - $2 else jsonb_set(data, array[$2], $1) end where %s',
                   c.table_name, where_sql) using val, c.field;
  end if;
  update public.conflicts set resolved_at = now(), resolution = p_pick where id = p_conflict;
  return jsonb_build_object('resolved', p_conflict, 'pick', p_pick);
end;
$$;

-- ---------------------------------------------------------------- who may call these
revoke all on function public.apply_changes(uuid, jsonb) from public, anon;
revoke all on function public.pull_changes(uuid, timestamptz) from public, anon;
revoke all on function public.resolve_conflict(uuid, text, jsonb) from public, anon;
grant execute on function public.apply_changes(uuid, jsonb) to authenticated;
grant execute on function public.pull_changes(uuid, timestamptz) to authenticated;
grant execute on function public.resolve_conflict(uuid, text, jsonb) to authenticated;
grant execute on function public.sync_rule(text, text) to authenticated;
grant execute on function public.sync_list_merge(jsonb, jsonb, jsonb) to authenticated;
-- (end of file)
