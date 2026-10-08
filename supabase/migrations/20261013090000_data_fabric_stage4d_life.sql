-- Data fabric stage 4d: what the person says is kept, and caught up.
--
-- 1. life_facts.timing: when a fact is true, as the reader judges it. day:
--    it is about one day. span: a stretch with a start and an end. standing:
--    it holds with no date of its own, how their life runs or who they are.
--    Every reader reads a standing fact as having no date, whatever date it
--    holds, so it never fades from view after the day it was said. yearly:
--    it falls on the same day every year, and its date is that day. Null
--    until judged: the kind pass gives one to every older fact. No date is
--    changed.
--
-- 2. next_yearly: the next day on or after a date that a yearly fact falls
--    on. A 29 February falls on the 28th in other years.
--
-- 3. life_facts_now carries timing, at its end, and dated_ahead gives a
--    yearly fact on its next day, so a date said once comes back every year,
--    and leaves a standing fact out.
--
-- 4. ledger_reads: which reader version read each record the person made.
--    A record read under older rules is read again by the catch up
--    (inngest-jobs context/reread.js), so a better rule reaches everything
--    the person ever said, not only what comes next.
--
-- All additive: a column, a table, a function, and a view and a function
-- replaced with the same columns plus one. Drops nothing. Run it as one piece.

begin;
set local lock_timeout = '10s';

alter table public.life_facts add column if not exists timing text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'life_facts_timing_check') then
    alter table public.life_facts add constraint life_facts_timing_check
      check (timing is null or timing in ('day', 'span', 'standing', 'yearly'));
  end if;
end $c$;
comment on column public.life_facts.timing is
  'When the fact is true: day, span, standing (read as having no date, whatever it holds) or yearly (the same day every year). Judged by the reader, or by the kind pass for older facts. Null until judged (data fabric stage 4d).';

create or replace function public.next_yearly(p_date date, p_from date)
returns date
language sql
immutable
as $$
  select case when c1 >= p_from then c1 else c2 end
  from (
    select
      make_date(y, m, least(dd, extract(day from (make_date(y, m, 1) + interval '1 month - 1 day'))::int)) as c1,
      make_date(y + 1, m, least(dd, extract(day from (make_date(y + 1, m, 1) + interval '1 month - 1 day'))::int)) as c2
    from (
      select extract(year from p_from)::int as y,
        extract(month from p_date)::int as m,
        extract(day from p_date)::int as dd
    ) a
  ) b;
$$;
comment on function public.next_yearly(date, date) is
  'The next day on or after p_from that falls on the month and day of p_date; 29 February falls on the 28th in other years (data fabric stage 4d).';

create or replace view public.life_facts_now with (security_invoker = true) as
select
  f.id, f.user_id, f.statement, f.subject, f.kind, f.world_id,
  case when coalesce(it.sets_dates, false) then it.item_date else f.about_date end as about_date,
  case when coalesce(it.sets_dates, false) then it.item_date_end else f.about_date_end end as about_date_end,
  f.date_confidence, f.state, f.said_by, f.source_table, f.source_id, f.source_quote,
  f.observed_at, f.last_confirmed_at, f.superseded_by, f.state_reason, f.correction_text,
  f.corrected_at, f.run_id, f.model, f.created_at, f.updated_at, f.private,
  ab.source_table as item_table,
  ab.source_id as item_id,
  (ab.source_id is not null and it.sets_dates is null) as item_gone,
  coalesce(it.item_done, false) as item_done,
  coalesce(it.item_archived, false) as item_archived,
  coalesce(it.item_cancelled, false) as item_cancelled,
  f.about_date as stated_date,
  f.about_date_end as stated_date_end,
  f.health,
  f.prompt_version,
  f.timing
