-- Fix view_today_items to properly convert date + time to timestamptz
-- 
-- Problem: When combining date + time, PostgreSQL creates a timestamp (without timezone)
-- but we were trying to directly use AT TIME ZONE which doesn't work correctly.
-- 
-- Solution: First create the timestamp, then convert to the correct timezone.

CREATE OR REPLACE VIEW public.view_today_items AS
WITH zone AS (
  SELECT
    now() AT TIME ZONE 'America/Los_Angeles' AS local_now,
    DATE(now() AT TIME ZONE 'America/Los_Angeles') AS local_today,
    DATE_TRUNC('week', now() AT TIME ZONE 'America/Los_Angeles') AS local_week_start,
    DATE_TRUNC('month', now() AT TIME ZONE 'America/Los_Angeles') AS local_month_start
),
todo_source AS (
  SELECT
    t.id,
    'todo'::text AS kind,
    COALESCE(t.name, t.title, 'Untitled') AS title,
    CASE
      -- Both date and time specified: combine them
      WHEN sanitized.due_time_value IS NOT NULL AND sanitized.due_date_value IS NOT NULL THEN
        ((sanitized.due_date_value::text || ' ' || sanitized.due_time_value::text)::timestamp AT TIME ZONE 'America/Los_Angeles')
      -- Only time specified: use today's date with that time
      WHEN sanitized.due_time_value IS NOT NULL THEN
        ((z.local_today::text || ' ' || sanitized.due_time_value::text)::timestamp AT TIME ZONE 'America/Los_Angeles')
      -- Only date specified (or full timestamp)
      ELSE
        sanitized.due_date_timestamptz
    END AS due_at,
    (t.completed_at IS NOT NULL) AS completed,
    t.owner_id AS user_id,
    t.created_at AS inserted_at,
    t.updated_at
  FROM public.todos t
  CROSS JOIN zone z
  CROSS JOIN LATERAL (
    SELECT
      -- Parse due_time as TIME type (HH:MM format)
      CASE
        WHEN NULLIF(TRIM(BOTH '"' FROM t.due_time::text), '') IS NOT NULL THEN
          NULLIF(TRIM(BOTH '"' FROM t.due_time::text), '')::time
        ELSE
          NULL
      END AS due_time_value,
      -- Parse due_date as DATE type
      CASE
        WHEN NULLIF(TRIM(BOTH '"' FROM t.due_date::text), '') IS NOT NULL THEN
          NULLIF(TRIM(BOTH '"' FROM t.due_date::text), '')::date
        ELSE
          NULL
      END AS due_date_value,
      -- Parse due_date as TIMESTAMPTZ if it's a full timestamp
      CASE
        WHEN t.due_date IS NULL THEN
          NULL
        WHEN pg_typeof(t.due_date) = 'timestamp with time zone'::regtype THEN
          t.due_date::timestamptz
        WHEN pg_typeof(t.due_date) = 'timestamp without time zone'::regtype THEN
          (t.due_date::timestamp without time zone AT TIME ZONE 'UTC')
        WHEN NULLIF(TRIM(BOTH '"' FROM t.due_date::text), '') IS NOT NULL THEN
          NULLIF(TRIM(BOTH '"' FROM t.due_date::text), '')::timestamptz
        ELSE
          NULL
      END AS due_date_timestamptz
  ) AS sanitized
)
SELECT
  ts.id,
  ts.kind,
  ts.title,
  ts.due_at,
  ts.completed,
  ts.user_id,
  ts.inserted_at,
  ts.updated_at
FROM todo_source ts
CROSS JOIN zone z
WHERE ts.due_at IS NOT NULL
  AND DATE(ts.due_at AT TIME ZONE 'America/Los_Angeles') = z.local_today
UNION ALL
SELECT
  h.id,
  'habit'::text AS kind,
  COALESCE(h.name, 'Untitled') AS title,
  NULL::timestamptz AS due_at,
  (
    h.cadence = 'day'
    AND h.last_completed_at IS NOT NULL
    AND DATE(h.last_completed_at AT TIME ZONE 'America/Los_Angeles') = z.local_today
  ) AS completed,
  h.owner_id AS user_id,
  h.created_at AS inserted_at,
  h.updated_at
FROM public.habits h
CROSS JOIN zone z
WHERE h.cadence = 'day'
   OR (
    h.cadence = 'week'
    AND DATE_TRUNC('week', COALESCE(h.period_start_at, z.local_now)) = z.local_week_start
  )
   OR (
    h.cadence = 'month'
    AND DATE_TRUNC('month', COALESCE(h.period_start_at, z.local_now)) = z.local_month_start
  );
