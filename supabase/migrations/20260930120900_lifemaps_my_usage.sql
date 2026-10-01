-- Lifemaps and context fixes, part 10: the person's own usage stats for the app.
-- usage_rollup takes a user id and is service-only; the story screen reads the
-- signed-in person's own counts through this wrapper, which uses auth.uid().

create or replace function public.my_usage_rollup(p_grain text, p_periods integer default 1)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or p_grain not in ('week', 'month', 'year') then null
    else public.usage_rollup(auth.uid(), p_grain, least(greatest(coalesce(p_periods, 1), 1), 13))
  end;
$$;

revoke execute on function public.my_usage_rollup(text, integer) from anon, public;
grant execute on function public.my_usage_rollup(text, integer) to authenticated;
