-- Minimal Phase 10.7: Just add completed_at column
-- This can be applied to cloud database regardless of existing table structure

DO $$
BEGIN
    -- Check if list_items table exists and add completed_at if it doesn't have it
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'list_items') THEN
        -- Add column if it doesn't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'list_items' AND column_name = 'completed_at') THEN
            ALTER TABLE public.list_items ADD COLUMN completed_at timestamptz;
            CREATE INDEX idx_list_items_completed ON public.list_items(completed_at) WHERE completed_at IS NOT NULL;
            RAISE NOTICE 'Added completed_at column to list_items table';
        ELSE
            RAISE NOTICE 'completed_at column already exists in list_items table';
        END IF;
    ELSE
        RAISE NOTICE 'list_items table does not exist - skipping completed_at column addition';
    END IF;
END
$$;