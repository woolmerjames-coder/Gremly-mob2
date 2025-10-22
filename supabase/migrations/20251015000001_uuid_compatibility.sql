-- ============================================
-- UUID Function Compatibility
-- Creates uuid_generate_v4 as alias for gen_random_uuid if needed
-- ============================================

do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'uuid_generate_v4'
  ) then
    create or replace function public.uuid_generate_v4()
    returns uuid as $func$
      select gen_random_uuid();
    $func$ language sql;
    raise notice 'Created uuid_generate_v4 as alias for gen_random_uuid';
  end if;
end $$;
