-- Safely handle todo due_time strings when building view_today_items
CREATE OR REPLACE VIEW public.view_today_items AS
WITH todo_source AS (
  SELECT
    t.id,
    'todo'::text AS kind,
    COALESCE(t.name, t.title, 'Untitled') AS title,
    CASE
      WHEN NULLIF(t.due_time, '') IS NOT NULL AND t.due_date IS NOT NULL THEN
        (t.due_date::date + NULLIF(t.due_time, '')::time) AT TIME ZONE 'UTC'
      WHEN NULLIF(t.due_time, '') IS NOT NULL THEN
        (DATE_TRUNC('day', now() AT TIME ZONE 'UTC')::date + NULLIF(t.due_time, '')::time) AT TIME ZONE 'UTC'
      ELSE
        t.due_date::timestamptz
    END AS due_at,
    (t.completed_at IS NOT NULL) AS completed,
    t.owner_id AS user_id,
    t.created_at AS inserted_at,
    t.updated_at
  FROM public.todos t
)
SELECT *
FROM todo_source
WHERE due_at IS NOT NULL
  AND DATE(due_at AT TIME ZONE 'UTC') = DATE(now() AT TIME ZONE 'UTC')
UNION ALL
SELECT
  h.id,
  'habit'::text AS kind,
  COALESCE(h.name, 'Untitled') AS title,
  NULL::timestamptz AS due_at,
  (
    h.cadence = 'daily'
    AND h.last_completed_at IS NOT NULL
    AND DATE(h.last_completed_at AT TIME ZONE 'utc') = DATE(now() AT TIME ZONE 'utc')
  ) AS completed,
  h.owner_id AS user_id,
  h.created_at AS inserted_at,
  h.updated_at
FROM public.habits h
WHERE h.cadence = 'daily'
   OR (
    h.cadence = 'weekly'
    AND DATE_TRUNC('week', now() AT TIME ZONE 'utc') = DATE_TRUNC('week', COALESCE(h.period_start_at, now()) AT TIME ZONE 'utc')
  );
