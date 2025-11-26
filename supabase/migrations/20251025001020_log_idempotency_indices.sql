-- Idempotency/uniqueness constraints for logs (safe conditional creation)
-- LEGACY: habit_logs table is obsolete - habit_progress is the canonical table

DO $$
BEGIN
  -- LEGACY: Habit logs unique per (habit_id, log_date)
  -- Note: habit_logs table is replaced by habit_progress in newer schema
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'habit_logs'
  ) THEN
    -- Only create the index if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'habit_logs_unique_day'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX habit_logs_unique_day ON public.habit_logs (habit_id, log_date)';
    END IF;
  ELSE
    RAISE NOTICE 'habit_logs table does not exist - skipping index creation';
  END IF;

  -- Chat logs idempotency (optional): unique per (user_id, habit_id, log_date, message_id)
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_logs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'chat_log_dedupe'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX chat_log_dedupe ON public.chat_logs (user_id, habit_id, log_date, message_id)';
    END IF;
  ELSE
    RAISE NOTICE 'chat_logs table does not exist - skipping index creation';
  END IF;
END$$;
