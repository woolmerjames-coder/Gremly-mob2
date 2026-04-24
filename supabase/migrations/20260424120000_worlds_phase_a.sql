-- Phase A schema additions
-- Adds world_type, arc_shape, epigraph, slip tracking, key_moments, has_blockers_count
-- to worlds and chapters, plus priority_kind on todos, and a new user_rewrite_log table.

BEGIN;

-- ─── worlds: world_type ──────────────────────────────────────────────────────

alter table public.worlds
  add column if not exists world_type text,
  add column if not exists world_type_source text,
  add column if not exists world_type_updated_at timestamptz;

alter table public.worlds drop constraint if exists worlds_world_type_check;
alter table public.worlds
  add constraint worlds_world_type_check
  check (world_type is null or world_type in ('project', 'practice', 'relationship', 'domestic'));

alter table public.worlds drop constraint if exists worlds_world_type_source_check;
alter table public.worlds
  add constraint worlds_world_type_source_check
  check (world_type_source is null or world_type_source in ('classifier', 'dco', 'user'));

comment on column public.worlds.world_type is
  'Structural classification of this world. One of project, practice, relationship, domestic. Null until first classifier run.';
comment on column public.worlds.world_type_source is
  'Which writer last set world_type. One of classifier, dco, user. Null until first authored.';
comment on column public.worlds.world_type_updated_at is
  'Timestamp of last world_type write.';

-- ─── chapters: title_source / title_updated_at ───────────────────────────────

alter table public.chapters
  add column if not exists title_source text,
  add column if not exists title_updated_at timestamptz;

alter table public.chapters drop constraint if exists chapters_title_source_check;
alter table public.chapters
  add constraint chapters_title_source_check
  check (title_source is null or title_source in ('classifier', 'dco', 'user'));

comment on column public.chapters.title_source is
  'Which writer last set title. One of classifier, dco, user. Null until first authored.';
comment on column public.chapters.title_updated_at is
  'Timestamp of last title write.';

-- ─── chapters: arc_shape ─────────────────────────────────────────────────────

alter table public.chapters
  add column if not exists arc_shape text,
  add column if not exists arc_shape_source text,
  add column if not exists arc_shape_updated_at timestamptz;

alter table public.chapters drop constraint if exists chapters_arc_shape_check;
alter table public.chapters
  add constraint chapters_arc_shape_check
  check (arc_shape is null or arc_shape in ('outcome', 'experience', 'process', 'commitment'));

alter table public.chapters drop constraint if exists chapters_arc_shape_source_check;
alter table public.chapters
  add constraint chapters_arc_shape_source_check
  check (arc_shape_source is null or arc_shape_source in ('classifier', 'dco', 'user'));

comment on column public.chapters.arc_shape is
  'Structural arc type. One of outcome, experience, process, commitment. Drives slip tracking eligibility and key_moments collection.';
comment on column public.chapters.arc_shape_source is
  'Which writer last set arc_shape. One of classifier, dco, user.';
comment on column public.chapters.arc_shape_updated_at is
  'Timestamp of last arc_shape write.';

-- ─── chapters: epigraph ──────────────────────────────────────────────────────

alter table public.chapters
  add column if not exists epigraph text,
  add column if not exists epigraph_source text,
  add column if not exists epigraph_updated_at timestamptz,
  add column if not exists epigraph_accepted_at timestamptz;

alter table public.chapters drop constraint if exists chapters_epigraph_source_check;
alter table public.chapters
  add constraint chapters_epigraph_source_check
  check (epigraph_source is null or epigraph_source in ('classifier', 'dco', 'user'));

comment on column public.chapters.epigraph is
  'Short opening line shown at top of the chapter detail page. Classifier-drafted; user may accept, edit, or discard.';
comment on column public.chapters.epigraph_source is
  'Which writer last set epigraph. One of classifier, dco, user.';
comment on column public.chapters.epigraph_updated_at is
  'Timestamp of last epigraph write.';
comment on column public.chapters.epigraph_accepted_at is
  'Timestamp when the user accepted or edited the epigraph. Null means not yet reviewed.';

-- ─── chapters: slip tracking ─────────────────────────────────────────────────

alter table public.chapters
  add column if not exists slip_tracking_enabled boolean not null default false,
  add column if not exists slip_events jsonb default '[]'::jsonb,
  add column if not exists slip_events_source text,
  add column if not exists slip_events_updated_at timestamptz;

