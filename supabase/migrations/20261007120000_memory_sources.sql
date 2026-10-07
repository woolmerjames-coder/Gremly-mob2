-- Every memory says where it came from.
--
-- When a person asks Gremly how it knows something, the answer has to be the
-- true one: where it came from, the day, and their own words. The ledger
-- already keeps that for every fact (life_facts: said_by, source_table,
-- source_id, source_quote, observed_at). These two functions hand it to the
-- workers, which put it into words (workers/shared/factSource.js).
--
-- fact_sources: for the facts asked for, how Gremly knows each one. It adds
-- the kind of record (a journal or a note, which kind of chat, which kind of
-- correction) and, for an answer to one of Gremly's questions, the question.
-- Today's thread reads it for the question of Gremly's that is in play.
--
-- recall_life: the same search as before, each fact now with its source
-- beside it. Story items and Chapters are Gremly's own writing, so they carry
-- none. The columns a function returns cannot be changed in place, so it is
-- dropped and made again, with its grants.

create or replace function public.fact_sources(p_user uuid, p_fact_ids uuid[])
returns table (
  id uuid,
  statement text,
  about_date date,
  state text,
  private boolean,
  said_by text,
  source_table text,
  source_kind text,
  source_question text,
  source_quote text,
  observed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.statement, f.about_date, f.state, f.private, f.said_by, f.source_table,
    case f.source_table
      when 'notes' then
        (select n.subtype from notes n where n.id = f.source_id and n.owner_id = p_user)
      when 'scope_chat_messages' then
        (select c.chat_type
           from scope_chat_messages m join scope_chats c on c.id = m.chat_id
          where m.id = f.source_id and m.user_id = p_user)
      when 'user_corrections' then
        (select uc.surface from user_corrections uc where uc.id = f.source_id and uc.user_id = p_user)
    end as source_kind,
    case f.source_table
      -- an answer arrives as a correction about the question it answers
      when 'user_corrections' then
        (select q.question
           from user_corrections uc
           join gremly_questions q on q.user_id = p_user and q.id::text = uc.target_ref->>'id'
          where uc.id = f.source_id and uc.user_id = p_user and uc.surface = 'question')
      when 'gremly_questions' then
        (select q.question from gremly_questions q where q.id = f.source_id and q.user_id = p_user)
    end as source_question,
    f.source_quote, f.observed_at
  from life_facts f
  where f.user_id = p_user and f.id = any(p_fact_ids);
$$;
revoke execute on function public.fact_sources(uuid, uuid[]) from anon, authenticated, public;
grant execute on function public.fact_sources(uuid, uuid[]) to service_role;

drop function if exists public.recall_life(uuid, text, integer);
create function public.recall_life(p_user uuid, p_query text, p_limit integer default 12)
returns table (
  source text,
  id uuid,
  title text,
  body text,
  about_date date,
  state text,
  private boolean,
  rank real,
  said_by text,
  source_table text,
  source_kind text,
  source_question text,
  source_quote text,
  observed_at timestamptz
)
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
    from life_facts f, q
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
  ),
  top as (
    select h.* from hits h
    order by h.rank desc, h.about_date desc nulls last
    limit greatest(1, least(p_limit, 40))
  )
  select t.source, t.id, t.title, t.body, t.about_date, t.state, t.private, t.rank::real,
    s.said_by, s.source_table, s.source_kind, s.source_question, s.source_quote, s.observed_at
  from top t
  left join public.fact_sources(
    p_user, array(select x.id from top x where x.source = 'fact')
  ) s on t.source = 'fact' and s.id = t.id
  order by t.rank desc, t.about_date desc nulls last;
$$;
revoke execute on function public.recall_life(uuid, text, integer) from anon, authenticated, public;
grant execute on function public.recall_life(uuid, text, integer) to service_role;

-- The shadow runner's read only role, where it has been set up
-- (scripts/sql/shadow_reader_role.sql), reads both.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'shadow_reader') then
    grant execute on function public.recall_life(uuid, text, integer) to shadow_reader;
    grant execute on function public.fact_sources(uuid, uuid[]) to shadow_reader;
  end if;
end
$$;
