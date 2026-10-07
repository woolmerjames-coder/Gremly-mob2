-- Data fabric stage 1: read everything.
--
-- 1. item_changes, the change log. A row for every insert and delete of a
--    note, todo, habit, calendar entry or weekly review, and for every update
--    that changes one of the person's own fields there. It says which fields
--    changed, the before and after of dates and status (never words), and who
--    made the change: the person (the app, signed in), Gremly (the workers'
--    service key, or the app saving something on his behalf) or the calendar
--    (a sync). A sync or a patch that changes none of those fields writes
--    nothing. The reader wakes on it and reads from it.
-- 2. life_fact_sources: every record a fact rests on, and whether the fact is
--    about that item itself or was said in it. Filled from the one source each
--    fact carries today, all as "said in": which old facts are about an item
--    is the reader's judgment, so only facts read from now on carry "about".
-- 3. life_facts_now: each fact with the current dates and status of the item
--    it is about, so an item is the truth for its own dates.
-- 4. recall_life reads life_facts_now.
-- 5. A cancelled stamp on calendar entries, set when the reader judges an
--    entry cancelled.
-- 6. habit_not_held: a break habit marked not held in the wrap up.
-- 7. ledger_users_due also wakes on the change log.
--
-- All additive. The trigger never fails a write: an error inside it is
-- raised as a warning and the write goes through.
--
-- Run it as one piece. It waits at most 10 seconds for a lock, so a busy table
-- makes it stop with an error rather than hold up the app; run it again then.

begin;
set local lock_timeout = '10s';

-- 1. The change log ----------------------------------------------------------

create table if not exists public.item_changes (
  id bigserial primary key,
  owner_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  fields text[] not null default '{}',
  dates jsonb,
  by text not null check (by in ('person', 'gremly', 'calendar', 'system')),
  at timestamptz not null default now()
);
create index if not exists item_changes_owner_at_idx on public.item_changes (owner_id, at);
create index if not exists item_changes_row_idx on public.item_changes (table_name, row_id);
alter table public.item_changes enable row level security;
revoke all on public.item_changes from anon, authenticated;
comment on table public.item_changes is
  'The change log: inserts, deletes and changes to the person''s own fields on notes, todos, habits, calendar entries and weekly reviews, with who made them. Dates and status carry before and after; words never do.';

create or replace function public.log_item_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := tg_table_name;
  new_row jsonb;
  old_row jsonb;
  owner uuid;
  watched text[];
  dated text[] := array[
    'date', 'target_date', 'end_date', 'event_time', 'end_time', 'is_all_day', 'due_day',
    'scheduled_date', 'due_time', 'status', 'completed_at', 'archived', 'resurface_at',
    'start_at', 'end_at', 'start_date'
  ];
  changed text[] := '{}';
  dates jsonb := '{}'::jsonb;
  f text;
  k text;
  a jsonb;
  b jsonb;
  who text;