from public.life_facts f
left join lateral (
  select s.source_table, s.source_id
  from public.life_fact_sources s
  where s.fact_id = f.id and s.role = 'about'
  order by s.seen_at desc
  limit 1
) ab on true
left join lateral (
  select x.sets_dates, x.item_date, nullif(x.item_date_end, x.item_date) as item_date_end,
    x.item_done, x.item_archived, x.item_cancelled
  from (
    select true as sets_dates,
      coalesce(t.due_day, t.scheduled_date, t.target_date) as item_date,
      null::date as item_date_end,
      (t.completed_at is not null or t.status = 'done') as item_done,
      (coalesce(t.archived, false) or t.status = 'archived') as item_archived,
      false as item_cancelled
    from public.todos t
    where ab.source_table = 'todos' and t.id = ab.source_id
    union all
    select n.subtype = 'event', coalesce(n.target_date, n.date), n.end_date, false,
      coalesce(n.archived, false), false
    from public.notes n
    where ab.source_table = 'notes' and n.id = ab.source_id
    union all
    select true,
      case when e.is_all_day then (e.start_at at time zone 'UTC')::date
        else (e.start_at at time zone z.zone)::date end,
      case when e.is_all_day then ((e.end_at - interval '1 second') at time zone 'UTC')::date
        else ((e.end_at - interval '1 second') at time zone z.zone)::date end,
      false, coalesce(e.archived, false), e.cancelled_at is not null
    from public.synced_calendar_events e
    cross join lateral (
      select coalesce(
        (select nullif(np.timezone, '') from public.notification_preferences np
          where np.user_id = e.owner_id limit 1),
        'America/Los_Angeles') as zone
    ) z
    where ab.source_table = 'synced_calendar_events' and e.id = ab.source_id
    union all
    select true, m.date, null::date, coalesce(m.completed, false), false, false
    from public.space_milestones m
    where ab.source_table = 'space_milestones' and m.id = ab.source_id
    union all
    select false, null::date, null::date, false, coalesce(h.archived, false), false
    from public.habits h
    where ab.source_table = 'habits' and h.id = ab.source_id
  ) x
  limit 1
) it on true;
revoke all on public.life_facts_now from anon;

create or replace function public.dated_ahead(p_user uuid, p_from date, p_days integer default 42, p_limit integer default 40)
returns table (
  id uuid,
  statement text,
  about_date date,
  about_date_end date,
  state text,
  private boolean,
  health boolean,
  kind text,
  item_table text,
  item_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select x.id, x.statement, x.about_date, x.about_date_end, x.state, x.private, x.health, x.kind,
    x.item_table, x.item_id
  from (
    select distinct on (coalesce(f.item_table || ':' || f.item_id::text, f.id::text))
      f.id, f.statement,
      case when f.timing = 'yearly' then public.next_yearly(f.about_date, p_from) else f.about_date end as about_date,
      case when f.timing = 'yearly' then null else f.about_date_end end as about_date_end,
      f.state, f.private, f.health, f.kind,
      f.item_table, f.item_id
    from public.life_facts_now f
    where f.user_id = p_user
      and f.state in ('planned', 'current', 'unconfirmed')
      and f.about_date is not null
      and coalesce(f.timing, '') <> 'standing'
      and (
        (f.timing = 'yearly'
          and public.next_yearly(f.about_date, p_from) <= p_from + greatest(0, least(p_days, 366)))
        or (coalesce(f.timing, '') <> 'yearly'
          and coalesce(f.about_date_end, f.about_date) >= p_from
          and f.about_date <= p_from + greatest(0, least(p_days, 366)))
      )
      and not f.item_done and not f.item_archived and not f.item_cancelled and not f.item_gone
    order by coalesce(f.item_table || ':' || f.item_id::text, f.id::text), f.last_confirmed_at desc nulls last
  ) x
  order by x.about_date, x.statement
  limit greatest(1, least(p_limit, 100));
$$;
comment on function public.dated_ahead(uuid, date, integer, integer) is
  'The dated facts still ahead or under way from p_from, each item once; a yearly fact on its next day, and no standing fact (data fabric stages 2 and 4d).';

create table if not exists public.ledger_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null,
  source_id text not null,
  reader_version text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, source_table, source_id)
);
create index if not exists ledger_reads_version_idx on public.ledger_reads (user_id, reader_version);
alter table public.ledger_reads enable row level security;
comment on table public.ledger_reads is
  'Which reader version read each record a person made, so a record read under older rules can be read again (data fabric stage 4d).';

notify pgrst, 'reload schema';

commit;
