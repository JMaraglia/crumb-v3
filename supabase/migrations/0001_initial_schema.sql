-- Crumb cloud database, step 1: tables + security rules.  (Nov 6, 2026)
-- Run on crumb-test first. Safe to read; it creates empty tables only and touches no existing data.
--
-- How it's organized
--   * Every record belongs to a WORKSPACE (a person's own Crumb now; a company later — Crumb Pro).
--   * A person can only see or change records in workspaces they're a member of. This is enforced by
--     the database itself (Row Level Security), not by the app.
--   * Records keep the IDs they already have in the app (customer 1730000000000, note "n-…", stop "s-…"),
--     stored as text and unique within a workspace — so no link between records ever has to be rewritten.
--   * The app's own fields live in `data` (JSON), exactly as the phone saves them today. Columns are added
--     only for what the database needs: ownership, links between records, versions, deletes.
--   * Nothing is ever hard-deleted from the app: a delete sets `deleted_at`, so a deleted record can't come
--     back from an offline device, and it can be recovered. (Only the server/admin can truly erase.)
--   * Every change bumps `version`; the sync step uses it to spot two devices editing the same thing.

-- ---------------------------------------------------------------- workspaces & members
create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'personal' check (kind in ('personal', 'company')),
  created_at  timestamptz not null default now()
);

create table public.memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'admin', 'manager', 'rep')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- Crumb Admin (the separate admin app). No one can read or change this from the CRM app.
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Is the signed-in person a member of this workspace? (Used by every security rule.)
create function public.is_member(ws uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

-- Everyone who signs up gets their own personal workspace, owned by them.
create function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  insert into public.workspaces (name, kind) values ('My Crumb', 'personal') returning id into ws;
  insert into public.memberships (workspace_id, user_id, role) values (ws, new.id, 'owner');
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- shared bookkeeping
-- On every save: version goes up by one, and who/when is recorded.
create function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- ---------------------------------------------------------------- business records
-- Customers AND prospects, one table. Converting a prospect just changes `kind` — the record keeps its ID,
-- so its notes, meetings, stops, to-dos and photos never have to move.
create table public.accounts (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           text not null,
  kind         text not null check (kind in ('customer', 'prospect')),
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, id)
);

-- Notes are their own records (so notes written on two devices both survive).
create table public.notes (
  workspace_id uuid not null,
  id           text not null,
  account_id   text not null,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, id),
  -- a note can never point at an account that doesn't exist
  foreign key (workspace_id, account_id) references public.accounts (workspace_id, id) on delete restrict
);
create index notes_account_idx on public.notes (workspace_id, account_id);

-- Calendar events (meetings included). May or may not be linked to an account.
create table public.events (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           text not null,
  account_id   text,
  day          date,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, account_id) references public.accounts (workspace_id, id) on delete set null (account_id)
);
create index events_day_idx on public.events (workspace_id, day);

-- Itinerary stops added by hand.
create table public.stops (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           text not null,
  account_id   text,
  day          date,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, account_id) references public.accounts (workspace_id, id) on delete set null (account_id)
);
create index stops_day_idx on public.stops (workspace_id, day);

-- Your own to-do tasks (Follow-up / Sample to-dos are notes).
create table public.todos (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           text not null,
  account_id   text,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, account_id) references public.accounts (workspace_id, id) on delete set null (account_id)
);

-- Per-day Itinerary marks, one row per kind per day:
--   done / removed / hidden = list of stop keys;  locks / times / lengths = { stop key: minutes }
create table public.day_marks (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind         text not null check (kind in ('done', 'removed', 'hidden', 'locks', 'times', 'lengths', 'ordered')),
  day          date not null,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, kind, day)
);

-- Settings that follow you to every device (calendar settings, check-in days, competitor list…).
-- (Things that belong to one phone — its notification ID, maps app, map cache — stay on the phone.)
create table public.settings (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key          text not null,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, key)
);

