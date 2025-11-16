-- Mind Drop RPC: convert_or_create_from_drop
-- Creates or reuses todos derived from Mind Drop items in an idempotent way
-- Archives the provisional Mind Drop note after conversion

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
    v_due_date := NULLIF(p_payload->>'due_date', '')::date;
    v_due_time := NULLIF(p_payload->>'due_time', '')::time;
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

  -- STEP 3: Archive or clean up the provisional Mind Drop note
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
      -- Preferred: mark the note as archived
      UPDATE public.notes
         SET archived = true,
             updated_at = timezone('utc', now())
       WHERE id = v_note_id;
    ELSE
      -- Fallback: remove 'needs_review' label and update timestamp
      UPDATE public.notes
         SET labels = array_remove(labels, 'needs_review'),
             updated_at = timezone('utc', now())
       WHERE id = v_note_id;
    END IF;
  END IF;

  -- STEP 4: Return the todo id
  RETURN v_todo_id;
END;
$$;

grant execute on function public.convert_or_create_from_drop(uuid, text, text, jsonb) to authenticated;
grant execute on function public.convert_or_create_from_drop(uuid, text, text, jsonb) to service_role;