begin
  begin
    if tg_op <> 'DELETE' then new_row := to_jsonb(new) - 'raw'; end if;
    if tg_op <> 'INSERT' then old_row := to_jsonb(old) - 'raw'; end if;
    owner := coalesce(new_row ->> 'owner_id', old_row ->> 'owner_id')::uuid;
    if owner is null then
      return null;
    end if;

    -- the person's own fields: what they wrote, its dates, done and archived
    watched := case t
      when 'notes' then array[
        'title', 'body', 'subtype', 'date', 'target_date', 'end_date', 'event_time', 'end_time',
        'is_all_day', 'location', 'list_items', 'mood', 'archived', 'views.journal_page',
        'views.private_journal', 'views.sweep_date', 'views.goal_checkin']
      when 'todos' then array[
        'title', 'body', 'notes', 'due_day', 'scheduled_date', 'target_date', 'due_time',
        'status', 'completed_at', 'archived', 'list_items', 'resurface_at']
      when 'habits' then array[
        'name', 'title', 'frequency', 'why_string', 'notes', 'subtype', 'start_date', 'end_date',
        'archived']
      when 'synced_calendar_events' then array[
        'title', 'location', 'start_at', 'end_at', 'is_all_day', 'archived']
      when 'weekly_reviews' then array['status']
      else array[]::text[]
    end;

    if tg_op = 'UPDATE' then
      foreach f in array watched loop
        if f like 'views.%' then
          a := old_row -> 'views' -> substr(f, 7);
          b := new_row -> 'views' -> substr(f, 7);
        else
          a := old_row -> f;
          b := new_row -> f;
        end if;
        if a is distinct from b then
          changed := changed || f;
          if f = any (dated) then
            dates := dates || jsonb_build_object(f, jsonb_build_array(a, b));
          end if;
        end if;
      end loop;
      -- the weekly review's answers, key by key; the read, the spread and the
      -- check ins are Gremly's and are not watched
      if t = 'weekly_reviews' then
        for k in
          select jsonb_object_keys(
            coalesce(old_row -> 'answers', '{}'::jsonb) || coalesce(new_row -> 'answers', '{}'::jsonb))
        loop
          if (old_row -> 'answers' -> k) is distinct from (new_row -> 'answers' -> k) then
            changed := changed || ('answers.' || k);
          end if;
        end loop;
      end if;
      if cardinality(changed) = 0 then
        return null;
      end if;
    end if;

    who := case
      when auth.role() = 'service_role' then 'gremly'
      when auth.role() = 'authenticated' then
        case
          when t = 'synced_calendar_events' then 'calendar'
          when tg_op = 'INSERT' and new_row ->> 'origin' = 'chat_save' then 'gremly'
          else 'person'
        end
      else 'system'
    end;

    insert into public.item_changes (owner_id, table_name, row_id, op, fields, dates, by)
    values (
      owner, t, coalesce(new_row ->> 'id', old_row ->> 'id')::uuid, lower(tg_op), changed,
      case when dates = '{}'::jsonb then null else dates end, who);
  exception when others then
    raise warning 'log_item_change on % failed: %', t, sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.log_item_change() from public, anon, authenticated;

create or replace trigger zz_log_item_change after insert or update or delete on public.notes
  for each row execute function public.log_item_change();
create or replace trigger zz_log_item_change after insert or update or delete on public.todos
  for each row execute function public.log_item_change();
create or replace trigger zz_log_item_change after insert or update or delete on public.habits
  for each row execute function public.log_item_change();
create or replace trigger zz_log_item_change after insert or update or delete on public.synced_calendar_events
  for each row execute function public.log_item_change();
create or replace trigger zz_log_item_change after insert or update or delete on public.weekly_reviews
  for each row execute function public.log_item_change();

-- 2. Where each fact comes from ----------------------------------------------

create table if not exists public.life_fact_sources (
  id bigserial primary key,
  fact_id uuid not null references public.life_facts(id) on delete cascade,
  user_id uuid not null,
  source_table text not null,
  source_id uuid not null,
  role text not null default 'said_in' check (role in ('said_in', 'about')),
  quote text,
  seen_at timestamptz not null default now(),
  run_id text,
  created_at timestamptz not null default now(),
  unique (fact_id, source_table, source_id)
);
create index if not exists life_fact_sources_source_idx
  on public.life_fact_sources (user_id, source_table, source_id);
alter table public.life_fact_sources enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'life_fact_sources'
                 and policyname = 'life_fact_sources_select_own') then
    create policy life_fact_sources_select_own on public.life_fact_sources
      for select using (user_id = auth.uid());
  end if;
end $p$;
revoke all on public.life_fact_sources from anon;
revoke insert, update, delete on public.life_fact_sources from authenticated;
comment on column public.life_fact_sources.role is
  'about: the fact is about this item itself, so the item''s dates and status are the truth. said_in: the words were said in this record.';

