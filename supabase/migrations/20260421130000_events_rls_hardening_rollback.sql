-- ============================================================================
-- Rollback: 20260421130000_events_rls_hardening
-- Purpose:  Revert RLS on public.events
-- Notes:    Drops four policies then disables RLS. Data untouched.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS events_del_own ON public.events;
DROP POLICY IF EXISTS events_upd_own ON public.events;
DROP POLICY IF EXISTS events_ins_own ON public.events;
DROP POLICY IF EXISTS events_sel_own ON public.events;

ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;

COMMIT;
