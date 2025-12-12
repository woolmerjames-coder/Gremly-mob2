-- ============================================================================
-- Mind Drop Classification Audit Queries
-- ============================================================================
-- These queries help identify misclassifications, data inconsistencies,
-- and edge cases in real user data.
--
-- Run against Supabase with appropriate permissions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TODOS WITH NULL TITLE BUT NON-EMPTY BODY
-- These may indicate AI enrichment failures or improper title extraction
-- ----------------------------------------------------------------------------
SELECT 
    id,
    owner_id,
    name,
    title,
    LEFT(body, 100) as body_preview,
    created_at,
    origin,
    (views->>'minddrop_stage')::text as minddrop_stage
FROM todos
WHERE 
    (title IS NULL OR title = '' OR name IS NULL OR name = '')
    AND body IS NOT NULL 
    AND body != ''
    AND archived = false
ORDER BY created_at DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 2. LOGS (NOTES) WITH DUE_DATE SET
-- Logs should not have due dates - these may be misclassified todos
-- ----------------------------------------------------------------------------
SELECT 
    id,
    owner_id,
    title,
    LEFT(body, 100) as body_preview,
    subtype,
    date as due_date,
    created_at,
    origin
FROM notes
WHERE 
    date IS NOT NULL
    AND archived = false
ORDER BY created_at DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 3. HABITS WITH DUE_DATE OR ONE-OFF SCHEDULED TIMES
-- Habits are recurring and should not have specific due dates
-- ----------------------------------------------------------------------------
SELECT 
    id,
    owner_id,
    name,
    LEFT(notes, 100) as notes_preview,
    created_at,
    origin
FROM habits
WHERE 
    archived = false
    -- Habits don't have due_date column, but check for any scheduling anomalies
ORDER BY created_at DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 4. HAS_LIST=TRUE BUT LIST_ITEMS_COUNT=0 OR EMPTY LIST_ITEMS
-- Data consistency check for list flags
-- ----------------------------------------------------------------------------
SELECT 
    'todos' as table_name,
    id,
    owner_id,
    name,
    has_list,
    COALESCE(jsonb_array_length(list_items), 0) as list_items_length,
    created_at
FROM todos
WHERE 
    has_list = true
    AND (list_items IS NULL OR jsonb_array_length(list_items) = 0)
    AND archived = false

UNION ALL

SELECT 
    'notes' as table_name,
    id,
    owner_id,
    title as name,
    has_list,
    COALESCE(jsonb_array_length(list_items), 0) as list_items_length,
    created_at
FROM notes
WHERE 
    has_list = true
    AND (list_items IS NULL OR jsonb_array_length(list_items) = 0)
    AND archived = false

ORDER BY created_at DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 5. UNUSUALLY HIGH SUBTYPE IS NULL RATES FOR NOTES
-- Notes should generally have a subtype (general, journal, idea)
-- ----------------------------------------------------------------------------
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total_notes,
    COUNT(*) FILTER (WHERE subtype IS NULL) as null_subtype,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE subtype IS NULL) / NULLIF(COUNT(*), 0),
        1
    ) as null_subtype_pct
FROM notes
WHERE 
    created_at > NOW() - INTERVAL '30 days'
    AND archived = false
GROUP BY DATE_TRUNC('day', created_at)
HAVING COUNT(*) FILTER (WHERE subtype IS NULL) > 0
ORDER BY date DESC;

-- Breakdown by subtype overall
SELECT 
    subtype,
    COUNT(*) as count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pct
FROM notes
WHERE 
    created_at > NOW() - INTERVAL '30 days'
    AND archived = false
GROUP BY subtype
ORDER BY count DESC;

-- ----------------------------------------------------------------------------
-- 6. DUPLICATES CREATED WITHIN 5 SECONDS WITH SIMILAR CONTENT
-- May indicate double-submission bugs or race conditions
-- ----------------------------------------------------------------------------
WITH recent_todos AS (
    SELECT 
        id,
        owner_id,
        name,
        created_at,
        MD5(LOWER(TRIM(COALESCE(name, '') || COALESCE(body, '')))) as content_hash
    FROM todos
    WHERE created_at > NOW() - INTERVAL '7 days'
),
duplicates AS (
    SELECT 
        a.id as id_a,
        b.id as id_b,
        a.owner_id,
        a.name,
        a.created_at as created_a,
        b.created_at as created_b,
        ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) as seconds_apart
    FROM recent_todos a
    JOIN recent_todos b ON 
        a.owner_id = b.owner_id
        AND a.content_hash = b.content_hash
        AND a.id < b.id
        AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) < 5
)
SELECT * FROM duplicates
ORDER BY created_a DESC
LIMIT 50;

