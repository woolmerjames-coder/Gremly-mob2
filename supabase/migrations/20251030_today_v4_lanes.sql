-- 1. Enum for cadence
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cadence_type') THEN
    CREATE TYPE cadence_type AS ENUM ('daily', 'weekly', 'monthly');
  END IF;
END
$$;

-- 2. Extend habits
ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS cadence cadence_type DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS target_per_period integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS target_per_day integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS days_active text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_completed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_start_at timestamptz DEFAULT timezone('utc', now());

-- 3. View: today's active items (todos + habits)
CREATE OR REPLACE VIEW public.view_today_items AS
SELECT
  t.id,
  'todo'::text AS kind,
  COALESCE(t.name, t.title, 'Untitled') AS title,
  COALESCE(t.due_time, t.due_date::timestamptz) AS due_at,
  (t.completed_at IS NOT NULL) AS completed,
  t.owner_id AS user_id,
  t.created_at AS inserted_at,
  t.updated_at
FROM public.todos t
WHERE DATE(COALESCE(t.due_time, t.due_date::timestamptz) AT TIME ZONE 'utc') = DATE(now() AT TIME ZONE 'utc')
UNION ALL
SELECT
  h.id,
  'habit'::text AS kind,
  COALESCE(h.name, h.title, 'Untitled') AS title,
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

-- 4. RPC: complete_item
CREATE OR REPLACE FUNCTION public.complete_item(_kind text, _id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  IF _kind = 'todo' THEN
    UPDATE public.todos AS t
      SET completed_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      WHERE t.id = _id
      RETURNING row_to_json(t.*) INTO result;
  ELSIF _kind = 'habit' THEN
    UPDATE public.habits AS h
      SET last_completed_at = timezone('utc', now()),
          target_per_day = GREATEST(COALESCE(h.target_per_day, 1) - 1, 0),
          updated_at = timezone('utc', now())
      WHERE h.id = _id
      RETURNING row_to_json(h.*) INTO result;
  END IF;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;