-- Test that view_today_items correctly handles due_time values
-- This test reproduces the "invalid input syntax for type timestamp with time zone: \"09:00\"" error
-- and verifies that our fix resolves it.

BEGIN;

-- Create a test user
INSERT INTO auth.users (id, email) 
VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com')
ON CONFLICT DO NOTHING;

-- Set the test user as current
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);

-- Clean up any existing test data
DELETE FROM public.todos WHERE owner_id = '00000000-0000-0000-0000-000000000001';

-- Test 1: Todo with just due_time (no due_date)
-- This should create a timestamptz for today at 09:00
INSERT INTO public.todos (id, name, owner_id, due_time, due_date)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Morning task',
  '00000000-0000-0000-0000-000000000001',
  '09:00',
  NULL
);

-- Test 2: Todo with both due_date and due_time
-- This should combine them into a proper timestamptz
INSERT INTO public.todos (id, name, owner_id, due_time, due_date)
VALUES (
  '10000000-0000-0000-0000-000000000002',
  'Afternoon meeting',
  '00000000-0000-0000-0000-000000000001',
  '14:30',
  CURRENT_DATE::text
);

-- Test 3: Todo with just due_date (no due_time)
-- This should use the date as-is
INSERT INTO public.todos (id, name, owner_id, due_time, due_date)
VALUES (
  '10000000-0000-0000-0000-000000000003',
  'All-day task',
  '00000000-0000-0000-0000-000000000001',
  NULL,
  (CURRENT_DATE + INTERVAL '1 day')::timestamptz::text
);

-- Verify the view can be queried without errors
-- This would previously fail with: invalid input syntax for type timestamp with time zone: "09:00"
SELECT 
  'view_today_items query test' AS test_name,
  CASE 
    WHEN COUNT(*) >= 0 THEN 'PASS: View query succeeded'
    ELSE 'FAIL: Unexpected result'
  END AS result
FROM view_today_items
WHERE user_id = '00000000-0000-0000-0000-000000000001';

-- Verify Test 1: Todo with just due_time creates a valid timestamptz
SELECT 
  'Test 1: due_time only' AS test_name,
  CASE
    WHEN due_at IS NOT NULL 
      AND EXTRACT(HOUR FROM due_at AT TIME ZONE 'America/Los_Angeles') = 9
      AND EXTRACT(MINUTE FROM due_at AT TIME ZONE 'America/Los_Angeles') = 0
    THEN 'PASS: due_time converted to timestamptz correctly'
    ELSE 'FAIL: due_at=' || COALESCE(due_at::text, 'NULL')
  END AS result
FROM view_today_items
WHERE id = '10000000-0000-0000-0000-000000000001';

-- Verify Test 2: Todo with both due_date and due_time combines correctly
SELECT 
  'Test 2: due_date + due_time' AS test_name,
  CASE
    WHEN due_at IS NOT NULL 
      AND EXTRACT(HOUR FROM due_at AT TIME ZONE 'America/Los_Angeles') = 14
      AND EXTRACT(MINUTE FROM due_at AT TIME ZONE 'America/Los_Angeles') = 30
      AND DATE(due_at AT TIME ZONE 'America/Los_Angeles') = CURRENT_DATE
    THEN 'PASS: date + time combined correctly'
    ELSE 'FAIL: due_at=' || COALESCE(due_at::text, 'NULL')
  END AS result
FROM view_today_items
WHERE id = '10000000-0000-0000-0000-000000000002';

-- Verify Test 3: Todo with just due_date works (this should NOT appear in today view)
SELECT 
  'Test 3: due_date only (tomorrow)' AS test_name,
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: Tomorrow task not in today view'
    ELSE 'FAIL: Tomorrow task incorrectly appears in today view'
  END AS result
FROM view_today_items
WHERE id = '10000000-0000-0000-0000-000000000003';

-- Clean up test data
DELETE FROM public.todos WHERE owner_id = '00000000-0000-0000-0000-000000000001';

ROLLBACK;
