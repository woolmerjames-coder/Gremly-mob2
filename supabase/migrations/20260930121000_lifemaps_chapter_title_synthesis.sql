-- Lifemaps and context fixes, part 11: the weekly synthesis may refresh a
-- chapter title that no longer describes the chapter (never one the person set).

alter table public.chapters drop constraint if exists chapters_title_source_check;
alter table public.chapters add constraint chapters_title_source_check
  check (title_source is null or title_source in ('classifier', 'dco', 'user', 'synthesis'));
