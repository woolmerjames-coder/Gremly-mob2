-- ============================================================================
-- Migration: 20260421120000_worlds_foundation
-- Purpose:   Phase 1 foundation for Worlds & Chapters v2
-- Scope:     Additive only. Creates 8 new tables, 10 indexes, 32 RLS policies.
-- Preserves: Life Map pipeline and all existing tables completely untouched.
-- Reference: worlds_and_chapters_spec_v2-3.md §6, audit_v2-1.md §6 and §11
-- ============================================================================

BEGIN;

-- ============================================================================
-- TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. worlds: active life domains, multi-archetype, phased
-- ----------------------------------------------------------------------------
CREATE TABLE public.worlds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid NOT NULL,

  name                  text NOT NULL,
  description           text,

  -- Multi-archetype per spec §4: jsonb array of {archetype, weight}
  archetypes            jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Lifecycle per spec §5
  phase                 text NOT NULL DEFAULT 'candidate',
  source                text NOT NULL,
  confidence            numeric,

  -- Velocity tracking per spec §5
  signal_velocity       numeric,
  signal_velocity_delta numeric,
  last_signal_at        timestamptz,

  -- Presentation per spec §6
  module_layout         jsonb,
  visual_style          jsonb,

  -- Life Map linkage per spec §6: nullable uuid, no FK
  life_map_cluster_id   uuid,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT worlds_phase_check
    CHECK (phase IN ('candidate', 'active', 'evolving', 'dormant', 'archived'))
);

-- ----------------------------------------------------------------------------
-- 2. chapters: bounded arcs
-- ----------------------------------------------------------------------------
CREATE TABLE public.chapters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            uuid NOT NULL,

  title               text NOT NULL,
  description         text,

  chapter_type        text NOT NULL,
  phase               text NOT NULL DEFAULT 'suggested',

  start_date          date,
  end_date            date,

  primary_world_id    uuid REFERENCES public.worlds(id) ON DELETE SET NULL,

  -- For active_goals module per spec §9: chapters with target_description
  -- are the surfaceable active goals
  target_description  text,

  source              text NOT NULL,
  confidence          numeric,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chapters_type_check
    CHECK (chapter_type IN ('bounded', 'season', 'milestone')),
  CONSTRAINT chapters_phase_check
    CHECK (phase IN ('suggested', 'upcoming', 'active', 'closed'))
);

-- ----------------------------------------------------------------------------
-- 3. life_contexts: constraint containers that are not Worlds
-- ----------------------------------------------------------------------------
CREATE TABLE public.life_contexts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL,

  name              text NOT NULL,
  description       text,
  kind              text NOT NULL,

  start_date        date,
  end_date          date,
  active            boolean NOT NULL DEFAULT true,

  source            text NOT NULL,
  calendar_source   text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT life_contexts_kind_check
    CHECK (kind IN ('employer', 'role', 'obligation', 'calendar_source', 'custom')),
  CONSTRAINT life_contexts_source_check
    CHECK (source IN ('signal_suggested', 'user_created'))
);

-- ----------------------------------------------------------------------------
-- 4. chapter_world_links: many-to-many chapter-to-world
-- owner_id is denormalized for RLS performance per audit §11 best-in-class
-- ----------------------------------------------------------------------------
CREATE TABLE public.chapter_world_links (
  chapter_id        uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  world_id          uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  owner_id          uuid NOT NULL,
  relevance_score   numeric NOT NULL DEFAULT 1.0,
  PRIMARY KEY (chapter_id, world_id)
);

-- ----------------------------------------------------------------------------
-- 5. drop_world_links: polymorphic drop-to-world junction
-- drop_type enum locked to note/todo/habit per audit §11.5 (Q4 Reading A)
-- ----------------------------------------------------------------------------
CREATE TABLE public.drop_world_links (
  drop_id           uuid NOT NULL,
  drop_type         text NOT NULL,
  world_id          uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  owner_id          uuid NOT NULL,
  relevance_score   numeric NOT NULL DEFAULT 1.0,
  assigned_by       text NOT NULL,
  PRIMARY KEY (drop_id, drop_type, world_id),
  CONSTRAINT drop_world_links_type_check
    CHECK (drop_type IN ('note', 'todo', 'habit'))
);

-- ----------------------------------------------------------------------------
-- 6. drop_chapter_links: polymorphic drop-to-chapter junction
-- ----------------------------------------------------------------------------
CREATE TABLE public.drop_chapter_links (
  drop_id           uuid NOT NULL,
  drop_type         text NOT NULL,
  chapter_id        uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  owner_id          uuid NOT NULL,
  relevance_score   numeric NOT NULL DEFAULT 1.0,
  assigned_by       text NOT NULL,
  PRIMARY KEY (drop_id, drop_type, chapter_id),
  CONSTRAINT drop_chapter_links_type_check
    CHECK (drop_type IN ('note', 'todo', 'habit'))
);

-- ----------------------------------------------------------------------------
-- 7. drop_context_links: polymorphic drop-to-context junction
-- ----------------------------------------------------------------------------
CREATE TABLE public.drop_context_links (
  drop_id           uuid NOT NULL,
  drop_type         text NOT NULL,
  context_id        uuid NOT NULL REFERENCES public.life_contexts(id) ON DELETE CASCADE,
  owner_id          uuid NOT NULL,
  relevance_score   numeric NOT NULL DEFAULT 1.0,
  assigned_by       text NOT NULL,
  PRIMARY KEY (drop_id, drop_type, context_id),
  CONSTRAINT drop_context_links_type_check
    CHECK (drop_type IN ('note', 'todo', 'habit'))
);

