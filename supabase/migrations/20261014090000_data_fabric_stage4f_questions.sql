-- Data fabric stage 4f: Gremly's questions, weighed, and a tidy up the person
-- decides.
--
-- 1. gremly_questions.weight: how much the answer matters, as the model that
--    asked judged it. needs: until it is answered Gremly holds two versions
--    of something still ahead, or would soon say something wrong. helps: the
--    answer would let Gremly know them better. Null for questions written
--    before this, read as helps. Those that need an answer are asked first,
--    and one waiting puts Answer some Gremly questions on Ask Gremly
--    (workers/shared/questionRules.js).
--
-- 2. gremly_questions.kind gains 'tidy': Gremly proposes to set some facts
--    aside, or to mark plans whose days have passed as happened. Nothing
--    changes until the person answers: their yes does what was proposed to
--    the facts it names, their no leaves them (inngest-jobs context/review.js
--    and corrections.js). A tidy up is never asked in the brief or the wrap
--    up, only in Ask Gremly's questions.
--
-- 3. life_facts.state gains 'set_aside': a fact the person asked Gremly to
--    stop treating as part of their life. Nothing that talks to them reads
--    it; it stays in the ledger with its history (life_fact_changes).
--
-- 4. gremly_questions.topic and gremly_questions.why, written by the model
--    that asks (for now the ledger review; asked of the reader, they cost it
--    on its own replay, so its questions carry none): topic names what a
--    question is about in a few words, for the list of what is still to come
--    and the receipt once it is answered; why says in one short sentence
--    where Gremly's versions came from, shown under the question. Null for
--    questions written before this, and for those whose writer gives none:
--    the questions screen then shows the question alone.
--
-- 5. recall_life_now (chat's recall and the recall tool) leaves out a fact
--    they set aside, as it leaves out one put right or replaced. The same
--    function as data fabric stage 1 defined it, with set_aside added to the
--    states it leaves out.
--
-- Each check is replaced by a wider one in the same transaction, so every
-- value the old one allowed is still allowed and no row can fail it. Adds
-- columns; drops no table, column or row. Run it as one piece; it can be run
-- twice.

begin;
set local lock_timeout = '10s';

alter table public.gremly_questions add column if not exists weight text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'gremly_questions_weight_check') then
    alter table public.gremly_questions add constraint gremly_questions_weight_check
      check (weight is null or weight in ('needs', 'helps'));
  end if;
end $c$;
comment on column public.gremly_questions.weight is
  'How much the answer matters, as the model that asked judged it: needs (Gremly holds two versions of something still ahead, or would soon say something wrong) or helps. Null is read as helps (data fabric stage 4f).';

alter table public.gremly_questions add column if not exists topic text;
alter table public.gremly_questions add column if not exists why text;
comment on column public.gremly_questions.topic is
  'What the question is about, in a few words, as the model that asked wrote it: for the list of what is still to come and the receipt once answered (data fabric stage 4f).';
comment on column public.gremly_questions.why is
  'Where Gremly''s versions came from, in a few words, as the model that asked wrote it: shown under the question (data fabric stage 4f).';

alter table public.gremly_questions drop constraint if exists gremly_questions_kind_check;
alter table public.gremly_questions add constraint gremly_questions_kind_check
  check (kind in ('fact', 'start_chapter', 'close_chapter', 'while_away', 'person', 'tidy'));

alter table public.life_facts drop constraint if exists life_facts_state_check;
alter table public.life_facts add constraint life_facts_state_check
  check (state in ('current', 'planned', 'happened', 'changed', 'superseded', 'corrected', 'unconfirmed', 'set_aside'));

-- 5. recall_life_now, without what they set aside
create or replace function public.recall_life_now(p_user uuid, p_query text, p_limit integer default 12)
returns table (
  source text,
  id uuid,
  title text,
  body text,
  about_date date,
  about_date_end date,
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
    select to_tsquery('english', string_agg(lexeme, ' | ')) as tq
    from unnest(tsvector_to_array(to_tsvector('english', coalesce(p_query, '')))) as lexeme
  ),
  hits as (
    select 'fact'::text as source, f.id, f.subject as title, f.statement as body, f.about_date,
      f.about_date_end, f.state, f.private,
      ts_rank(to_tsvector('english', coalesce(f.statement, '') || ' ' || coalesce(f.subject, '')), q.tq) as rank
    from life_facts_now f, q
    where f.user_id = p_user and q.tq is not null
      and f.state not in ('corrected', 'superseded', 'set_aside')
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
  ),
  top as (
    select h.* from hits h
    order by h.rank desc, h.about_date desc nulls last
    limit greatest(1, least(p_limit, 40))
  )
  select t.source, t.id, t.title, t.body, t.about_date, t.about_date_end, t.state, t.private, t.rank::real,
    s.said_by, s.source_table, s.source_kind, s.source_question, s.source_quote, s.observed_at
  from top t
  left join public.fact_sources(
    p_user, array(select x.id from top x where x.source = 'fact')
  ) s on t.source = 'fact' and s.id = t.id
  order by t.rank desc, t.about_date desc nulls last;
$$;
revoke execute on function public.recall_life_now(uuid, text, integer) from anon, authenticated, public;
grant execute on function public.recall_life_now(uuid, text, integer) to service_role;
do $g$
begin
  if exists (select 1 from pg_roles where rolname = 'shadow_reader') then
    grant execute on function public.recall_life_now(uuid, text, integer) to shadow_reader;
  end if;
end $g$;

notify pgrst, 'reload schema';

commit;
