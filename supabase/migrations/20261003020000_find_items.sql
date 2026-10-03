-- The agent's find_items tool (workers/cortex/agent/tools/findItems.js):
-- search one person's todos, habits and notes by their words and filters.
-- Words are matched the way recall_life matches memory: English stems, any
-- word, prefixes allowed, the name or title counting most. Which item the
-- person means stays the model's judgement over what comes back; this only
-- finds candidates. Called with the service key only.

create or replace function public.find_items(
  p_user uuid,
  p_query text default null,
  p_types text[] default null,
  p_from date default null,
  p_to date default null,
  p_state text default 'open',
  p_limit integer default 12
)
returns table (
  type text,
  id uuid,
  title text,
  day date,
  "time" text,
  state text,
  detail text,
  snippet text,
  updated_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select case
      when coalesce(trim(p_query), '') = '' then null
      else (
        select to_tsquery('english', string_agg(lexeme || ':*', ' | '))
        from unnest(tsvector_to_array(to_tsvector('english', p_query))) as lexeme
      )
    end as tq
  ),
  items as (
    select 'todo'::text as type, t.id,
      coalesce(nullif(t.name, ''), t.title, '') as title,
      t.due_day as day, t.due_time::text as "time",
      case when coalesce(t.archived, false) then 'archived'
           when t.completed_at is not null then 'done' else 'open' end as state,
      null::text as detail,
      left(regexp_replace(coalesce(nullif(t.body, ''), t.notes, ''), '\s+', ' ', 'g'), 160) as snippet,
      t.updated_at,
      setweight(to_tsvector('english', coalesce(nullif(t.name, ''), t.title, '')), 'A')
        || setweight(to_tsvector('english', coalesce(t.body, '') || ' ' || coalesce(t.notes, '')), 'C') as doc
    from todos t
    where t.owner_id = p_user
    union all
    select 'habit', h.id,
      coalesce(nullif(h.name, ''), h.title, ''),
      null::date, null::text,
      case when coalesce(h.archived, false) then 'archived' else 'open' end,
      h.frequency,
      left(regexp_replace(coalesce(h.notes, ''), '\s+', ' ', 'g'), 160),
      h.updated_at,
      setweight(to_tsvector('english', coalesce(nullif(h.name, ''), h.title, '')), 'A')
        || setweight(to_tsvector('english', coalesce(h.notes, '')), 'C')
    from habits h
    where h.owner_id = p_user
    union all
    select 'note', n.id,
      coalesce(n.title, ''),
      n.target_date, n.event_time::text,
      case when coalesce(n.archived, false) then 'archived' else 'open' end,
      case when n.external_source is not null then 'calendar' else n.subtype end,
      left(regexp_replace(coalesce(n.body, ''), '\s+', ' ', 'g'), 160),
      n.updated_at,
      setweight(to_tsvector('english', coalesce(n.title, '')), 'A')
        || setweight(to_tsvector('english', coalesce(n.body, '')), 'B')
    from notes n
    where n.owner_id = p_user
  )
  select i.type, i.id, i.title, i.day, i."time", i.state, i.detail, i.snippet, i.updated_at,
    case when q.tq is null then 0 else ts_rank_cd(i.doc, q.tq) end::real as rank
  from items i, q
  where (p_types is null or i.type = any (p_types))
    and (coalesce(p_state, 'open') = 'any' or i.state = coalesce(p_state, 'open'))
    and (p_from is null or (i.day is not null and i.day >= p_from))
    and (p_to is null or (i.day is not null and i.day <= p_to))
    and (q.tq is null or i.doc @@ q.tq)
  order by
    case when q.tq is null then 0 else ts_rank_cd(i.doc, q.tq) end desc,
    case when p_from is not null or p_to is not null then i.day end asc nulls last,
    i.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 30));
$$;

revoke execute on function public.find_items(uuid, text, text[], date, date, text, integer) from anon, authenticated, public;
grant execute on function public.find_items(uuid, text, text[], date, date, text, integer) to service_role;