insert into public.life_fact_sources (fact_id, user_id, source_table, source_id, role, quote, seen_at, run_id)
select f.id, f.user_id, f.source_table, f.source_id, 'said_in', f.source_quote,
  coalesce(f.observed_at, f.created_at), f.run_id
from public.life_facts f
where f.source_table is not null and f.source_id is not null
on conflict (fact_id, source_table, source_id) do nothing;

-- 5. The cancelled stamp (before the view, which reads it) -------------------

alter table public.synced_calendar_events add column if not exists cancelled_at timestamptz;
alter table public.synced_calendar_events add column if not exists cancelled_run text;
comment on column public.synced_calendar_events.cancelled_at is
  'Set when the reader judged this entry cancelled; cleared when it judged it on again.';

-- 3. Facts with their item's current dates -----------------------------------

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
  f.about_date_end as stated_date_end
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
comment on view public.life_facts_now is
  'life_facts with the current dates and status of the item each fact is about (life_fact_sources, role about). stated_date keeps what the fact itself says.';
revoke all on public.life_facts_now from anon;

-- 4. Recall reads the item's own dates ---------------------------------------

create or replace function public.recall_life(p_user uuid, p_query text, p_limit integer default 12)
returns table (source text, id uuid, title text, body text, about_date date, state text, private boolean, rank real)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    -- Any of the words, so a message like "how did the honeymoon go" finds the trip.
    select to_tsquery('english', string_agg(lexeme, ' | ')) as tq
    from unnest(tsvector_to_array(to_tsvector('english', coalesce(p_query, '')))) as lexeme
  ),
  hits as (
    select 'fact'::text as source, f.id, f.subject as title, f.statement as body, f.about_date, f.state, f.private,
      ts_rank(to_tsvector('english', coalesce(f.statement, '') || ' ' || coalesce(f.subject, '')), q.tq) as rank
    from life_facts_now f, q
    where f.user_id = p_user and q.tq is not null
      and f.state not in ('corrected', 'superseded')
      and to_tsvector('english', coalesce(f.statement, '') || ' ' || coalesce(f.subject, '')) @@ q.tq
    union all
    select 'story', s.id, s.title, s.body, s.period_start, s.kind, s.private,
      ts_rank(to_tsvector('english', coalesce(s.title, '') || ' ' || coalesce(s.body, '')), q.tq) * 1.5
    from story_items s, q
    where s.user_id = p_user and s.state = 'current' and q.tq is not null
      and to_tsvector('english', coalesce(s.title, '') || ' ' || coalesce(s.body, '')) @@ q.tq
    union all
    select 'chapter', c.id, c.title, coalesce(c.summary, c.card_subtitle, ''), c.start_date, c.phase, false,
      ts_rank(to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.summary, '')), q.tq) * 1.2
    from chapters c, q
    where c.owner_id = p_user and q.tq is not null
      and to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.summary, '')) @@ q.tq
  )
  select * from hits order by rank desc, about_date desc nulls last limit greatest(1, least(p_limit, 40));
$$;
revoke execute on function public.recall_life(uuid, text, integer) from anon, authenticated, public;
grant execute on function public.recall_life(uuid, text, integer) to service_role;

