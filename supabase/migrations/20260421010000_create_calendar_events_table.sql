create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  -- Provider identity
  external_id text not null,
  provider text not null,
  calendar_id text,
  etag text,

  -- Event data
  title text,
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  is_all_day boolean default false,

  -- Archive (for aging out old events)
  archived boolean not null default false,
  archived_at timestamptz,

  -- Metadata
  last_synced_at timestamptz not null default now(),
  raw jsonb,

  -- Lifecycle
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, external_id, provider)
);

create index if not exists idx_calendar_events_owner_active
  on calendar_events (owner_id, start_at)
  where archived = false;

create index if not exists idx_calendar_events_range
  on calendar_events (owner_id, start_at, end_at)
  where archived = false;

alter table calendar_events enable row level security;

create policy "Users can view their own calendar events"
  on calendar_events for select
  using (auth.uid() = owner_id);

create policy "Users can insert their own calendar events"
  on calendar_events for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own calendar events"
  on calendar_events for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own calendar events"
  on calendar_events for delete
  using (auth.uid() = owner_id);