-- Photos: the picture file goes in private file storage (set up in a later step); this is its record.
create table public.photos (
  workspace_id uuid not null,
  id           text not null,
  account_id   text not null,
  storage_path text,
  taken_at     timestamptz,
  data         jsonb not null default '{}'::jsonb,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, account_id) references public.accounts (workspace_id, id) on delete restrict
);
create index photos_account_idx on public.photos (workspace_id, account_id);

-- ---------------------------------------------------------------- sync safety
-- Every multi-step action (e.g. Convert) is sent once with its own ID. A retry with the same ID is ignored,
-- so nothing is ever applied twice.
create table public.operations (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id           uuid not null,
  kind         text not null,
  user_id      uuid default auth.uid(),
  device       text,
  received_at  timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- Two devices changed the same important field differently: both values are kept here until you choose.
create table public.conflicts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  table_name    text not null,
  record_id     text not null,
  field         text not null,
  kept_value    jsonb,
  other_value   jsonb,
  other_device  text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolution    text
);
create index conflicts_open_idx on public.conflicts (workspace_id) where resolved_at is null;

-- ---------------------------------------------------------------- version/updated_at on every save
create trigger accounts_touch  before insert or update on public.accounts  for each row execute function public.touch_row();
create trigger notes_touch     before insert or update on public.notes     for each row execute function public.touch_row();
create trigger events_touch    before insert or update on public.events    for each row execute function public.touch_row();
create trigger stops_touch     before insert or update on public.stops     for each row execute function public.touch_row();
create trigger todos_touch     before insert or update on public.todos     for each row execute function public.touch_row();
create trigger day_marks_touch before insert or update on public.day_marks for each row execute function public.touch_row();
create trigger settings_touch  before insert or update on public.settings  for each row execute function public.touch_row();
create trigger photos_touch    before insert or update on public.photos    for each row execute function public.touch_row();

-- ---------------------------------------------------------------- security rules (Row Level Security)
alter table public.workspaces  enable row level security;
alter table public.memberships enable row level security;
alter table public.admins      enable row level security;  -- no rules = no access from the app at all
alter table public.accounts    enable row level security;
alter table public.notes       enable row level security;
alter table public.events      enable row level security;
alter table public.stops       enable row level security;
alter table public.todos       enable row level security;
alter table public.day_marks   enable row level security;
alter table public.settings    enable row level security;
alter table public.photos      enable row level security;
alter table public.operations  enable row level security;
alter table public.conflicts   enable row level security;

-- You see the workspaces you belong to, and your own memberships. Joining/leaving is never done from the app.
create policy "members read their workspaces" on public.workspaces
  for select to authenticated using (public.is_member(id));
create policy "read own memberships" on public.memberships
  for select to authenticated using (user_id = (select auth.uid()));

-- Business records: read, add and change only inside your own workspaces.
-- There is deliberately NO delete rule: the app "deletes" by setting deleted_at.
do $$
declare t text;
begin
  foreach t in array array['accounts', 'notes', 'events', 'stops', 'todos', 'day_marks', 'settings', 'photos'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_member(workspace_id))', t);
    execute format('create policy "members add" on public.%I for insert to authenticated with check (public.is_member(workspace_id))', t);
    execute format('create policy "members change" on public.%I for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t);
  end loop;
end $$;

create policy "members read" on public.operations for select to authenticated using (public.is_member(workspace_id));
create policy "members add"  on public.operations for insert to authenticated with check (public.is_member(workspace_id));
create policy "members read"    on public.conflicts for select to authenticated using (public.is_member(workspace_id));
create policy "members add"     on public.conflicts for insert to authenticated with check (public.is_member(workspace_id));
create policy "members resolve" on public.conflicts for update to authenticated
  using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));

-- ---------------------------------------------------------------- who may touch which table at all
-- Set explicitly, so crumb-test and crumb-prod behave the same whatever the project defaults were.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.workspaces, public.memberships to authenticated;
grant select, insert, update on
  public.accounts, public.notes, public.events, public.stops, public.todos,
  public.day_marks, public.settings, public.photos, public.conflicts
  to authenticated;
grant select, insert on public.operations to authenticated;
-- (public.admins: no access for anyone signed in to the app.)

revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_row() from public, anon;
