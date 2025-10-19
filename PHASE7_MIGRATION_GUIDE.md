# Phase 7 Hub Database Migration Guide

**Migration File:** `supabase/migrations/20250123000000_phase7_hub.sql`  
**Date:** 2025-01-23  
**Status:** Ready for Production

## Overview

This migration adds database support for Phase 7 Hub features:
- **Tags**: User-defined labels for categorizing items
- **People**: Contact management and item linking
- **Space Assignment**: `space_id` field on all entities
- **AI Placement Tracking**: `ai_placed` flag for unsorted items
- **Note Categorization**: `subtype` field for journal/idea/list/reference

## Schema Changes

### New Tables

#### 1. `tags` - Tag Dictionary
```sql
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW(),
  UNIQUE (owner_id, name)
);
```

**Purpose:** Stores user's personal tag vocabulary  
**RLS:** Full CRUD access where `owner_id = auth.uid()`  
**Indexes:** `owner_id`, `(owner_id, name)`

#### 2. `tag_map` - Tag-Entity Mapping
```sql
CREATE TABLE tag_map (
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('habit', 'todo', 'note')),
  entity_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT NOW(),
  PRIMARY KEY (tag_id, entity_type, entity_id)
);
```

**Purpose:** Many-to-many relationship between tags and entities  
**RLS:** Full CRUD access where `owner_id = auth.uid()`  
**Indexes:** `(entity_type, entity_id)`, `owner_id`, `tag_id`

#### 3. `people` - Contact Directory
```sql
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text,
  notes text,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
);
```

**Purpose:** User's personal contact list  
**RLS:** Full CRUD access where `owner_id = auth.uid()`  
**Indexes:** `owner_id`, `(owner_id, display_name)`

#### 4. `entity_people` - Person-Entity Mapping
```sql
CREATE TABLE entity_people (
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('habit', 'todo', 'note')),
  entity_id uuid NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT NOW(),
  PRIMARY KEY (person_id, entity_type, entity_id)
);
```

**Purpose:** Many-to-many relationship between people and entities  
**RLS:** Full CRUD access where `owner_id = auth.uid()`  
**Indexes:** `(entity_type, entity_id)`, `owner_id`, `person_id`

### Modified Tables

#### All Core Tables (`habits`, `todos`, `notes`)

**Added Columns:**
```sql
-- Space assignment
space_id uuid NULL

-- AI placement tracking
ai_placed boolean NOT NULL DEFAULT false
```

#### `notes` Table Only

**Additional Column:**
```sql
-- Note categorization
subtype text NULL CHECK (subtype IN ('journal', 'idea', 'list', 'reference'))
```

### New Indexes

**Performance Optimization:**
```sql
-- Space lookups
idx_habits_space_id ON habits(space_id) WHERE space_id IS NOT NULL
idx_todos_space_id ON todos(space_id) WHERE space_id IS NOT NULL
idx_notes_space_id ON notes(space_id) WHERE space_id IS NOT NULL

-- Unsorted item queries
idx_habits_ai_placed ON habits(owner_id, ai_placed) WHERE ai_placed = true
idx_todos_ai_placed ON todos(owner_id, ai_placed) WHERE ai_placed = true
idx_notes_ai_placed ON notes(owner_id, ai_placed) WHERE ai_placed = true

-- Note subtype filtering
idx_notes_subtype ON notes(owner_id, subtype) WHERE subtype IS NOT NULL
```

## Row-Level Security (RLS)

All new tables have comprehensive RLS policies:

### Policy Pattern
```sql
-- SELECT: Users can view their own data
CREATE POLICY "Users can view their own [table]"
  ON [table] FOR SELECT
  USING (auth.uid() = owner_id);

-- INSERT: Users can create their own data
CREATE POLICY "Users can insert their own [table]"
  ON [table] FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- UPDATE: Users can modify their own data
CREATE POLICY "Users can update their own [table]"
  ON [table] FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- DELETE: Users can remove their own data
CREATE POLICY "Users can delete their own [table]"
  ON [table] FOR DELETE
  USING (auth.uid() = owner_id);
```

