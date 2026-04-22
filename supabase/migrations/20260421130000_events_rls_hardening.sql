-- ============================================================================
-- Migration: 20260421130000_events_rls_hardening
-- Purpose:   Enable RLS on public.events and add owner-scoped policies
-- Scope:     Single table, additive (no schema change, no data touch)
-- Rationale: Table has 641 rows of real user data with RLS disabled.
--            Cross-user read leakage risk per audit §11.10 and Q9.
-- ============================================================================

BEGIN;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_sel_own ON public.events
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = owner_id);

CREATE POLICY events_ins_own ON public.events
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY events_upd_own ON public.events
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY events_del_own ON public.events
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = owner_id);

COMMIT;
