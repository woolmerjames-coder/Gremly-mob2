-- Lifemaps and context fixes, part 12: a day the app was opened counts as an
-- active day even on app builds that do not log app_events yet, so time away is
-- measured from the last open, not the last thing written.

create or replace function public.user_activity_days(p_user uuid, p_from date, p_to date)
returns table (
  day date,
  drops integer,
  journals integer,
  todos_done integer,
  habit_checkins integer,
  chat_messages integer,
  chats integer,
  sweeps integer,
  fed boolean,
  age_up boolean,
  app_opens integer,
  world_visits integer,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with tz as (
    select coalesce(
      (select nullif(np.timezone, '') from notification_preferences np where np.user_id = p_user),
      (select nullif(nullif(up.timezone, ''), 'UTC') from user_profiles up where up.user_id = p_user),
      'America/Los_Angeles') as z
  ),
  days as (select generate_series(p_from, p_to, interval '1 day')::date as d),
  drops as (
    select (x.created_at at time zone (select z from tz))::date as d, count(*)::int as n from (
      select created_at from todos where owner_id = p_user
      union all select created_at from notes where owner_id = p_user and external_source is null
      union all select created_at from habits where owner_id = p_user
    ) x group by 1
  ),
  journals as (
    select (created_at at time zone (select z from tz))::date as d, count(*)::int as n
    from notes where owner_id = p_user and subtype = 'journal' group by 1
  ),
  done as (
    select (completed_at at time zone (select z from tz))::date as d, count(*)::int as n
    from todos where owner_id = p_user and completed_at is not null group by 1
  ),
  checkins as (
    select occurred_day as d, count(*)::int as n from habit_progress where owner_id = p_user group by 1
  ),
  chat as (
    select (created_at at time zone (select z from tz))::date as d, count(*)::int as n, count(distinct chat_id)::int as c
    from scope_chat_messages where user_id = p_user and role = 'user' group by 1
  ),
  sweeps as (
    select (created_at at time zone (select z from tz))::date as d, count(*)::int as n
    from events where owner_id = p_user and kind = 'sweep_completed' group by 1
  ),
  fed as (
    select ritual_day as d, bool_or(is_fed) as f from daily_ritual_progress where owner_id = p_user group by 1
  ),
  fed_numbered as (
    select d, row_number() over (order by d) as k from fed where f
  ),
  opens as (
    -- App builds from before app_events only record the last time the app was
    -- active (notification_preferences.last_app_active_at); that day counts as an open.
    select d, greatest(sum(o), max(hb))::int as o, sum(w)::int as w from (
      select (occurred_at at time zone (select z from tz))::date as d,
        count(*) filter (where kind = 'app_open') as o,
        count(*) filter (where kind = 'world_view') as w,
        0 as hb
      from app_events where user_id = p_user group by 1
      union all
      select (np.last_app_active_at at time zone (select z from tz))::date, 0, 0, 1
      from notification_preferences np where np.user_id = p_user and np.last_app_active_at is not null
    ) x group by d
  )
  select
    days.d,
    coalesce(drops.n, 0), coalesce(journals.n, 0), coalesce(done.n, 0), coalesce(checkins.n, 0),
    coalesce(chat.n, 0), coalesce(chat.c, 0), coalesce(sweeps.n, 0),
    coalesce(fed.f, false),
    coalesce(fed_numbered.k % 3 = 0, false),
    coalesce(opens.o, 0), coalesce(opens.w, 0),
    (coalesce(drops.n, 0) + coalesce(done.n, 0) + coalesce(checkins.n, 0) + coalesce(chat.n, 0)
      + coalesce(sweeps.n, 0) + coalesce(opens.o, 0) + coalesce(opens.w, 0)) > 0 or coalesce(fed.f, false)
  from days
  left join drops on drops.d = days.d
  left join journals on journals.d = days.d
  left join done on done.d = days.d
  left join checkins on checkins.d = days.d
  left join chat on chat.d = days.d
  left join sweeps on sweeps.d = days.d
  left join fed on fed.d = days.d
  left join fed_numbered on fed_numbered.d = days.d
  left join opens on opens.d = days.d
  order by days.d;
$$;
