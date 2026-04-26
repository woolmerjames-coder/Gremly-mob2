-- Phase C.1b.5 — Chapter phase history trigger
-- Automatically writes chapter_phase_history rows whenever a chapter's
-- current_phase_key changes, or when a chapter closes. Eliminates the
-- need for app/worker code to remember to write phase history.

------------------------------------------------------------------
-- 1. Trigger function
------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_chapter_phase_history_track()
RETURNS TRIGGER AS $$
DECLARE
  v_source text;
  v_phase_key_changed boolean;
  v_chapter_closing boolean;
  v_entered_at timestamptz;
BEGIN
  -- Source defaults to 'classifier' when not explicitly set by the caller
  v_source := COALESCE(NEW.current_phase_key_source, 'classifier');

  IF TG_OP = 'INSERT' THEN
    -- New chapter created with a phase_key, not already closed
    IF NEW.current_phase_key IS NOT NULL AND NEW.closed_at IS NULL THEN
      v_entered_at := COALESCE(NEW.current_phase_key_updated_at, NEW.created_at, now());
      INSERT INTO public.chapter_phase_history
        (chapter_id, phase_key, entered_at, source)
      VALUES
        (NEW.id, NEW.current_phase_key, v_entered_at, v_source);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_phase_key_changed := NEW.current_phase_key IS DISTINCT FROM OLD.current_phase_key;
    v_chapter_closing := NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL;

    -- Close the currently-open phase row when phase changes OR chapter closes
    IF v_phase_key_changed OR v_chapter_closing THEN
      UPDATE public.chapter_phase_history
        SET left_at = now()
        WHERE chapter_id = NEW.id AND left_at IS NULL;
    END IF;

    -- Insert a new active phase row only when phase changed AND chapter is still open
    IF v_phase_key_changed
       AND NEW.current_phase_key IS NOT NULL
       AND NEW.closed_at IS NULL
    THEN
      v_entered_at := COALESCE(NEW.current_phase_key_updated_at, now());
      INSERT INTO public.chapter_phase_history
        (chapter_id, phase_key, entered_at, source)
      VALUES
        (NEW.id, NEW.current_phase_key, v_entered_at, v_source);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.fn_chapter_phase_history_track() IS
  'Trigger function: maintains chapter_phase_history rows automatically. On INSERT writes the initial phase row; on UPDATE closes the active row when phase changes or chapter closes, and opens a new row when phase changes while still open.';

------------------------------------------------------------------
-- 2. Trigger binding
------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_chapter_phase_history ON public.chapters;

CREATE TRIGGER trg_chapter_phase_history
AFTER INSERT OR UPDATE OF current_phase_key, closed_at ON public.chapters
FOR EACH ROW
EXECUTE FUNCTION public.fn_chapter_phase_history_track();

COMMENT ON TRIGGER trg_chapter_phase_history ON public.chapters IS
  'Fires when current_phase_key or closed_at is in an UPDATE SET clause (or on INSERT). Function decides whether the value actually changed before writing history.';

------------------------------------------------------------------
-- 3. Backfill — populate phase history for existing chapters
------------------------------------------------------------------
-- Existing chapters with current_phase_key set but no phase_history rows
-- get a synthetic entry. The trigger handles future changes from here on.

INSERT INTO public.chapter_phase_history
  (chapter_id, phase_key, entered_at, left_at, source)
SELECT
  c.id,
  c.current_phase_key,
  COALESCE(c.current_phase_key_updated_at, c.created_at, now()) AS entered_at,
  CASE WHEN c.closed_at IS NOT NULL THEN c.closed_at ELSE NULL END AS left_at,
  COALESCE(c.current_phase_key_source, 'classifier') AS source
FROM public.chapters c
WHERE c.current_phase_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.chapter_phase_history h
    WHERE h.chapter_id = c.id
  );
