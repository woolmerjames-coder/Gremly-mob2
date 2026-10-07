-- Data fabric stage 4b: one writer for the words, the memory and first Worlds.
--
-- The words under a World and a Chapter (card_subtitle) are written by the
-- words writer, a closed Chapter's memory (epigraph) by the memory writer,
-- and a new person's first Worlds wear the Gremly first Worlds chose for them
-- (mascot_slug). Each field records who wrote it in its _source column, and
-- the checks on those columns list who may. Three are added to them:
--
--   words         card_subtitle, on worlds and chapters
--   memory        epigraph, on chapters
--   first_worlds  mascot_slug, on worlds
--
-- When the person wrote the words or the memory themselves, theirs stay, and
-- Gremly's version goes into a new field beside it, for the screen to offer
-- underneath:
--
--   worlds.card_subtitle_offered,   card_subtitle_offered_at
--   chapters.card_subtitle_offered, card_subtitle_offered_at
--   chapters.epigraph_offered,      epigraph_offered_at
--
-- Each check is replaced by a wider one in the same transaction. Every value
-- the old checks allowed is still allowed, so no row can fail. Adds columns;
-- changes no data, drops no table or column.

begin;
set local lock_timeout = '10s';

alter table public.worlds drop constraint if exists worlds_card_subtitle_source_check;
alter table public.worlds add constraint worlds_card_subtitle_source_check
  check (card_subtitle_source is null
         or card_subtitle_source in ('classifier', 'dco', 'user', 'synthesis', 'words'));

alter table public.chapters drop constraint if exists chapters_card_subtitle_source_check;
alter table public.chapters add constraint chapters_card_subtitle_source_check
  check (card_subtitle_source is null
         or card_subtitle_source in ('classifier', 'dco', 'user', 'synthesis', 'words'));

alter table public.chapters drop constraint if exists chapters_epigraph_source_check;
alter table public.chapters add constraint chapters_epigraph_source_check
  check (epigraph_source is null
         or epigraph_source in ('classifier', 'dco', 'user', 'synthesis', 'memory'));

alter table public.worlds drop constraint if exists worlds_mascot_slug_source_check;
alter table public.worlds add constraint worlds_mascot_slug_source_check
  check (mascot_slug_source in ('classifier', 'user', 'first_worlds'));

alter table public.worlds
  add column if not exists card_subtitle_offered text,
  add column if not exists card_subtitle_offered_at timestamptz;

alter table public.chapters
  add column if not exists card_subtitle_offered text,
  add column if not exists card_subtitle_offered_at timestamptz,
  add column if not exists epigraph_offered text,
  add column if not exists epigraph_offered_at timestamptz;

comment on column public.worlds.card_subtitle_offered is
  'Gremly''s words for this World when the person wrote their own (card_subtitle_source user), for the screen to offer underneath. Written by the words writer (data fabric stage 4b).';
comment on column public.chapters.card_subtitle_offered is
  'Gremly''s words for this Chapter when the person wrote their own, for the screen to offer underneath. Written by the words writer (data fabric stage 4b).';
comment on column public.chapters.epigraph_offered is
  'Gremly''s memory of this Chapter when the person wrote their own, for the screen to offer underneath. Written by the memory writer (data fabric stage 4b).';

commit;
