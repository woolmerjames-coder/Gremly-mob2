-- Lifemaps and context fixes, part 3: the weekly synthesis as a named writer,
-- and the hourly check for who has new records to read.

alter table public.worlds drop constraint if exists worlds_card_subtitle_source_check;
alter table public.worlds add constraint worlds_card_subtitle_source_check
  check (card_subtitle_source is null or card_subtitle_source = any (array['classifier', 'dco', 'user', 'synthesis']));
alter table public.worlds drop constraint if exists worlds_summary_source_check;
alter table public.worlds add constraint worlds_summary_source_check
  check (summary_source is null or summary_source = any (array['classifier', 'dco', 'user', 'synthesis']));

-- People with activity since the ledger last read their records.
create or replace function public.ledger_users_due(active_days integer default 30)
returns table (user_id uuid, timezone text, read_through timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.timezone, c.read_through
  from public.get_active_people(active_days) a
  left join ledger_cursor c on c.user_id = a.user_id
  where c.read_through is null or a.last_active_at > c.read_through;
$$;
revoke execute on function public.ledger_users_due(integer) from anon, authenticated, public;
grant execute on function public.ledger_users_due(integer) to service_role;
