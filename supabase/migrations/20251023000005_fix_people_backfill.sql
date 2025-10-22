-- Idempotent patch: ensure display_name exists; backfill from name only if name exists
alter table if exists public.people
  add column if not exists display_name text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='people' and column_name='name'
  ) then
    execute $q$
      update public.people
      set display_name = coalesce(display_name, name)
      where display_name is null
    $q$;
  end if;
end $$;