-- The same recall with each fact's end date, so a plan still under way is not
-- taken for one whose date has passed (workers/shared/factTiming.js).
create or replace function public.recall_life_now(p_user uuid, p_query text, p_limit integer default 12)
returns table (source text, id uuid, title text, body text, about_date date, about_date_end date,
  state text, private boolean, rank real)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select to_tsquery('english', string_agg(lexeme, ' | ')) as tq
    from unnest(tsvector_to_array(to_tsvector('english', coalesce(p_query, '')))) as lexeme
  ),
  hits as (
    select 'fact'::text as source, f.id, f.subject as title, f.statement as body, f.about_date,
      f.about_date_end, f.state, f.private,
      ts_rank(to_tsvector('english', coalesce(f.statement, '') || ' ' || coalesce(f.subject, '')), q.tq) as rank
    from life_facts_now f, q
    where f.user_id = p_user and q.tq is not null
      and f.state not in ('corrected', 'superseded')
      and to_tsvector('english', coalesce(f.statement, '') || ' ' || coalesce(f.subject, '')) @@ q.tq
    union all
    select 'story', s.id, s.title, s.body, s.period_start, s.period_end, s.kind, s.private,
      ts_rank(to_tsvector('english', coalesce(s.title, '') || ' ' || coalesce(s.body, '')), q.tq) * 1.5
    from story_items s, q
    where s.user_id = p_user and s.state = 'current' and q.tq is not null
      and to_tsvector('english', coalesce(s.title, '') || ' ' || coalesce(s.body, '')) @@ q.tq
    union all
    select 'chapter', c.id, c.title, coalesce(c.summary, c.card_subtitle, ''), c.start_date, c.end_date,
      c.phase, false,
      ts_rank(to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.summary, '')), q.tq) * 1.2
    from chapters c, q
    where c.owner_id = p_user and q.tq is not null
      and to_tsvector('english', coalesce(c.title, '') || ' ' || coalesce(c.summary, '')) @@ q.tq
  )
  select * from hits order by rank desc, about_date desc nulls last limit greatest(1, least(p_limit, 40));
$$;
revoke execute on function public.recall_life_now(uuid, text, integer) from anon, authenticated, public;
grant execute on function public.recall_life_now(uuid, text, integer) to service_role;
do $g$
begin
  if exists (select 1 from pg_roles where rolname = 'shadow_reader') then
    grant execute on function public.recall_life_now(uuid, text, integer) to shadow_reader;
  end if;
end $g$;

-- 6. A break habit not held --------------------------------------------------

create table if not exists public.habit_not_held (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (owner_id, habit_id, day)
);
alter table public.habit_not_held enable row level security;
do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'habit_not_held'
                 and policyname = 'habit_not_held_own') then
    create policy habit_not_held_own on public.habit_not_held
      for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
end $p$;
revoke all on public.habit_not_held from anon;
grant select, insert, update, delete on public.habit_not_held to authenticated;
comment on table public.habit_not_held is
  'A day a break habit was marked not held in the wrap up. Kept apart from habit_progress, which every reader counts as done.';

-- 7. The reader wakes on the change log --------------------------------------

create or replace function public.ledger_users_due(active_days integer default 30, min_gap_hours integer default 6)
returns table (user_id uuid, timezone text, read_through timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.timezone, c.read_through
  from public.get_active_people(active_days) a
  left join ledger_cursor c on c.user_id = a.user_id
  where c.read_through is null
     or (
       (c.read_through < now() - make_interval(hours => min_gap_hours)
        or extract(hour from now() at time zone a.timezone) = 3)
       and c.read_through < now() - interval '30 minutes'
       and (
         exists (select 1 from todos t where t.owner_id = a.user_id and (t.created_at > c.read_through or t.completed_at > c.read_through))
         or exists (select 1 from notes n where n.owner_id = a.user_id and n.external_source is null and n.created_at > c.read_through)
         or exists (select 1 from scope_chat_messages m where m.user_id = a.user_id and m.role = 'user' and m.created_at > c.read_through)
         or exists (select 1 from habits h where h.owner_id = a.user_id and h.created_at > c.read_through)
         or exists (select 1 from space_milestones s where s.owner_id = a.user_id and s.created_at > c.read_through)
         or exists (select 1 from synced_calendar_events e where e.owner_id = a.user_id and e.archived = false and e.created_at > c.read_through)
         or exists (select 1 from user_profile_overrides o where o.user_id = a.user_id and o.created_at > c.read_through)
         or exists (select 1 from gremly_questions q where q.user_id = a.user_id and q.status = 'answered' and q.answered_at > c.read_through)
         or exists (select 1 from item_changes ic where ic.owner_id = a.user_id and ic.by in ('person', 'calendar') and ic.at > c.read_through)
       )
     );
$$;

notify pgrst, 'reload schema';

commit;
