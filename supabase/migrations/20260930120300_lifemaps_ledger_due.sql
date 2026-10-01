-- Lifemaps and context fixes, part 4: read the ledger only when there are new
-- records, at most every few hours, and always in the hour before the 4am DCO.
-- App opens alone no longer count, which keeps Inngest step use low.

drop function if exists public.ledger_users_due(integer);

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
       )
     );
$$;
revoke execute on function public.ledger_users_due(integer, integer) from anon, authenticated, public;
grant execute on function public.ledger_users_due(integer, integer) to service_role;
