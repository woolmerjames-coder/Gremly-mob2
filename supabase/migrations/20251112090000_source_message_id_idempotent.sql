-- Ensure source_message_id-based idempotency for core record tables (idempotent)

DO $$
DECLARE
  target_table text;
  index_name text;
  dedup_count bigint;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['todos', 'notes', 'habits']
  LOOP
    index_name := target_table || '_source_message_owner_unique_idx';

    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = target_table
    ) THEN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = target_table
          AND column_name = 'source_message_id'
      ) THEN
        dedup_count := 0;

        EXECUTE format(
          $fmt$
            WITH ranked AS (
              SELECT id
              FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                         PARTITION BY owner_id, source_message_id
                         ORDER BY created_at ASC, id ASC
                       ) AS rn
                FROM public.%I
                WHERE source_message_id IS NOT NULL
              ) dup
              WHERE rn > 1
            )
            UPDATE public.%I t
            SET source_message_id = NULL
            WHERE id IN (SELECT id FROM ranked);
          $fmt$,
          target_table,
          target_table
        );

        GET DIAGNOSTICS dedup_count = ROW_COUNT;
        IF dedup_count > 0 THEN
          RAISE NOTICE 'Cleared % duplicate source_message_id rows in %', dedup_count, target_table;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = index_name
        ) THEN
          EXECUTE format(
            'CREATE UNIQUE INDEX %I ON public.%I (owner_id, source_message_id) WHERE source_message_id IS NOT NULL',
            index_name,
            target_table
          );
        END IF;
      ELSE
        RAISE NOTICE '% table missing source_message_id column - skipping unique index', target_table;
      END IF;
    ELSE
      RAISE NOTICE '% table missing - skipping unique index', target_table;
    END IF;
  END LOOP;
END$$;
