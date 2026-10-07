-- Data fabric stage 2, part 2: one view of dated things.
--
-- dated_ahead: the dated facts from someone's ledger that are still ahead or
-- under way, from a day on, each with the item it is about when it is about
-- one, and each item once. A fact about an item that is done, archived,
-- cancelled or gone is not ahead. Chat reads it in place of the anchors list
-- (workers/cortex/context/datedAhead.js), and the daily picture already lists
-- a dated thing once by its item.
--
-- The anchors list (user_temporal_anchors) is no longer written: chat stops
-- saving to it and the hourly expiry and the review after each ledger read go.
-- The table is kept. The Sunday Worlds classifier still reads its old rows
-- until it is switched off in stage 4b.
--
-- Additive. Run it as one piece.

begin;
set local lock_timeout = '10s';

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
      f.id, f.statement, f.about_date, f.about_date_end, f.state, f.private, f.health, f.kind,
      f.item_table, f.item_id
    from public.life_facts_now f
    where f.user_id = p_user
      and f.state in ('planned', 'current', 'unconfirmed')
      and f.about_date is not null
      and coalesce(f.about_date_end, f.about_date) >= p_from
      and f.about_date <= p_from + greatest(0, least(p_days, 366))
      and not f.item_done and not f.item_archived and not f.item_cancelled and not f.item_gone
    order by coalesce(f.item_table || ':' || f.item_id::text, f.id::text), f.last_confirmed_at desc nulls last
  ) x
  order by x.about_date, x.statement
  limit greatest(1, least(p_limit, 100));
$$;
comment on function public.dated_ahead(uuid, date, integer, integer) is
  'The dated facts still ahead or under way from p_from, each item once (data fabric stage 2).';
revoke execute on function public.dated_ahead(uuid, date, integer, integer) from anon, authenticated, public;
grant execute on function public.dated_ahead(uuid, date, integer, integer) to service_role;
do $g$
begin
  if exists (select 1 from pg_roles where rolname = 'shadow_reader') then
    grant execute on function public.dated_ahead(uuid, date, integer, integer) to shadow_reader;
  end if;
end $g$;

notify pgrst, 'reload schema';

commit;
