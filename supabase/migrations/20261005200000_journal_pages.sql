-- Journal pages of the person's own: a name and a short set of questions,
-- shown with the built in pages on the journal page.
--
-- Additive only: one new, empty table. Nothing that exists is read or changed.
-- A journal entry keeps its own copy of the questions it was written on
-- (notes.views.journal_page), so deleting a page here never touches an entry.
create table if not exists public.journal_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- the questions, in order, as a list of strings
  prompts jsonb not null
    check (
      case
        when jsonb_typeof(prompts) = 'array' then jsonb_array_length(prompts) between 1 and 12
        else false
      end
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists journal_pages_user_idx on public.journal_pages (user_id, created_at);

-- updated_at follows every change (public.set_updated_at is already in the database)
drop trigger if exists trg_journal_pages_updated_at on public.journal_pages;
create trigger trg_journal_pages_updated_at
  before update on public.journal_pages
  for each row execute function public.set_updated_at();

alter table public.journal_pages enable row level security;
drop policy if exists journal_pages_select_own on public.journal_pages;
create policy journal_pages_select_own on public.journal_pages
  for select using (auth.uid() = user_id);
drop policy if exists journal_pages_insert_own on public.journal_pages;
create policy journal_pages_insert_own on public.journal_pages
  for insert with check (auth.uid() = user_id);
drop policy if exists journal_pages_update_own on public.journal_pages;
create policy journal_pages_update_own on public.journal_pages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists journal_pages_delete_own on public.journal_pages;
create policy journal_pages_delete_own on public.journal_pages
  for delete using (auth.uid() = user_id);

comment on table public.journal_pages is
  'Journal: pages a person made for themselves (a name and their questions). Read and written by the app as that person; entries keep their own copy of the questions.';
