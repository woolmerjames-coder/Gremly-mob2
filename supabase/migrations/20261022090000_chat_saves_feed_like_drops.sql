-- Things saved from a chat feed Gremly the way drops do.
--
-- Until now a todo, habit or note made in a chat fed the gauge far less than a
-- drop (8% from the Save items pill) or not at all (Apply on Gremly's card in
-- a chat or in today's thread). People who make things in chat could do all
-- the work of a drop and stay unfed.
--
-- Now one tap that saves something new in a chat counts once, like one drop
-- (a drop split into pieces also counts once), and it climbs the same daily
-- ladder as drops: the first five of the day, drops and chat saves together,
-- give 16% each, the next five 8%, then 4% (lib/constants/soulDocument.ts).
-- The app reads its place on the ladder as drops_count + chat_saves_count, and
-- credits the gauge under its own source, chat_save, so drops and chat saves
-- can be told apart in gauge_breakdown.
--
-- chat_saves_count counts those taps per person per ritual day.
-- increment_chat_save_count adds one and hands back the day's row, the way
-- increment_drop_count does, and refuses any person but the caller (the
-- service key, which has no caller, is let through).
--
-- Adding the column changes nothing for builds that do not read it, so this
-- can run before the app that uses it ships. Running it twice changes nothing.

alter table public.daily_ritual_progress
  add column if not exists chat_saves_count integer not null default 0;

create or replace function public.increment_chat_save_count(p_owner_id uuid, p_ritual_day date)
returns public.daily_ritual_progress
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_progress public.daily_ritual_progress;
begin
  -- only the person themselves, or the service key, which has no caller
  if auth.uid() is not null and not coalesce(p_owner_id = auth.uid(), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.daily_ritual_progress (owner_id, ritual_day, chat_saves_count, updated_at)
  values (p_owner_id, p_ritual_day, 1, now())
  on conflict (owner_id, ritual_day)
  do update set
    chat_saves_count = daily_ritual_progress.chat_saves_count + 1,
    updated_at = now()
  returning * into v_progress;
  return v_progress;
end;
$function$;

revoke execute on function public.increment_chat_save_count(uuid, date) from public, anon;
grant execute on function public.increment_chat_save_count(uuid, date) to authenticated;
