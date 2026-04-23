-- Phase 4a.5 structured summaries
-- Already applied to production 2026-04-23 via MCP
-- Adds authored-content columns to worlds and chapters:
--   card_subtitle (daily-refreshable by DCO, weekly-rewritten by classifier)
--   summary (weekly-authored narrative)
--   key_priorities jsonb (5 ranked items, refreshable)
--   summary_source, summary_updated_at (track who last wrote summary+key_priorities)
--   card_subtitle_source, card_subtitle_updated_at (track card_subtitle separately)

alter table public.worlds
  add column if not exists card_subtitle text,
  add column if not exists summary text,
  add column if not exists key_priorities jsonb default '[]'::jsonb,
  add column if not exists summary_source text,
  add column if not exists summary_updated_at timestamptz,
  add column if not exists card_subtitle_source text,
  add column if not exists card_subtitle_updated_at timestamptz;

alter table public.worlds drop constraint if exists worlds_summary_source_check;
alter table public.worlds
  add constraint worlds_summary_source_check
  check (summary_source is null or summary_source in ('classifier','dco','user'));

alter table public.worlds drop constraint if exists worlds_card_subtitle_source_check;
alter table public.worlds
  add constraint worlds_card_subtitle_source_check
  check (card_subtitle_source is null or card_subtitle_source in ('classifier','dco','user'));

alter table public.chapters
  add column if not exists card_subtitle text,
  add column if not exists summary text,
  add column if not exists key_priorities jsonb default '[]'::jsonb,
  add column if not exists summary_source text,
  add column if not exists summary_updated_at timestamptz,
  add column if not exists card_subtitle_source text,
  add column if not exists card_subtitle_updated_at timestamptz;

alter table public.chapters drop constraint if exists chapters_summary_source_check;
alter table public.chapters
  add constraint chapters_summary_source_check
  check (summary_source is null or summary_source in ('classifier','dco','user'));

alter table public.chapters drop constraint if exists chapters_card_subtitle_source_check;
alter table public.chapters
  add constraint chapters_card_subtitle_source_check
  check (card_subtitle_source is null or card_subtitle_source in ('classifier','dco','user'));

comment on column public.worlds.card_subtitle is
  'Short (<=70 chars) dynamic line under world name on index card. Refreshed daily by DCO when activity warrants, fully rewritten weekly by classifier.';
comment on column public.worlds.summary is
  '2-3 sentence narrative for world hero card. Weekly authored, stable through the week. Hides on detail page when null.';
comment on column public.worlds.key_priorities is
  'Ordered jsonb array of 5 items. Rewritten weekly by classifier, may be re-ranked or extended daily by DCO.';
comment on column public.worlds.summary_source is
  'Which writer last touched summary and key_priorities. One of classifier, dco, user. Null until first authored.';
comment on column public.worlds.card_subtitle_source is
  'Which writer last touched card_subtitle. One of classifier, dco, user. Null until first authored.';
comment on column public.chapters.card_subtitle is
  'Short (<=70 chars) dynamic line for chapter cards and rows. Same semantics as worlds.card_subtitle.';
comment on column public.chapters.summary is
  '2-3 sentence state-of-play for chapter detail page hero. Hides when null.';
comment on column public.chapters.key_priorities is
  'Ordered jsonb array of 5 items. Same shape as worlds.key_priorities.';
