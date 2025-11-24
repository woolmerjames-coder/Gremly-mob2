-- Phase 7: Add list attributes to todos, notes, and habits
-- Date: 2025-11-24
-- 
-- This migration adds support for structured list items as a first-class attribute
-- on todos, notes, and habits, replacing the legacy subtype='list' pattern on notes.
--
-- Changes:
-- 1. Add has_list, list_items, body_legacy columns to todos, notes, habits
-- 2. Migrate existing notes with subtype='list' to the new structure
-- 3. Convert list subtype to 'reference' after migration

-- ============================================================================
-- TODOS: Add list columns
-- ============================================================================

ALTER TABLE todos ADD COLUMN IF NOT EXISTS has_list boolean NOT NULL DEFAULT false;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS list_items jsonb;
ALTER TABLE todos ADD COLUMN IF NOT EXISTS body_legacy text;

COMMENT ON COLUMN todos.has_list IS 'Whether this todo contains a structured list';
COMMENT ON COLUMN todos.list_items IS 'JSONB array of list items: [{ "id": "uuid", "text": "...", "checked": false }]';
COMMENT ON COLUMN todos.body_legacy IS 'Original body text before list parsing (for reference/rollback)';

-- ============================================================================
-- NOTES: Add list columns
-- ============================================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS has_list boolean NOT NULL DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS list_items jsonb;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS body_legacy text;

COMMENT ON COLUMN notes.has_list IS 'Whether this note contains a structured list';
COMMENT ON COLUMN notes.list_items IS 'JSONB array of list items: [{ "id": "uuid", "text": "...", "checked": false }]';
COMMENT ON COLUMN notes.body_legacy IS 'Original body text before list parsing (for reference/rollback)';

-- ============================================================================
-- HABITS: Add list columns
-- ============================================================================

ALTER TABLE habits ADD COLUMN IF NOT EXISTS has_list boolean NOT NULL DEFAULT false;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS list_items jsonb;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS body_legacy text;

COMMENT ON COLUMN habits.has_list IS 'Whether this habit contains a structured list';
COMMENT ON COLUMN habits.list_items IS 'JSONB array of list items: [{ "id": "uuid", "text": "...", "checked": false }]';
COMMENT ON COLUMN habits.body_legacy IS 'Original body text before list parsing (for reference/rollback)';

-- ============================================================================
-- DATA MIGRATION: Convert existing list-subtype notes
-- ============================================================================

-- Step 1: Mark all notes with subtype='list' as having lists
-- and preserve their original body text in body_legacy
UPDATE notes
SET 
  has_list = true,
  body_legacy = body
WHERE 
  subtype = 'list' 
  AND body IS NOT NULL;

-- Step 2: Parse list items from body text into structured JSONB
-- This converts markdown-style lists (lines starting with -, *, or numbers) into structured data
-- Format: Each line becomes { "id": "<index>", "text": "<trimmed>", "checked": false }
--
-- NOTE: This is a best-effort SQL parser. Lines that don't match list patterns are skipped.
-- The app will handle any edge cases on first open.

WITH list_notes AS (
  SELECT 
    id,
    body,
    -- Split body into lines and filter for list patterns
    regexp_split_to_array(body, E'\n') AS lines
  FROM notes
  WHERE subtype = 'list' AND body IS NOT NULL
),
parsed_items AS (
  SELECT 
    id,
    jsonb_agg(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', regexp_replace(line, E'^\\s*[-*•]\\s*|^\\s*\\d+\\.\\s*', ''),
        'checked', false
      )
      ORDER BY line_num
    ) AS items
  FROM (
    SELECT 
      id,
      unnest(lines) AS line,
      row_number() OVER (PARTITION BY id ORDER BY ordinality) AS line_num
    FROM list_notes
    CROSS JOIN LATERAL unnest(lines) WITH ORDINALITY
    WHERE 
      -- Match lines starting with: -, *, •, or numbers followed by .
      unnest ~ E'^\\s*[-*•]\\s*|^\\s*\\d+\\.\\s*'
      AND trim(unnest) != ''
  ) AS expanded_lines
  GROUP BY id
)
UPDATE notes
SET list_items = parsed_items.items
FROM parsed_items
WHERE notes.id = parsed_items.id;

-- Step 3: Convert subtype from 'list' to 'reference'
-- (We're removing 'list' as a subtype since it's now an attribute)
-- Using 'reference' as the fallback subtype for list notes
UPDATE notes
SET subtype = 'reference'
WHERE subtype = 'list';

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing after migration)
-- ============================================================================

-- Uncomment to verify migration results:

-- SELECT 
--   id, 
--   title,
--   has_list,
--   body_legacy,
--   list_items,
--   subtype
-- FROM notes 
-- WHERE has_list = true
-- LIMIT 10;

-- SELECT 
--   'todos' as table_name,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE has_list = true) as with_lists
-- FROM todos
-- UNION ALL
-- SELECT 
--   'notes' as table_name,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE has_list = true) as with_lists
-- FROM notes
-- UNION ALL
-- SELECT 
--   'habits' as table_name,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE has_list = true) as with_lists
-- FROM habits;
