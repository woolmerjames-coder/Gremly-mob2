-- Worlds rebuild, stage 1: a Gremly for each Chapter, and a new Chapter made
-- by hand needs none of the old kinds.
--
-- A Chapter wears its own Gremly where one is chosen, and its World's
-- otherwise. Who chose it is kept beside it, as on Worlds: the person (user),
-- or Gremly (gremly) when he suggested or guessed the Chapter.
--
-- chapter_type is one of the old layouts' kinds, which the new design does not
-- use. It is required, so it gets a default and a Chapter made by hand never
-- has to name one.
--
-- Adds columns, a check and a default. Changes no data, drops nothing.
-- James applied this on 8 Oct 2026.

begin;
set local lock_timeout = '10s';

alter table public.chapters
  add column if not exists mascot_slug text,
  add column if not exists mascot_slug_source text,
  add column if not exists mascot_slug_updated_at timestamptz;

alter table public.chapters drop constraint if exists chapters_mascot_slug_source_check;
alter table public.chapters add constraint chapters_mascot_slug_source_check
  check (mascot_slug_source is null or mascot_slug_source in ('user', 'gremly'));

alter table public.chapters alter column chapter_type set default 'bounded';

comment on column public.chapters.mascot_slug is
  'The Gremly this Chapter wears. Empty means it wears its World''s (Worlds rebuild, stage 1).';
comment on column public.chapters.mascot_slug_source is
  'Who chose it: user, or gremly when Gremly suggested or guessed the Chapter.';

commit;
