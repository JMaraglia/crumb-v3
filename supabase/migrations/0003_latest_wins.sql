-- Crumb migration 0003 (Nov 7 2026, sync step S5): LATEST CHANGE WINS — no Needs Review.
-- Founder decision: "If it's edited, it's edited." When two devices change the same field (phone, name,
-- note text…) before syncing, the change that reaches the cloud last wins. Nothing asks the rep anything.
-- The value it replaced is never thrown away: it's kept as quiet history in the conflicts table, already
-- marked resolved (so nothing shows anywhere). Deleted-vs-edited: the edit still wins (history only).
-- Everything else (retry safety, list merging, Convert, security) is unchanged from 0002.
-- Paste into Supabase → SQL Editor → Run, on crumb-test. Safe to run twice.

create or replace function public.apply_changes(p_workspace uuid, p_batch jsonb)
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
        -- edited on another device since this device last saw it: the edit wins (history only, no review)
        insert into public.conflicts (workspace_id, table_name, record_id, field, kept_value, other_value, other_device, resolved_at, resolution)
        values (p_workspace, tbl, rid, '_deleted', to_jsonb(false), to_jsonb(true), device, now(), 'edit_kept');
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
        -- deleted on another device but edited here: the edit wins (history only, no review)
        insert into public.conflicts (workspace_id, table_name, record_id, field, kept_value, other_value, other_device, resolved_at, resolution)
        values (p_workspace, tbl, rid, '_deleted', to_jsonb(false), to_jsonb(true), device, now(), 'edit_kept');
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
            -- Both devices changed it: the latest change wins. The value it replaced is kept as quiet history
            -- (kept_value = what the record has now, other_value = what it replaced; already resolved).
            insert into public.conflicts (workspace_id, table_name, record_id, field, kept_value, other_value, other_device, resolved_at, resolution)
            values (p_workspace, tbl, rid, k, n_v, s_v, device, now(), 'latest_wins');
            out_data := case when n_v is null then out_data - k else jsonb_set(out_data, array[k], n_v) end;
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

grant execute on function public.apply_changes(uuid, jsonb) to authenticated;
-- (end of file)
