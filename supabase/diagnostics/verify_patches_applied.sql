-- ============================================
-- Post-Patch Verification
-- Run this AFTER applying patches to verify everything is correct
-- ============================================

-- 1. Column existence check
SELECT 
  '=== COLUMN VERIFICATION ===' AS section;

SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='todos' AND column_name='due_time') AS todos_due_time,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tags' AND column_name='user_id') AS tags_user_id,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tag_map' AND column_name='user_id') AS tagmap_user_id,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='people' AND column_name='display_name') AS people_display_name;

-- Expected: All TRUE

-- 2. RLS Status
SELECT 
  '=== RLS STATUS ===' AS section;

SELECT 
  c.relname AS table, 
  c.relrowsecurity AS rls_enabled,
  CASE WHEN c.relrowsecurity THEN '✅ Enabled' ELSE '⚠️ Disabled' END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relname IN ('tags', 'tag_map')
ORDER BY c.relname;

-- Expected: Both should show ✅ Enabled

-- 3. Policy count
SELECT 
  '=== POLICY COUNT ===' AS section;

SELECT 
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tags', 'tag_map')
GROUP BY tablename
ORDER BY tablename;

-- Expected: tags: 4 policies, tag_map: 4 policies

-- 4. Index verification
SELECT 
  '=== INDEX VERIFICATION ===' AS section;

SELECT
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('tags', 'tag_map')
  AND indexname IN ('idx_tags_user_id', 'idx_tag_map_user_id')
ORDER BY tablename, indexname;

-- Expected: idx_tags_user_id, idx_tag_map_user_id

-- 5. Sample schema for key tables
SELECT 
  '=== SCHEMA SAMPLE ===' AS section;

SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('todos', 'tags', 'tag_map', 'people')
  AND column_name IN ('due_time', 'user_id', 'display_name', 'name')
ORDER BY table_name, column_name;

-- 6. Final status
SELECT 
  '=== ✅ VERIFICATION COMPLETE ===' AS section;
