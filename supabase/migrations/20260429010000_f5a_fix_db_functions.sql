-- F.5.a.fix — Update broken database functions to reference scope_chats / scope_chat_messages
-- archive_stale_general_chats() and get_active_users_needing_synthesis()
-- both still referenced the old table names after the F.5.a rename.

BEGIN;

-- 1. archive_stale_general_chats — rename space_chats → scope_chats
CREATE OR REPLACE FUNCTION public.archive_stale_general_chats()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  archived_count integer;
BEGIN
  UPDATE scope_chats
  SET archived_at = now()
  WHERE chat_type = 'general'
    AND archived_at IS NULL
    AND updated_at < now() - interval '30 days';
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  RETURN archived_count;
END;
$function$;

-- 2. get_active_users_needing_synthesis — rename space_chat_messages
--    to scope_chat_messages in the activity union
CREATE OR REPLACE FUNCTION public.get_active_users_needing_synthesis(
  since timestamp with time zone DEFAULT (now() - '7 days'::interval)
)
RETURNS TABLE(user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH active_users AS (
    SELECT DISTINCT owner_id as uid, MAX(created_at) as last_activity FROM (
      SELECT owner_id, created_at FROM todos WHERE created_at > since
      UNION ALL
      SELECT owner_id, created_at FROM notes WHERE created_at > since
      UNION ALL
      SELECT owner_id, created_at FROM habits WHERE created_at > since
      UNION ALL
      SELECT scm.user_id as owner_id, scm.created_at
        FROM scope_chat_messages scm
        WHERE scm.created_at > since
    ) AS all_activity
    GROUP BY owner_id
  )
  SELECT a.uid AS user_id
  FROM active_users a
  LEFT JOIN user_profiles p ON p.user_id = a.uid
  INNER JOIN cortex_preferences cp ON cp.owner_id = a.uid
  WHERE (p.generated_at IS NULL OR a.last_activity > p.generated_at)
    AND (
      cp.is_tester = true
      OR cp.is_subscribed = true
      OR (
        cp.challenge_completed_at IS NULL
        AND cp.trial_started_at IS NOT NULL
        AND cp.trial_started_at + INTERVAL '14 days' > NOW()
      )
    );
END;
$function$;

COMMIT;
