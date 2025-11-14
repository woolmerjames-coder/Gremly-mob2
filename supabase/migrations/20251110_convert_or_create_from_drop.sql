-- Mind Drop RPC: convert_or_create_from_drop
-- Creates or reuses todos derived from Mind Drop items in an idempotent way

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
  v_drop_uuid uuid;
  v_existing_id uuid;
  v_note_id uuid;
  v_new_id uuid;
  v_due_date date;
  v_due_time time;
  v_tags jsonb;
  v_origin text;
  v_ai_placed boolean;
  v_views jsonb;
  v_tags_meta jsonb;
BEGIN
  IF p_drop_id IS NULL OR trim(p_drop_id) = '' THEN
    RAISE EXCEPTION 'convert_or_create_from_drop requires a non-empty drop id';
  END IF;

  v_drop_uuid := p_drop_id::uuid;

  IF lower(p_target) <> 'todo' THEN
    RAISE EXCEPTION 'Unsupported target for convert_or_create_from_drop: %', p_target
      USING HINT = 'Only the ''todo'' target is supported.';
  END IF;

  SELECT id
    INTO v_existing_id
  FROM public.todos
  WHERE owner_id = p_owner
    AND drop_id = v_drop_uuid
    AND status = 'active'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT id
    INTO v_note_id
  FROM public.notes
  WHERE owner_id = p_owner
    AND drop_id = v_drop_uuid
    AND COALESCE(archived_reason, '') = ''
    AND (archived_at IS NULL)
  LIMIT 1;

  IF v_note_id IS NOT NULL THEN
    UPDATE public.notes
       SET archived_at = timezone('utc', now()),
           archived_reason = 'converted_to_todo',
           updated_at = timezone('utc', now())
     WHERE id = v_note_id;
  END IF;

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
      v_drop_uuid,
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
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id
        INTO v_new_id
      FROM public.todos
      WHERE owner_id = p_owner
        AND drop_id = v_drop_uuid
        AND status = 'active'
      LIMIT 1;

      IF v_new_id IS NULL THEN
        RAISE;
      END IF;
  END;

  RETURN v_new_id;
END;
$$;

grant execute on function public.convert_or_create_from_drop(uuid, text, text, jsonb) to authenticated;
grant execute on function public.convert_or_create_from_drop(uuid, text, text, jsonb) to service_role;
