-- Lifemaps and context fixes, part 6: the person's story, and Chapters written
-- by the weekly synthesis under the same rules as Worlds.

-- Chapters: the weekly synthesis becomes a named writer of the words.
alter table public.chapters drop constraint if exists chapters_card_subtitle_source_check;
alter table public.chapters add constraint chapters_card_subtitle_source_check
  check (card_subtitle_source is null or card_subtitle_source = any (array['classifier', 'dco', 'user', 'synthesis']));
alter table public.chapters drop constraint if exists chapters_summary_source_check;
alter table public.chapters add constraint chapters_summary_source_check
  check (summary_source is null or summary_source = any (array['classifier', 'dco', 'user', 'synthesis']));
alter table public.chapters drop constraint if exists chapters_epigraph_source_check;
alter table public.chapters add constraint chapters_epigraph_source_check
  check (epigraph_source is null or epigraph_source = any (array['classifier', 'dco', 'user', 'synthesis']));

-- ─── The story ──────────────────────────────────────────────────────────────
-- Written monthly from the fact ledger: milestones, how things have shifted,
-- moments to be proud of, patterns (what they love, avoid, do often or rarely)
-- and the people who matter. Every item points at the facts it rests on.
-- Private items inform Gremly and conversations the person starts; they are
-- never put on cards, headlines or notifications.
create table if not exists public.story_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('milestone', 'shift', 'proud', 'pattern', 'person')),
  pattern_kind text check (pattern_kind is null or pattern_kind in ('loves', 'avoids', 'often', 'rarely', 'rhythm')),
  title text not null,
  body text not null,
  period_start date,
  period_end date,
  private boolean not null default false,
  fact_ids uuid[] not null default '{}',
  chapter_id uuid references public.chapters(id) on delete set null,
  state text not null default 'current' check (state in ('current', 'superseded', 'corrected')),
  correction_text text,
  run_id uuid,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists story_items_user_idx on public.story_items (user_id, state, kind);
alter table public.story_items enable row level security;
drop policy if exists story_items_select_own on public.story_items;
create policy story_items_select_own on public.story_items for select using (auth.uid() = user_id);
comment on table public.story_items is 'The person''s story, written monthly from the fact ledger: milestones, shifts, proud moments, patterns and people. Written by the workers only.';
