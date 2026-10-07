-- Data fabric stage 2, part 1: kinds, a health flag and prompt versions.
--
-- 1. life_facts.health: whether a fact concerns anyone's body or mind, their
--    health or their care. The reader judges it for each new fact and the
--    kind pass (workers/inngest-jobs/context/kinds.js) for every older one. It
--    decides how Gremly writes about a fact, never whether it is kept.
-- 2. life_facts.prompt_version and gremly_questions.prompt_version: the
--    reader's prompt version on the rows it writes.
-- 3. life_facts_now carries both new columns, at its end.
--
-- life_facts.kind is held to the seven kinds by
-- 20261008093000_fact_kinds_check.sql, which runs only once the new reader is
-- deployed and the kind pass has given every fact one.
--
-- All additive. Run it as one piece.

begin;
set local lock_timeout = '10s';

alter table public.life_facts add column if not exists health boolean;
alter table public.life_facts add column if not exists prompt_version text;
alter table public.gremly_questions add column if not exists prompt_version text;

comment on column public.life_facts.health is
  'Whether the fact concerns anyone''s body or mind, their health or their care. Judged by the reader, or by the kind pass for older facts. Null until judged.';
comment on column public.life_facts.kind is
  'What sort of statement the fact is: event, routine, goal, preference, relationship, situation or self (workers/shared/factKinds.js).';
comment on column public.life_facts.prompt_version is 'The prompt version of the reader that wrote the fact.';
comment on column public.gremly_questions.prompt_version is 'The prompt version of the job that wrote the question.';

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
  f.prompt_version
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

notify pgrst, 'reload schema';

commit;
