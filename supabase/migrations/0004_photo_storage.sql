-- Crumb migration 0004 (Nov 7 2026, sync step S6): a private place in the cloud for photos.
-- Photos live in the "photos" storage bucket, one folder per workspace: <workspace id>/<photo id>.jpg
-- Only members of that workspace can see or add photos in its folder. Nobody can erase a photo file from
-- the app (a deleted photo is only marked deleted in the photos table, like everything else).
-- Paste into Supabase → SQL Editor → Run, on crumb-test. Safe to run twice.

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Is this folder name one of my workspaces? (false for anything that isn't a workspace id)
create or replace function public.is_member_folder(folder text)
returns boolean
language sql stable
set search_path = ''
as $$
  select case
    when folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.is_member(folder::uuid)
    else false
  end;
$$;
revoke all on function public.is_member_folder(text) from public, anon;
grant execute on function public.is_member_folder(text) to authenticated;

drop policy if exists "crumb photos: members read" on storage.objects;
drop policy if exists "crumb photos: members add" on storage.objects;
drop policy if exists "crumb photos: members replace" on storage.objects;

create policy "crumb photos: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and public.is_member_folder((storage.foldername(name))[1]));

create policy "crumb photos: members add" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member_folder((storage.foldername(name))[1]));

create policy "crumb photos: members replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_member_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'photos' and public.is_member_folder((storage.foldername(name))[1]));

-- (end of file)
