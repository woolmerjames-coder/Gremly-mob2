-- Daily brief in Chat, part 1: the day's thread and the briefInChat switch.
-- Additive only: one more chat type, one thread per person per ritual day,
-- a per-person switch, and the 30-day archive extended to daily threads.

-- ─── The day's thread ───────────────────────────────────────────────────────
-- A scope_chats row with chat_type 'daily' and the ritual day (YYYY-MM-DD) in
-- metadata_json.ritual_day. Its metadata also records seen_at, answered_at
-- and plan_locked_at as the day goes on.
alter table public.scope_chats drop constraint if exists scope_chats_chat_type_check;
alter table public.scope_chats
  add constraint scope_chats_chat_type_check
  check (chat_type in ('space', 'world', 'chapter', 'general', 'daily'));

create unique index if not exists scope_chats_daily_one_per_day
  on public.scope_chats (user_id, ((metadata_json ->> 'ritual_day')))
  where chat_type = 'daily';

-- Whichever comes first creates the thread: the brief job (service role, passes
-- p_user) or the person's first open (authenticated, p_user left out).
create or replace function public.ensure_daily_thread(p_day date, p_user uuid default null)
returns public.scope_chats
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := coalesce(auth.uid(), p_user);
  thread public.scope_chats;
begin
  if uid is null then
    raise exception 'ensure_daily_thread: no user';
  end if;
  if auth.uid() is not null and p_user is not null and p_user <> auth.uid() then
    raise exception 'ensure_daily_thread: not your thread';
  end if;
  insert into public.scope_chats (user_id, chat_type, title, metadata_json)
  values (uid, 'daily', to_char(p_day, 'FMDay FMDD Mon'), jsonb_build_object('ritual_day', p_day::text))
  on conflict (user_id, ((metadata_json ->> 'ritual_day'))) where chat_type = 'daily'
  do nothing;
  select * into thread
  from public.scope_chats
  where user_id = uid and chat_type = 'daily' and metadata_json ->> 'ritual_day' = p_day::text;
  return thread;
end;
$$;
revoke all on function public.ensure_daily_thread(date, uuid) from public, anon;
grant execute on function public.ensure_daily_thread(date, uuid) to authenticated, service_role;
comment on function public.ensure_daily_thread(date, uuid) is
  'The day''s brief thread for a person and ritual day, created on first ask. Daily brief in Chat.';

-- ─── The switch ─────────────────────────────────────────────────────────────
-- briefInChat: on for one person first. The app and the brief job both read it.
alter table public.cortex_preferences
  add column if not exists brief_in_chat boolean not null default false;
comment on column public.cortex_preferences.brief_in_chat is
  'Daily brief in Chat: true moves this person''s morning brief into the Chat thread.';

-- ─── Daily threads archive like general chats ───────────────────────────────
create or replace function public.archive_stale_general_chats()
returns integer
language plpgsql
security definer
as $function$
declare
  archived_count integer;
begin
  update scope_chats
  set archived_at = now()
  where chat_type in ('general', 'daily')
    and archived_at is null
    and updated_at < now() - interval '30 days';
  get diagnostics archived_count = row_count;
  return archived_count;
end;
$function$;
