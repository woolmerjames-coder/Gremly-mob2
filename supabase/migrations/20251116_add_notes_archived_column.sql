-- Add 'archived' boolean column to public.notes for Mind Drop soft delete
-- This enables convert_or_create_from_drop to properly hide provisional notes

-- Add the archived column if it doesn't exist
-- Default: false (not archived)
-- Not null: true (every note must have an explicit archived status)
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Backfill existing rows to ensure they're marked as not archived
-- This is idempotent and safe to run multiple times
UPDATE public.notes
SET archived = false
WHERE archived IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.notes.archived IS 'Soft delete flag for Mind Drop provisional notes. When true, note is hidden from Recent Drops and other UI lists.';
