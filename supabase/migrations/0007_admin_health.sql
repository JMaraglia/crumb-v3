-- Crumb Admin, step 3: Platform Health numbers from the database.
-- Run AFTER 0005_admin.sql. Read-only. Safe to run more than once.
-- Counts and sizes only, never record contents.

create or replace function public.admin_health()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'db_size_bytes',  pg_database_size(current_database()),
    'storage_bytes',  (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = 'photos'),
    'storage_files',  (select count(*) from storage.objects o where o.bucket_id = 'photos'),
    'users_total',    (select count(*) from auth.users),
    'users_signed_in_30d', (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '30 days'),
    'needs_review',   (select count(*) from public.conflicts c where c.resolved_at is null),
    'overwrites_24h', (select count(*) from public.conflicts c where c.created_at > now() - interval '24 hours'),
    'changes_24h',    (select count(*) from public.operations o where o.received_at > now() - interval '24 hours'),
    'last_change_at', (select max(o.received_at) from public.operations o),
    'server_time',    now()
  );
end;
$$;

revoke all on function public.admin_health() from public, anon;
grant execute on function public.admin_health() to authenticated;

select 'Crumb Admin step 3 (Platform Health) is set up.' as result;
