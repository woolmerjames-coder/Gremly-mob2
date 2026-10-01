-- Chats about an item count towards training readiness.
--
-- entity_chat_count counted notes with a chat summary, which the old entity
-- chat wrote. A chat about one item is now Ask Gremly tied to the item: its
-- opener carries the item as its anchor (metadata_json type 'chat-anchor'),
-- and the opener is saved only once the person writes. So the count is the
-- chats about an item started since p_since. Builds that still have the old
-- entity chat keep counting through its notes; the larger of the two is used,
-- so a note chat counted both ways is not counted twice. The rest is as before.
CREATE OR REPLACE FUNCTION public.get_training_readiness(p_owner_id uuid, p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'total_drops', COALESCE((
      SELECT SUM(drops_count)
      FROM daily_ritual_progress
      WHERE owner_id = p_owner_id AND created_at >= p_since
    ), 0),

    'days_with_drops', COALESCE((
      SELECT COUNT(DISTINCT ritual_day)
      FROM daily_ritual_progress
      WHERE owner_id = p_owner_id AND drops_count > 0 AND created_at >= p_since
    ), 0),

    'total_sweeps', COALESCE((
      SELECT COUNT(*)
      FROM events
      WHERE owner_id = p_owner_id AND kind = 'sweep_completed' AND created_at >= p_since
    ), 0),

    'entity_types', COALESCE((
      SELECT COUNT(DISTINCT entity_type) FROM (
        (SELECT 'todo' AS entity_type FROM todos
          WHERE owner_id = p_owner_id AND created_at >= p_since LIMIT 1)
        UNION ALL
        (SELECT 'habit' FROM habits
          WHERE owner_id = p_owner_id AND created_at >= p_since LIMIT 1)
        UNION ALL
        (SELECT 'journal' FROM notes
          WHERE owner_id = p_owner_id AND subtype = 'journal' AND created_at >= p_since LIMIT 1)
        UNION ALL
        (SELECT 'note' FROM notes
          WHERE owner_id = p_owner_id AND subtype != 'journal' AND created_at >= p_since LIMIT 1)
      ) sub
    ), 0),

    'journal_count', COALESCE((
      SELECT COUNT(*)
      FROM notes
      WHERE owner_id = p_owner_id AND subtype = 'journal' AND created_at >= p_since
    ), 0),

    'entity_chat_count', GREATEST(
      COALESCE((
        SELECT COUNT(DISTINCT m.chat_id)
        FROM scope_chat_messages m
        WHERE m.user_id = p_owner_id
          AND m.created_at >= p_since
          AND m.metadata_json->>'type' = 'chat-anchor'
      ), 0),
      COALESCE((
        SELECT COUNT(*)
        FROM notes
        WHERE owner_id = p_owner_id AND chat_summary IS NOT NULL AND created_at >= p_since
      ), 0)
    ),

    'brief_count', COALESCE((
      SELECT COUNT(*)
      FROM daily_briefs
      WHERE owner_id = p_owner_id AND created_at >= p_since
    ), 0),

    'todos_count', COALESCE((
      SELECT COUNT(*)
      FROM todos
      WHERE owner_id = p_owner_id AND archived = false AND created_at >= p_since
    ), 0)
  );
END;
$function$;
