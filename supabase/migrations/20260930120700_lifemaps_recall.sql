-- Lifemaps and context fixes, part 8: recall for chat.
-- Chat looks up what Gremly knows that bears on the person's message: facts
-- from the ledger, story items and chapters, best matches first, with dates.

create index if not exists life_facts_search_idx on public.life_facts
  using gin (to_tsvector('english', coalesce(statement, '') || ' ' || coalesce(subject, '')));
create index if not exists story_items_search_idx on public.story_items
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')));

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
  )
  select * from hits order by rank desc, about_date desc nulls last limit greatest(1, least(p_limit, 40));
$$;
revoke execute on function public.recall_life(uuid, text, integer) from anon, authenticated, public;
grant execute on function public.recall_life(uuid, text, integer) to service_role;
