-- Ensure user_id columns exist
alter table if exists public.tags    add column if not exists user_id uuid;
alter table if exists public.tag_map add column if not exists user_id uuid;

-- Enable RLS
alter table if exists public.tags    enable row level security;
alter table if exists public.tag_map enable row level security;

-- Policies for tags
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can view their own tags') then
    execute $INNER$create policy "Users can view their own tags" on public.tags for select using (user_id = auth.uid())$INNER$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can insert their own tags') then
    execute $INNER$create policy "Users can insert their own tags" on public.tags for insert with check (user_id = auth.uid())$INNER$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can update their own tags') then
    execute $INNER$create policy "Users can update their own tags" on public.tags for update using (user_id = auth.uid()) with check (user_id = auth.uid())$INNER$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tags' and policyname='Users can delete their own tags') then
    execute $INNER$create policy "Users can delete their own tags" on public.tags for delete using (user_id = auth.uid())$INNER$;
  end if;
end $$;

-- Policies for tag_map
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can view their own tag mappings') then
    execute $INNER$create policy "Users can view their own tag mappings" on public.tag_map for select using (user_id = auth.uid())$INNER$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can insert their own tag mappings') then
    execute $INNER$create policy "Users can insert their own tag mappings" on public.tag_map for insert with check (user_id = auth.uid())$INNER$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can update their own tag mappings') then
    execute $INNER$create policy "Users can update their own tag mappings" on public.tag_map for update using (user_id = auth.uid()) with check (user_id = auth.uid())$INNER$;
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tag_map' and policyname='Users can delete their own tag mappings') then
    execute $INNER$create policy "Users can delete their own tag mappings" on public.tag_map for delete using (user_id = auth.uid())$INNER$;
  end if;
end $$;

-- Helpful indexes (idempotent)
do $$
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relname='idx_tags_user_id' and n.nspname='public') then
    execute 'create index idx_tags_user_id on public.tags(user_id)';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relname='idx_tag_map_user_id' and n.nspname='public') then
    execute 'create index idx_tag_map_user_id on public.tag_map(user_id)';
  end if;
end $$;
