-- Create table for chat messages within a space chat thread
create table if not exists public.space_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  chat_id uuid not null references public.space_chats(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  metadata_json jsonb,
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_scm_chat_id on public.space_chat_messages (chat_id);
create index if not exists idx_scm_user_id on public.space_chat_messages (user_id);
create index if not exists idx_scm_created_at on public.space_chat_messages (created_at);

-- Enable Row Level Security
alter table public.space_chat_messages enable row level security;

-- Policies:
-- SELECT: auth.uid() = user_id OR (role = 'assistant' AND chat belongs to auth.uid())
-- INSERT/UPDATE/DELETE: auth.uid() = user_id
drop policy if exists "scm_select_own" on public.space_chat_messages;
create policy "scm_select_own"
on public.space_chat_messages
for select
to authenticated
using (
  auth.uid() = user_id 
  OR (
    role = 'assistant' 
    AND EXISTS (
      SELECT 1 FROM public.space_chats sc 
      WHERE sc.id = space_chat_messages.chat_id 
      AND sc.user_id = auth.uid()
    )
  )
);

drop policy if exists "scm_insert_own" on public.space_chat_messages;
create policy "scm_insert_own"
on public.space_chat_messages
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "scm_update_own" on public.space_chat_messages;
create policy "scm_update_own"
on public.space_chat_messages
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "scm_delete_own" on public.space_chat_messages;
create policy "scm_delete_own"
on public.space_chat_messages
for delete
to authenticated
using (auth.uid() = user_id);

-- Documentation comments
comment on table public.space_chat_messages is
'Per-message storage for a single space chat thread. Policy is per-user (user_id = auth.uid()).';
comment on column public.space_chat_messages.chat_id is 'FK to public.space_chats(id).';
comment on column public.space_chat_messages.user_id is 'Owner of this message. Set to the current user for both user and assistant messages.';
comment on column public.space_chat_messages.role is 'Message role: user | assistant | system.';
comment on column public.space_chat_messages.metadata_json is 'Optional structured metadata (tool traces, chips, etc.).';