**Applied to:**
- `tags` (4 policies)
- `tag_map` (4 policies)
- `people` (4 policies)
- `entity_people` (4 policies)

**Total:** 16 new RLS policies

## Migration Instructions

### Prerequisites

1. **Backup your database** before running migration
2. **Test in development environment** first
3. Ensure you have **admin access** to Supabase SQL Editor

### Running the Migration

#### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Create a new query
4. Copy the contents of `supabase/migrations/20250123000000_phase7_hub.sql`
5. Paste into the SQL Editor
6. Click **Run** to execute
7. Verify success (no errors)

#### Option 2: Supabase CLI

```bash
# If using Supabase CLI
supabase migration up

# Or apply specific migration
supabase db push
```

#### Option 3: Manual Application

```bash
# Using psql (if direct DB access)
psql $DATABASE_URL < supabase/migrations/20250123000000_phase7_hub.sql
```

### Verification Steps

After running the migration, verify the changes:

#### 1. Check Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('tags', 'tag_map', 'people', 'entity_people')
  AND table_schema = 'public';
```

**Expected:** 4 rows returned

#### 2. Verify RLS is Enabled
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('tags', 'tag_map', 'people', 'entity_people')
  AND schemaname = 'public';
```

**Expected:** All tables show `rowsecurity = true`

#### 3. Check Policies
```sql
SELECT tablename, policyname 
FROM pg_policies
WHERE tablename IN ('tags', 'tag_map', 'people', 'entity_people')
ORDER BY tablename, policyname;
```

**Expected:** 16 policies total (4 per table)

#### 4. Verify Phase 7 Fields
```sql
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('habits', 'todos', 'notes')
  AND column_name IN ('space_id', 'ai_placed', 'subtype')
ORDER BY table_name, column_name;
```

**Expected:**
- `habits`: `space_id`, `ai_placed`
- `todos`: `space_id`, `ai_placed`
- `notes`: `space_id`, `ai_placed`, `subtype`

#### 5. Test RLS (as authenticated user)
```sql
-- Should work (creates tag for authenticated user)
INSERT INTO tags (name) VALUES ('test-tag');

-- Should fail (tries to access another user's data)
SELECT * FROM tags WHERE owner_id != auth.uid();
```

## Rollback Plan

If you need to rollback the migration:

```sql
-- Drop new tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS entity_people CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS tag_map CASCADE;
DROP TABLE IF EXISTS tags CASCADE;

-- Remove added columns (if needed)
ALTER TABLE habits DROP COLUMN IF EXISTS space_id;
ALTER TABLE habits DROP COLUMN IF EXISTS ai_placed;
ALTER TABLE todos DROP COLUMN IF EXISTS space_id;
ALTER TABLE todos DROP COLUMN IF EXISTS ai_placed;
ALTER TABLE notes DROP COLUMN IF EXISTS space_id;
ALTER TABLE notes DROP COLUMN IF EXISTS ai_placed;
ALTER TABLE notes DROP COLUMN IF EXISTS subtype;
```

**⚠️ WARNING:** Rollback will **permanently delete**:
- All tags and tag mappings
- All people and person-entity links
- Space assignments on all items
- AI placement flags
- Note subtypes

## Data Migration (If Applicable)

If you have existing data that needs migration:

### Migrating Existing Tags (from JSON)
```sql
-- If you stored tags in JSON fields previously
-- Example: Extract tags from a JSON column
INSERT INTO tags (owner_id, name)
SELECT DISTINCT 
  owner_id,
  jsonb_array_elements_text(metadata->'tags') as tag_name
FROM habits
WHERE metadata ? 'tags'
ON CONFLICT (owner_id, name) DO NOTHING;
```

