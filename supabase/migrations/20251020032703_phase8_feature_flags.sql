-- Phase 8: Feature Flags
-- Purpose: Add buddy/relationships feature flag if feature_flags table exists

-- Safely insert feature_buddy flag only if feature_flags table exists
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'feature_flags'
  ) then
    insert into public.feature_flags (key, value, created_at)
    values ('feature_buddy', 'true', now())
    on conflict (key) do update set value = excluded.value;
  else
    raise notice 'feature_flags table not found; skipping feature_buddy insert';
  end if;
end;
$$;
