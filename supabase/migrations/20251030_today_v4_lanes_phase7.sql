-- 1) Completions log
create table if not exists habit_log (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  user_id uuid not null,
  occurred_at timestamptz not null default now()
);

-- index for fast period queries
create index if not exists habit_log_habit_time_idx on habit_log (habit_id, occurred_at);

-- 2) Helper: start of current period (weekly/monthly)
create or replace function period_start(_cadence cadence_type)
returns timestamptz language sql immutable as $$
  select case
    when _cadence = 'weekly'  then date_trunc('week', now())
    when _cadence = 'monthly' then date_trunc('month', now())
    else date_trunc('day', now())
  end
$$;

-- 3) RPC: get_rolling_habits() with counts and surfacing hint
create or replace function get_rolling_habits()
returns table (
  id uuid,
  name text,
  cadence cadence_type,
  target_per_period int,
  target_per_day int,
  last_completed_at timestamptz,
  period_count int,
  today_count int,
  should_surface_today boolean
) language sql security definer set search_path = public as $$
  with base as (
    select h.id, h.name, h.cadence, coalesce(h.target_per_period,1) as target_per_period,
           coalesce(h.target_per_day,1) as target_per_day, h.last_completed_at, h.user_id
    from habits h
    where h.user_id = auth.uid()
  ),
  counts as (
    select
      b.*,
      (
        select count(*) from habit_log l
        where l.habit_id = b.id
          and l.user_id = b.user_id
          and l.occurred_at >= period_start(b.cadence)
      ) as period_count,
      (
        select count(*) from habit_log l2
        where l2.habit_id = b.id
          and l2.user_id = b.user_id
          and l2.occurred_at >= date_trunc('day', now())
      ) as today_count
    from base b
  )
  select
    id, name, cadence, target_per_period, target_per_day, last_completed_at,
    period_count, today_count,
    case
      when cadence = 'daily'   then today_count < target_per_day
      when cadence = 'weekly'  then period_count < target_per_period
      when cadence = 'monthly' then period_count < target_per_period
      else false
    end as should_surface_today
  from counts;
$$;

-- 4) RPC: complete_habit(habit_id) - logs a completion and updates last_completed_at
create or replace function complete_habit(_id uuid)
returns json language plpgsql security definer as $$
declare payload json;
begin
  insert into habit_log (habit_id, user_id) values (_id, auth.uid());
  update habits set last_completed_at = now() where id = _id and user_id = auth.uid()
  returning row_to_json(habits.*) into payload;
  return payload;
end;
$$;

-- 5) Permissions (adjust to your policy style)
grant execute on function get_rolling_habits() to authenticated;
grant execute on function complete_habit(uuid) to authenticated;
