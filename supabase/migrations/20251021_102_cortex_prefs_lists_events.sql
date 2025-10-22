/**
 * Phase 10.2: Cortex Primitives (Preferences, Lists, Events)
 * 
 * PURPOSE:
 * - cortex_preferences: Per-user behavior/tone settings for AI personalization
 * - lists: Named lists (shopping, reading, packing, custom) optionally scoped to spaces
 * - list_items: Items within lists with optional qty/unit/metadata
 * - events: Decision log for cortex actions and user responses
 * - relations: (Optional) Generic graph for item-to-item or item-to-space relationships
 * 
 * VERIFICATION:
 * \d+ cortex_preferences
 * \d+ lists
 * \d+ list_items
 * \d+ events
 * \d+ relations
 * 
 * EXAMPLES:
 * select * from cortex_preferences where owner_id = 'user-uuid';
 * select * from lists where owner_id = 'user-uuid' order by created_at;
 * select * from list_items where list_id = 'list-uuid' order by created_at;
 * select * from events where owner_id = 'user-uuid' and kind = 'cortex_decision' order by created_at desc limit 10;
 */

-- 1) Per-user behavior/tone settings
create table if not exists public.cortex_preferences (
  owner_id uuid primary key,
  tone text,               -- 'calm' | 'warm' | 'direct'
  brevity text,            -- 'short' | 'normal' | 'detailed'
  encouragement text,      -- 'low' | 'medium' | 'high'
  morning_preview time,
  evening_review time,
  dnd jsonb,               -- { start: '22:00', end: '07:00', days: [...] }
  updated_at timestamptz default now()
);

-- 2) Named lists (e.g., Shopping, Packing) optionally scoped to a space
create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  key text not null,       -- 'shopping' | 'reading' | 'packing' | 'custom'
  name text not null,
  space_id uuid null,
  created_at timestamptz default now()
);
create index if not exists idx_lists_owner_key on public.lists(owner_id, key);
create index if not exists idx_lists_space on public.lists(space_id);

-- 3) Items within a list
create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  label text not null,
  qty numeric null,
  unit text null,
  meta_json jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_list_items_list on public.list_items(list_id, created_at);

-- 4) Event log for decisions & user responses
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  kind text not null,      -- 'cortex_decision' | 'user_override' | ...
  payload_json jsonb not null,
  created_at timestamptz default now()
);
create index if not exists idx_events_owner_kind_time on public.events(owner_id, kind, created_at desc);

-- 5) Generic relations graph (optional)
create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  src_item_id uuid not null,
  rel text not null,       -- 'references' | 'contains' | 'belongs_to_space' | 'supersedes'
  dst_item_id uuid null,
  dst_space_id uuid null,
  created_at timestamptz default now()
);
create index if not exists idx_relations_src on public.relations(owner_id, src_item_id, rel);
create index if not exists idx_relations_dst on public.relations(owner_id, dst_item_id);
create index if not exists idx_relations_space on public.relations(owner_id, dst_space_id);
