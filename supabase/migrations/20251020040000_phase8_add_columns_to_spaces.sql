-- Phase 8: Add new columns to spaces table for Spaces v2
-- Adds icon, theme, summary caching, layout state, and archival support

ALTER TABLE public.spaces 
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS theme text,
  ADD COLUMN IF NOT EXISTS summary_cached text,
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS layout_state_json jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Add comment for documentation
COMMENT ON COLUMN public.spaces.icon IS 'Emoji icon for the space';
COMMENT ON COLUMN public.spaces.theme IS 'Color theme: mint, periwinkle, cream, etc.';
COMMENT ON COLUMN public.spaces.summary_cached IS 'AI-generated summary of space content';
COMMENT ON COLUMN public.spaces.summary_updated_at IS 'Timestamp of last summary generation';
COMMENT ON COLUMN public.spaces.layout_state_json IS 'User layout preferences and widget state';
COMMENT ON COLUMN public.spaces.archived_at IS 'Soft delete timestamp';