### Setting Default Space
```sql
-- Assign all unassigned items to a default space
UPDATE habits 
SET space_id = (SELECT id FROM spaces WHERE owner_id = habits.owner_id AND name = 'Personal' LIMIT 1)
WHERE space_id IS NULL;

UPDATE todos 
SET space_id = (SELECT id FROM spaces WHERE owner_id = todos.owner_id AND name = 'Personal' LIMIT 1)
WHERE space_id IS NULL;

UPDATE notes 
SET space_id = (SELECT id FROM spaces WHERE owner_id = notes.owner_id AND name = 'Personal' LIMIT 1)
WHERE space_id IS NULL;
```

### Inferring Note Subtypes
```sql
-- Auto-categorize notes based on content patterns
UPDATE notes 
SET subtype = CASE
  WHEN title ILIKE '%idea%' THEN 'idea'
  WHEN title ILIKE '%list%' OR body LIKE '%- %' THEN 'list'
  WHEN title ILIKE '%reference%' OR title ILIKE '%doc%' THEN 'reference'
  WHEN body ILIKE '%today%' OR body ILIKE '%diary%' THEN 'journal'
  ELSE NULL
END
WHERE subtype IS NULL;
```

## Application Code Updates

After migration, update your application code:

### 1. TypeScript Types

Update `lib/types.ts`:
```typescript
// Add new types
export interface Tag {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TagMap {
  tag_id: string;
  entity_type: 'habit' | 'todo' | 'note';
  entity_id: string;
  owner_id: string;
  created_at: string;
}

export interface Person {
  id: string;
  owner_id: string;
  display_name: string;
  email?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EntityPerson {
  person_id: string;
  entity_type: 'habit' | 'todo' | 'note';
  entity_id: string;
  owner_id: string;
  created_at: string;
}

// Update existing types
export interface Habit {
  // ... existing fields
  space_id?: string | null;
  ai_placed: boolean;
}

export interface Todo {
  // ... existing fields
  space_id?: string | null;
  ai_placed: boolean;
}

export interface Note {
  // ... existing fields
  space_id?: string | null;
  ai_placed: boolean;
  subtype?: 'journal' | 'idea' | 'list' | 'reference' | null;
}
```

### 2. Repository Methods

Add to `lib/repo/supabase.ts`:
```typescript
// Tags
async listTags(userId: string): Promise<Tag[]>
async createTag(name: string): Promise<Tag>
async deleteTag(tagId: string): Promise<void>
async listLinkedTags(entityType: string, entityId: string): Promise<Tag[]>
async linkTag(tagId: string, entityType: string, entityId: string): Promise<void>
async unlinkTag(tagId: string, entityType: string, entityId: string): Promise<void>

// People
async listPeople(userId: string): Promise<Person[]>
async createPerson(input: Partial<Person>): Promise<Person>
async updatePerson(id: string, patch: Partial<Person>): Promise<Person>
async deletePerson(id: string): Promise<void>
async listLinkedPeople(entityType: string, entityId: string): Promise<Person[]>
async linkPerson(personId: string, entityType: string, entityId: string): Promise<void>
async unlinkPerson(personId: string, entityType: string, entityId: string): Promise<void>

// Unsorted items
async countUnsorted(userId: string): Promise<number>
async listUnsorted(userId: string): Promise<AppRecord[]>
```

### 3. Schema Validation

Update `lib/schemas.ts`:
```typescript
import { z } from 'zod';

export const tagSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string().min(1).max(50),
  created_at: z.string(),
  updated_at: z.string(),
});

export const personSchema = z.object({
  id: z.string().uuid(),
  owner_id: z.string().uuid(),
  display_name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  notes: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Update existing schemas
export const habitSchema = z.object({
  // ... existing fields
  space_id: z.string().uuid().nullable().optional(),
  ai_placed: z.boolean().default(false),
});

export const noteSchema = z.object({
  // ... existing fields
  space_id: z.string().uuid().nullable().optional(),
  ai_placed: z.boolean().default(false),
  subtype: z.enum(['journal', 'idea', 'list', 'reference']).nullable().optional(),
});
```