-- ----------------------------------------------------------------------------
-- 8. world_lineage: evolution history
-- Parent/child world arrays are jsonb because event types have different
-- cardinalities (split=1 parent N children, merge=N parents 1 child, etc.)
-- ----------------------------------------------------------------------------
CREATE TABLE public.world_lineage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL,

  event_type        text NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  proposed_at       timestamptz NOT NULL,
  confirmed_at      timestamptz,

  parent_world_ids  jsonb NOT NULL,
  child_world_ids   jsonb NOT NULL,

  reason            text,
  drops_reassigned  integer,
  user_edited       boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT world_lineage_event_check
    CHECK (event_type IN ('split', 'merge', 'transform', 'absorb', 'emerge'))
);

-- ============================================================================
-- INDEXES
-- Indexes lead with owner_id where possible so RLS rides the same index as
-- the access pattern. See Supabase RLS performance benchmarks.
-- ============================================================================

-- worlds
CREATE INDEX idx_worlds_owner_phase
  ON public.worlds (owner_id, phase);
CREATE INDEX idx_worlds_owner_last_signal
  ON public.worlds (owner_id, last_signal_at DESC);

-- chapters
CREATE INDEX idx_chapters_owner_phase_start
  ON public.chapters (owner_id, phase, start_date);
CREATE INDEX idx_chapters_primary_world
  ON public.chapters (primary_world_id);

-- life_contexts
CREATE INDEX idx_life_contexts_owner_active
  ON public.life_contexts (owner_id, active);

-- chapter_world_links
-- Forward lookup "worlds for this chapter" is covered by PK (chapter_id, world_id).
-- Reverse lookup "chapters for this world" plus RLS is covered below.
CREATE INDEX idx_chapter_world_links_owner_world
  ON public.chapter_world_links (owner_id, world_id);

-- drop_world_links
-- Reverse lookup "which worlds for this drop" is covered by PK (drop_id, drop_type, world_id).
-- Primary access "drops in this world" plus RLS is covered below.
CREATE INDEX idx_drop_world_links_owner_world
  ON public.drop_world_links (owner_id, world_id);

-- drop_chapter_links
CREATE INDEX idx_drop_chapter_links_owner_chapter
  ON public.drop_chapter_links (owner_id, chapter_id);

-- drop_context_links
CREATE INDEX idx_drop_context_links_owner_context
  ON public.drop_context_links (owner_id, context_id);

-- world_lineage
CREATE INDEX idx_world_lineage_owner_occurred
  ON public.world_lineage (owner_id, occurred_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Pattern: four policies per table, granted TO authenticated only, using
-- (select auth.uid()) = owner_id with initPlan caching per Supabase docs.
-- with_check on UPDATE prevents owner_id theft.
-- ============================================================================

ALTER TABLE public.worlds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.life_contexts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_world_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_world_links    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_chapter_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drop_context_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_lineage       ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- worlds policies
-- ----------------------------------------------------------------------------
CREATE POLICY worlds_sel_own ON public.worlds
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY worlds_ins_own ON public.worlds
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY worlds_upd_own ON public.worlds
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY worlds_del_own ON public.worlds
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- chapters policies
-- ----------------------------------------------------------------------------
CREATE POLICY chapters_sel_own ON public.chapters
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY chapters_ins_own ON public.chapters
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY chapters_upd_own ON public.chapters
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY chapters_del_own ON public.chapters
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- life_contexts policies
-- ----------------------------------------------------------------------------
CREATE POLICY life_contexts_sel_own ON public.life_contexts
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY life_contexts_ins_own ON public.life_contexts
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY life_contexts_upd_own ON public.life_contexts
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY life_contexts_del_own ON public.life_contexts
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- chapter_world_links policies
-- ----------------------------------------------------------------------------
CREATE POLICY chapter_world_links_sel_own ON public.chapter_world_links
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY chapter_world_links_ins_own ON public.chapter_world_links
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY chapter_world_links_upd_own ON public.chapter_world_links
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY chapter_world_links_del_own ON public.chapter_world_links
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- drop_world_links policies
-- ----------------------------------------------------------------------------
CREATE POLICY drop_world_links_sel_own ON public.drop_world_links
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY drop_world_links_ins_own ON public.drop_world_links
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY drop_world_links_upd_own ON public.drop_world_links
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY drop_world_links_del_own ON public.drop_world_links
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- drop_chapter_links policies
-- ----------------------------------------------------------------------------
CREATE POLICY drop_chapter_links_sel_own ON public.drop_chapter_links
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY drop_chapter_links_ins_own ON public.drop_chapter_links
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY drop_chapter_links_upd_own ON public.drop_chapter_links
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY drop_chapter_links_del_own ON public.drop_chapter_links
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- drop_context_links policies
-- ----------------------------------------------------------------------------
CREATE POLICY drop_context_links_sel_own ON public.drop_context_links
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY drop_context_links_ins_own ON public.drop_context_links
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY drop_context_links_upd_own ON public.drop_context_links
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY drop_context_links_del_own ON public.drop_context_links
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

-- ----------------------------------------------------------------------------
-- world_lineage policies
-- ----------------------------------------------------------------------------
CREATE POLICY world_lineage_sel_own ON public.world_lineage
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY world_lineage_ins_own ON public.world_lineage
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY world_lineage_upd_own ON public.world_lineage
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY world_lineage_del_own ON public.world_lineage
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

COMMIT;
