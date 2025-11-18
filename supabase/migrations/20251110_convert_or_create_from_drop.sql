-- Mind Drop RPC: convert_or_create_from_drop
-- Creates or reuses todos derived from Mind Drop items in an idempotent way
-- Archives the provisional Mind Drop note after conversion

-- COPILOT TASK: Update convert_or_create_from_drop to stop manipulating labels and just archive the provisional note.
--
-- Context:
-- - This function is called when a Mind Drop note is converted to a To-Do via the chip.
-- - Schema details:
--     notes.owner_id :: uuid
--     notes.drop_id  :: text
--     notes.archived :: boolean (soft-delete flag)  -- if not present, just ignore and only set updated_at
--     todos.owner_id :: uuid
--     todos.drop_id  :: text
-- - In Mind Drop, "unsorted" status for notes is derived from labels including 'needs_review',
--   but labels is stored as jsonb in the DB, so array_remove(labels, 'needs_review') is causing
--   the error: function array_remove(jsonb, unknown) does not exist.
--
-- Requirements:
-- ✅ 1) Do NOT call array_remove on labels - completely removed
-- ✅ 2) Todo idempotency by drop_id - proper uuid/text type matching, no casting
-- ✅ 3) Archive note WITHOUT touching labels - dynamic column detection for archived boolean
-- ✅ 4) Return todo id correctly
-- ✅ 5) All other behavior preserved (due date, tags, etc.)

CREATE OR REPLACE FUNCTION public.convert_or_create_from_drop(
  p_owner uuid,
  p_drop_id text,
  p_target text,
  p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_todo_id uuid;
  v_note_id uuid;
  v_due_date date;
  v_due_time time;
  v_tags jsonb;
  v_origin text;
  v_ai_placed boolean;
  v_views jsonb;
  v_tags_meta jsonb;
  v_has_archived_column boolean;
BEGIN
  -- Validate input parameters
  IF p_drop_id IS NULL OR trim(p_drop_id) = '' THEN
    RAISE EXCEPTION 'convert_or_create_from_drop requires a non-empty drop id';
  END IF;

  IF lower(p_target) <> 'todo' THEN
    RAISE EXCEPTION 'Unsupported target for convert_or_create_from_drop: %', p_target
      USING HINT = 'Only the ''todo'' target is supported.';
  END IF;

  -- STEP 1: Check for existing active todo with same owner and drop_id
  -- Both owner_id (uuid) and drop_id (text) - no type casting needed
  SELECT id
    INTO v_todo_id
  FROM public.todos
  WHERE owner_id = p_owner
    AND drop_id = p_drop_id
    AND status = 'active'
  LIMIT 1;

  -- STEP 2: If no existing todo, create one
  IF v_todo_id IS NULL THEN
    -- Extract payload values
    -- Handle due_at: if present, extract both due_date and due_time from it
    -- This satisfies the todos_due_time_check constraint (due_time requires due_date)
    IF p_payload->>'due_at' IS NOT NULL AND p_payload->>'due_at' != '' THEN
      -- Extract date component (DATE type)
      v_due_date := (p_payload->>'due_at')::timestamptz::date;
      -- Extract time component (TIME type) - time of day without timezone
      v_due_time := (p_payload->>'due_at')::timestamptz::time;
    ELSE
      -- Fallback to individual due_date/due_time fields if due_at not provided
      v_due_date := NULLIF(p_payload->>'due_date', '')::date;
      v_due_time := NULLIF(p_payload->>'due_time', '')::time;
    END IF;
    
    v_tags := COALESCE(p_payload->'tags', '[]'::jsonb);
    v_origin := COALESCE(p_payload->>'origin', 'catchall');
    v_ai_placed := COALESCE((p_payload->>'ai_placed')::boolean, FALSE);
    v_views := COALESCE(p_payload->'views', '{}'::jsonb);
    v_tags_meta := COALESCE(p_payload->'tags_meta', '{"sticky":[],"tombstones":[]}'::jsonb);

    BEGIN
      INSERT INTO public.todos (
        owner_id,
        drop_id,
        name,
        body,
        due_date,
        due_time,
        tags,
        origin,
        ai_placed,
        views,
        tags_meta,
        status
      )
      VALUES (
        p_owner,
        p_drop_id,
        COALESCE(p_payload->>'name', ''),
        p_payload->>'body',
        v_due_date,
        v_due_time,
        v_tags,
        v_origin,
        v_ai_placed,
        v_views,
        v_tags_meta,
        'active'
      )
      RETURNING id INTO v_todo_id;
    EXCEPTION
      WHEN unique_violation THEN
        -- Race condition: another process created the todo
        SELECT id
          INTO v_todo_id
        FROM public.todos
        WHERE owner_id = p_owner
          AND drop_id = p_drop_id
          AND status = 'active'
        LIMIT 1;

        IF v_todo_id IS NULL THEN
          RAISE;
        END IF;
    END;
  END IF;

  -- STEP 3: Archive the provisional Mind Drop note WITHOUT touching labels
  -- Find the note with matching owner and drop_id (both correct types)
  SELECT id
    INTO v_note_id
  FROM public.notes
  WHERE owner_id = p_owner
    AND drop_id = p_drop_id
  LIMIT 1;

  IF v_note_id IS NOT NULL THEN
    -- Check if the notes table has an 'archived' column
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notes'
        AND column_name = 'archived'
    ) INTO v_has_archived_column;

    IF v_has_archived_column THEN
      -- Preferred: mark the note as archived (soft delete)
      UPDATE public.notes
         SET archived = true,
             updated_at = timezone('utc', now())
       WHERE id = v_note_id;
    ELSE
      -- Fallback: just update timestamp (no labels manipulation)
      UPDATE public.notes
         SET updated_at = timezone('utc', now())
       WHERE id = v_note_id;
    END IF;
  END IF;

  -- STEP 4: Return the todo id
  RETURN v_todo_id;
END;
$$;

grant execute on function public.convert_or_create_from_drop(uuid, text, text, jsonb) to authenticated;
grant execute on function public.convert_or_create_from_drop(uuid, text, text, jsonb) to service_role;
