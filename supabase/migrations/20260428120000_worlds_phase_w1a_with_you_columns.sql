-- W.1.a: structured people on chapters
--
-- Adds with_you JSONB plus source-protection columns, mirroring the
-- epigraph trio (epigraph / epigraph_source / epigraph_updated_at).
-- The classifier (W.1.b) writes structured people for chapters where
-- named people are materially involved. The chapter detail page
-- selector (W.1.c) reads this field first and falls through to
-- existing @-tag extraction when null.
--
-- Safe additive change: no existing code reads or writes these columns.

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS with_you JSONB,
  ADD COLUMN IF NOT EXISTS with_you_source TEXT,
  ADD COLUMN IF NOT EXISTS with_you_updated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chapters_with_you_source_check'
      AND conrelid = 'public.chapters'::regclass
  ) THEN
    ALTER TABLE public.chapters
      ADD CONSTRAINT chapters_with_you_source_check
      CHECK (
        with_you_source IS NULL
        OR with_you_source = ANY (ARRAY['classifier'::text, 'dco'::text, 'user'::text])
      );
  END IF;
END$$;

COMMENT ON COLUMN public.chapters.with_you IS
  'JSONB array of structured people: { name, role?, span?, evidence_drop_id?, confidence }. Written by classifier in W.1.b. Read by useChapterPeople selector with fall-through to @-tag extraction.';
COMMENT ON COLUMN public.chapters.with_you_source IS
  'Provenance: classifier | dco | user | NULL. User-source blocks classifier overwrite.';
COMMENT ON COLUMN public.chapters.with_you_updated_at IS
  'Timestamp of the last write to with_you, regardless of source.';