## Performance Considerations

### Index Usage

The migration creates partial indexes for efficient queries:

```sql
-- Only indexes non-null space_id values
WHERE space_id IS NOT NULL

-- Only indexes unsorted items
WHERE ai_placed = true

-- Only indexes categorized notes
WHERE subtype IS NOT NULL
```

**Benefit:** Smaller index size, faster queries

### Query Optimization Tips

```sql
-- ✅ GOOD: Use indexed column in WHERE
SELECT * FROM habits WHERE owner_id = $1 AND ai_placed = true;

-- ✅ GOOD: Join on indexed foreign keys
SELECT h.*, t.name 
FROM habits h
JOIN tag_map tm ON (tm.entity_type = 'habit' AND tm.entity_id = h.id)
JOIN tags t ON t.id = tm.tag_id
WHERE h.owner_id = $1;

-- ❌ BAD: Function on indexed column prevents index use
SELECT * FROM notes WHERE LOWER(subtype) = 'idea';

-- ✅ GOOD: Direct comparison uses index
SELECT * FROM notes WHERE subtype = 'idea';
```

## Security Considerations

### RLS Enforcement

**Always enabled** for:
- Web/mobile clients using `anon` key
- Direct database connections as non-superuser
- Service role connections when RLS is explicitly enabled

**Bypassed for:**
- Superuser connections
- Service role connections (use carefully!)

### Best Practices

1. **Never expose service role key** to client apps
2. **Use `auth.uid()`** in all policies for user identification
3. **Test policies** with non-admin users before production
4. **Audit policy changes** regularly
5. **Monitor slow queries** on RLS-enabled tables

## Troubleshooting

### Common Issues

#### Issue: "permission denied for table tags"
**Cause:** RLS is enabled but user is not authenticated  
**Solution:** Ensure user is logged in via `supabase.auth.signIn()`

#### Issue: "insert or update on table violates foreign key constraint"
**Cause:** Trying to link tag/person that doesn't exist  
**Solution:** Create tag/person first, then create mapping

#### Issue: "duplicate key value violates unique constraint"
**Cause:** Tag name already exists for user  
**Solution:** Check existing tags before creating, or use `ON CONFLICT DO NOTHING`

#### Issue: "column does not exist: space_id"
**Cause:** Migration didn't run completely  
**Solution:** Re-run migration or manually add missing columns

### Debug Queries

```sql
-- Check if migration ran
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'habits' AND column_name = 'ai_placed';

-- Count items by space
SELECT space_id, COUNT(*) 
FROM habits 
GROUP BY space_id;

-- Find orphaned tag mappings
SELECT tm.* 
FROM tag_map tm
LEFT JOIN habits h ON (tm.entity_type = 'habit' AND tm.entity_id = h.id)
LEFT JOIN todos t ON (tm.entity_type = 'todo' AND tm.entity_id = t.id)
LEFT JOIN notes n ON (tm.entity_type = 'note' AND tm.entity_id = n.id)
WHERE h.id IS NULL AND t.id IS NULL AND n.id IS NULL;
```

## Next Steps

After successful migration:

1. ✅ Verify all tests pass
2. ✅ Update API documentation
3. ✅ Deploy application code changes
4. ✅ Monitor error logs for RLS violations
5. ✅ Gather user feedback on new features

## Support

For migration issues:
1. Check [Supabase Docs](https://supabase.com/docs)
2. Review existing Phase 4/6 migrations
3. Test in development environment first
4. Contact team if issues persist

---

**Migration Status:** ✅ Ready for Production  
**Estimated Time:** ~30 seconds  
**Risk Level:** Low (safe ADD COLUMN IF NOT EXISTS)  
**Rollback:** Available (see Rollback Plan)