-- Similar for notes
WITH recent_notes AS (
    SELECT 
        id,
        owner_id,
        title,
        created_at,
        MD5(LOWER(TRIM(COALESCE(title, '') || COALESCE(body, '')))) as content_hash
    FROM notes
    WHERE created_at > NOW() - INTERVAL '7 days'
),
duplicates AS (
    SELECT 
        a.id as id_a,
        b.id as id_b,
        a.owner_id,
        a.title,
        a.created_at as created_a,
        b.created_at as created_b,
        ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) as seconds_apart
    FROM recent_notes a
    JOIN recent_notes b ON 
        a.owner_id = b.owner_id
        AND a.content_hash = b.content_hash
        AND a.id < b.id
        AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) < 5
)
SELECT * FROM duplicates
ORDER BY created_a DESC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 7. CLASSIFICATION DISTRIBUTION OVER TIME
-- Monitor for shifts in classification patterns
-- ----------------------------------------------------------------------------
SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) FILTER (WHERE TRUE) as total,
    COUNT(*) FILTER (WHERE origin = 'catchall') as from_catchall,
    -- Can't easily get bucket from combined query, so split by table
    'todos' as entity_type
FROM todos
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)

UNION ALL

SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE origin = 'catchall') as from_catchall,
    'notes' as entity_type
FROM notes
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)

UNION ALL

SELECT 
    DATE_TRUNC('day', created_at) as date,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE origin = 'catchall') as from_catchall,
    'habits' as entity_type
FROM habits
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)

ORDER BY date DESC, entity_type;

-- ----------------------------------------------------------------------------
-- 8. MINDDROP STAGE DISTRIBUTION
-- Check for items stuck in intermediate stages
-- ----------------------------------------------------------------------------
SELECT 
    (views->>'minddrop_stage')::text as stage,
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM todos
WHERE 
    views ? 'minddrop_stage'
    AND created_at > NOW() - INTERVAL '7 days'
GROUP BY (views->>'minddrop_stage')::text
ORDER BY count DESC;

SELECT 
    (views->>'minddrop_stage')::text as stage,
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM notes
WHERE 
    views ? 'minddrop_stage'
    AND created_at > NOW() - INTERVAL '7 days'
GROUP BY (views->>'minddrop_stage')::text
ORDER BY count DESC;

-- ----------------------------------------------------------------------------
-- 9. ITEMS WITH AI_PENDING=TRUE FOR TOO LONG
-- May indicate stalled enrichment
-- ----------------------------------------------------------------------------
SELECT 
    'todos' as table_name,
    id,
    owner_id,
    name,
    created_at,
    (views->>'minddrop_stage')::text as stage,
    (views->>'ai_pending')::boolean as ai_pending
FROM todos
WHERE 
    (views->>'ai_pending')::boolean = true
    AND created_at < NOW() - INTERVAL '1 hour'
    AND archived = false

UNION ALL

SELECT 
    'notes' as table_name,
    id,
    owner_id,
    title as name,
    created_at,
    (views->>'minddrop_stage')::text as stage,
    (views->>'ai_pending')::boolean as ai_pending
FROM notes
WHERE 
    (views->>'ai_pending')::boolean = true
    AND created_at < NOW() - INTERVAL '1 hour'
    AND archived = false

ORDER BY created_at ASC
LIMIT 50;

-- ----------------------------------------------------------------------------
-- 10. DROP_ID COLLISIONS OR MISSING
-- Check for drop_id integrity
-- ----------------------------------------------------------------------------
-- Missing drop_ids on recent items (should have them)
SELECT 
    'todos' as table_name,
    id,
    owner_id,
    name,
    drop_id,
    origin,
    created_at
FROM todos
WHERE 
    drop_id IS NULL
    AND origin = 'catchall'
    AND created_at > NOW() - INTERVAL '7 days'

UNION ALL

SELECT 
    'notes' as table_name,
    id,
    owner_id,
    title as name,
    drop_id,
    origin,
    created_at
FROM notes
WHERE 
    drop_id IS NULL
    AND origin = 'catchall'
    AND created_at > NOW() - INTERVAL '7 days'

ORDER BY created_at DESC
LIMIT 50;

-- Duplicate drop_ids (should be unique per item)
SELECT 
    drop_id,
    COUNT(*) as count,
    array_agg(id) as entity_ids
FROM (
    SELECT drop_id, id FROM todos WHERE drop_id IS NOT NULL
    UNION ALL
    SELECT drop_id, id FROM notes WHERE drop_id IS NOT NULL
    UNION ALL
    SELECT drop_id, id FROM habits WHERE drop_id IS NOT NULL
) all_drops
GROUP BY drop_id
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 50;
