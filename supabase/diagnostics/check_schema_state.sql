-- ============================================
-- Supabase Schema Diagnostics
-- ============================================
-- This script checks the current state of the database schema
-- Safe to run - no destructive changes

-- ============================================
-- 1. Columns Check
-- ============================================
SELECT 
    '=== COLUMNS CHECK ===' AS section;

SELECT 
    table_name, 
    column_name, 
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('todos', 'notes', 'habits', 'tags', 'tag_map', 'people', 'entity_people')
ORDER BY table_name, ordinal_position;

-- ============================================
-- 2. RLS Status Check
-- ============================================
SELECT 
    '=== RLS STATUS ===' AS section;

SELECT 
    n.nspname AS schema, 
    c.relname AS table, 
    c.relrowsecurity AS rls_enabled,
    CASE 
        WHEN c.relrowsecurity THEN '✅ Enabled'
        ELSE '⚠️ Disabled'
    END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relname IN ('todos', 'notes', 'habits', 'tags', 'tag_map', 'people', 'entity_people')
ORDER BY c.relname;

-- ============================================
-- 3. Quick Existence Flags
-- ============================================
SELECT 
    '=== EXISTENCE FLAGS ===' AS section;

SELECT
    -- Todos table columns
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='todos' AND column_name='due_time') AS todos_due_time,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='todos' AND column_name='due_date') AS todos_due_date,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='todos' AND column_name='reminders_json') AS todos_reminders_json,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='todos' AND column_name='tags') AS todos_tags,
    
    -- Notes table columns
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notes' AND column_name='fmt') AS notes_fmt,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notes' AND column_name='mood') AS notes_mood,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notes' AND column_name='journal_subtype') AS notes_journal_subtype,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notes' AND column_name='reminders_json') AS notes_reminders_json,
    
    -- Habits table columns
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='habits' AND column_name='frequency_json') AS habits_frequency_json,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='habits' AND column_name='reminders_json') AS habits_reminders_json,
    
    -- Phase 8 tables
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tags') AS table_tags_exists,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tags' AND column_name='user_id') AS tags_user_id,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tag_map') AS table_tag_map_exists,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tag_map' AND column_name='user_id') AS tagmap_user_id,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='people') AS table_people_exists,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='people' AND column_name='name') AS people_name,
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='people' AND column_name='display_name') AS people_display_name,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='entity_people') AS table_entity_people_exists;

-- ============================================
-- 4. Table List
-- ============================================
SELECT 
    '=== ALL PUBLIC TABLES ===' AS section;

SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('todos', 'notes', 'habits', 'spaces') THEN '✅ Core'
        WHEN table_name IN ('tags', 'tag_map', 'people', 'entity_people') THEN '🔗 Phase 8'
        ELSE '📦 Other'
    END AS category
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================
-- 5. Current User Context
-- ============================================
SELECT 
    '=== USER CONTEXT ===' AS section;

SELECT
    current_setting('request.jwt.claim.sub', true) AS viewer_user_id,
    current_setting('request.jwt.claim.role', true) AS viewer_role,
    current_user AS postgres_user,
    CASE 
        WHEN current_setting('request.jwt.claim.sub', true) IS NOT NULL THEN '✅ Authenticated'
        ELSE '⚠️ Not authenticated (running as postgres user)'
    END AS auth_status;

-- ============================================
-- 6. Record Counts (if tables exist)
-- ============================================
SELECT 
    '=== RECORD COUNTS ===' AS section;

DO $$
DECLARE
    v_todos_count INTEGER := 0;
    v_notes_count INTEGER := 0;
    v_habits_count INTEGER := 0;
    v_spaces_count INTEGER := 0;
    v_tags_count INTEGER := 0;
    v_people_count INTEGER := 0;
BEGIN
    -- Get counts for each table if they exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='todos') THEN
        SELECT COUNT(*) INTO v_todos_count FROM public.todos;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notes') THEN
        SELECT COUNT(*) INTO v_notes_count FROM public.notes;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='habits') THEN
        SELECT COUNT(*) INTO v_habits_count FROM public.habits;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='spaces') THEN
        SELECT COUNT(*) INTO v_spaces_count FROM public.spaces;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tags') THEN
        SELECT COUNT(*) INTO v_tags_count FROM public.tags;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='people') THEN
        SELECT COUNT(*) INTO v_people_count FROM public.people;
    END IF;
    
    -- Output results as a notice
    RAISE NOTICE 'todos: %, notes: %, habits: %, spaces: %, tags: %, people: %', 
        v_todos_count, v_notes_count, v_habits_count, v_spaces_count, v_tags_count, v_people_count;
END $$;

-- ============================================
-- End of diagnostics
-- ============================================
SELECT '=== DIAGNOSTICS COMPLETE ===' AS section;