alter table public.chapters drop constraint if exists chapters_slip_events_source_check;
alter table public.chapters
  add constraint chapters_slip_events_source_check
  check (slip_events_source is null or slip_events_source in ('classifier', 'dco', 'user'));

comment on column public.chapters.slip_tracking_enabled is
  'True when the user has opted into slip tracking for this chapter. Only meaningful for commitment arc_shape.';
comment on column public.chapters.slip_events is
  'Array of {date, reason, drop_id, confidence, user_reviewed} entries. Only populated for commitment chapters where slip_tracking_enabled=true.';
comment on column public.chapters.slip_events_source is
  'Which writer last updated slip_events. One of classifier, dco, user.';
comment on column public.chapters.slip_events_updated_at is
  'Timestamp of last slip_events write.';

-- ─── chapters: key_moments ───────────────────────────────────────────────────

alter table public.chapters
  add column if not exists key_moments jsonb default '[]'::jsonb,
  add column if not exists key_moments_source text,
  add column if not exists key_moments_updated_at timestamptz;

alter table public.chapters drop constraint if exists chapters_key_moments_source_check;
alter table public.chapters
  add constraint chapters_key_moments_source_check
  check (key_moments_source is null or key_moments_source in ('classifier', 'dco', 'user'));

comment on column public.chapters.key_moments is
  'Array of {drop_id, drop_type, date, why_selected} entries. Classifier-drafted at chapter close; user can accept/edit/discard.';
comment on column public.chapters.key_moments_source is
  'Which writer last updated key_moments. One of classifier, dco, user.';
comment on column public.chapters.key_moments_updated_at is
  'Timestamp of last key_moments write.';

-- ─── chapters: has_blockers_count ────────────────────────────────────────────

alter table public.chapters
  add column if not exists has_blockers_count integer not null default 0;

comment on column public.chapters.has_blockers_count is
  'Cached count of todos with priority_kind=''blocker'' linked to this chapter, for worlds-screen badge. Refreshed at classifier runs.';

-- ─── todos: priority_kind ────────────────────────────────────────────────────

alter table public.todos
  add column if not exists priority_kind text,
  add column if not exists priority_kind_source text,
  add column if not exists priority_kind_updated_at timestamptz;

alter table public.todos drop constraint if exists todos_priority_kind_check;
alter table public.todos
  add constraint todos_priority_kind_check
  check (priority_kind is null or priority_kind in ('action', 'blocker', 'waiting', 'decision', 'momentum'));

alter table public.todos drop constraint if exists todos_priority_kind_source_check;
alter table public.todos
  add constraint todos_priority_kind_source_check
  check (priority_kind_source is null or priority_kind_source in ('classifier', 'dco', 'user'));

comment on column public.todos.priority_kind is
  'Classifier-assigned structural role for this todo within its parent chapter. One of action, blocker, waiting, decision, momentum.';
comment on column public.todos.priority_kind_source is
  'Which writer last set priority_kind. One of classifier, dco, user.';
comment on column public.todos.priority_kind_updated_at is
  'Timestamp of last priority_kind write.';

-- ─── user_rewrite_log ────────────────────────────────────────────────────────

create table if not exists public.user_rewrite_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  field_name text not null,
  requested_at timestamptz not null default now()
);

comment on table public.user_rewrite_log is
  'Audit log of user-requested classifier rewrites, one row per field-level request.';
comment on column public.user_rewrite_log.field_name is
  'Name of the chapter field the user requested a rewrite for (e.g. epigraph, key_moments).';
comment on column public.user_rewrite_log.requested_at is
  'Wall-clock time of the rewrite request. Used for rate limiting.';

create index if not exists idx_user_rewrite_log_chapter_field_time
  on public.user_rewrite_log(chapter_id, field_name, requested_at desc);

-- ─── helper indexes ──────────────────────────────────────────────────────────

create index if not exists idx_todos_owner_priority_kind
  on public.todos(owner_id, priority_kind)
  where priority_kind = 'blocker';

create index if not exists idx_chapters_closed_at
  on public.chapters(closed_at)
  where closed_at is not null;

-- ─── backfill: chapters.title_source ─────────────────────────────────────────

update public.chapters
  set title_source = 'classifier',
      title_updated_at = updated_at
  where title is not null;

COMMIT;
