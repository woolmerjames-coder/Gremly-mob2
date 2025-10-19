# Phase 7 Database Schema - Quick Reference

## New Tables

### `tags` - Tag Dictionary
```typescript
{
  id: uuid,
  owner_id: uuid,
  name: string,           // Unique per user
  created_at: timestamp,
  updated_at: timestamp
}
```

### `tag_map` - Tag-Entity Links
```typescript
{
  tag_id: uuid,
  entity_type: 'habit' | 'todo' | 'note',
  entity_id: uuid,
  owner_id: uuid,
  created_at: timestamp
}
```

### `people` - Contacts
```typescript
{
  id: uuid,
  owner_id: uuid,
  display_name: string,
  email?: string,
  notes?: string,
  created_at: timestamp,
  updated_at: timestamp
}
```

### `entity_people` - Person-Entity Links
```typescript
{
  person_id: uuid,
  entity_type: 'habit' | 'todo' | 'note',
  entity_id: uuid,
  owner_id: uuid,
  created_at: timestamp
}
```

## Updated Core Tables

### `habits`, `todos`, `notes`
```typescript
{
  // ... existing fields
  space_id?: uuid,        // NEW: Space assignment
  ai_placed: boolean,     // NEW: Unsorted item flag (default: false)
}
```

### `notes` Only
```typescript
{
  // ... all above fields, plus:
  subtype?: 'journal' | 'idea' | 'list' | 'reference'  // NEW: Note category
}
```

## Common Queries

### Get All Tags for User
```sql
SELECT * FROM tags WHERE owner_id = auth.uid();
```

### Get Tags for Specific Item
```sql
SELECT t.* 
FROM tags t
JOIN tag_map tm ON tm.tag_id = t.id
WHERE tm.entity_type = 'habit' 
  AND tm.entity_id = $1
  AND tm.owner_id = auth.uid();
```

### Get All Items with Specific Tag
```sql
-- Habits with tag
SELECT h.* 
FROM habits h
JOIN tag_map tm ON (tm.entity_type = 'habit' AND tm.entity_id = h.id)
WHERE tm.tag_id = $1 AND h.owner_id = auth.uid();

-- Todos with tag
SELECT t.* 
FROM todos t
JOIN tag_map tm ON (tm.entity_type = 'todo' AND tm.entity_id = t.id)
WHERE tm.tag_id = $1 AND t.owner_id = auth.uid();

-- Notes with tag
SELECT n.* 
FROM notes n
JOIN tag_map tm ON (tm.entity_type = 'note' AND tm.entity_id = n.id)
WHERE tm.tag_id = $1 AND n.owner_id = auth.uid();
```

### Add Tag to Item
```sql
INSERT INTO tag_map (tag_id, entity_type, entity_id, owner_id)
VALUES ($1, $2, $3, auth.uid());
```

### Remove Tag from Item
```sql
DELETE FROM tag_map 
WHERE tag_id = $1 
  AND entity_type = $2 
  AND entity_id = $3 
  AND owner_id = auth.uid();
```

### Get All People
```sql
SELECT * FROM people WHERE owner_id = auth.uid();
```

### Get People Linked to Item
```sql
SELECT p.* 
FROM people p
JOIN entity_people ep ON ep.person_id = p.id
WHERE ep.entity_type = 'todo' 
  AND ep.entity_id = $1
  AND ep.owner_id = auth.uid();
```

### Link Person to Item
```sql
INSERT INTO entity_people (person_id, entity_type, entity_id, owner_id)
VALUES ($1, $2, $3, auth.uid());
```

### Get Unsorted Items
```sql
-- All unsorted habits
SELECT * FROM habits 
WHERE owner_id = auth.uid() AND ai_placed = true;

-- Count unsorted across all types
SELECT 
  (SELECT COUNT(*) FROM habits WHERE owner_id = auth.uid() AND ai_placed = true) +
  (SELECT COUNT(*) FROM todos WHERE owner_id = auth.uid() AND ai_placed = true) +
  (SELECT COUNT(*) FROM notes WHERE owner_id = auth.uid() AND ai_placed = true) as unsorted_count;
```

### Get Items by Space
```sql
SELECT * FROM habits 
WHERE owner_id = auth.uid() 
  AND space_id = $1;

-- Get unassigned items
SELECT * FROM habits 
WHERE owner_id = auth.uid() 
  AND space_id IS NULL;
```

### Get Notes by Subtype
```sql
-- Journal entries
SELECT * FROM notes 
WHERE owner_id = auth.uid() 
  AND subtype = 'journal';

-- Ideas
SELECT * FROM notes 
WHERE owner_id = auth.uid() 
  AND subtype = 'idea';

-- All notes (including those without subtype)
SELECT * FROM notes 
WHERE owner_id = auth.uid();
```

## RLS Quick Check

All tables have 4 policies each:
- `SELECT` - Can view own data
- `INSERT` - Can create own data
- `UPDATE` - Can modify own data
- `DELETE` - Can remove own data

**Enforcement:** `auth.uid() = owner_id`

## Performance Tips

✅ **Indexed Queries (Fast)**
```sql
-- Uses partial index
SELECT * FROM habits WHERE owner_id = $1 AND ai_placed = true;

-- Uses compound index
SELECT * FROM tags WHERE owner_id = $1 AND name = $2;

-- Uses foreign key index
SELECT * FROM tag_map WHERE tag_id = $1;
```

❌ **Non-Indexed Queries (Slower)**
```sql
-- Full table scan
SELECT * FROM habits WHERE LOWER(title) LIKE '%workout%';

-- Function on indexed column
SELECT * FROM notes WHERE LOWER(subtype) = 'idea';
```

## Cascade Behavior

**Deleting a Tag:**
- ✅ Automatically removes all `tag_map` entries (CASCADE)

**Deleting a Person:**
- ✅ Automatically removes all `entity_people` entries (CASCADE)

**Deleting a User:**
- ✅ Automatically removes all tags (CASCADE)
- ✅ Automatically removes all tag_map entries (CASCADE)
- ✅ Automatically removes all people (CASCADE)
- ✅ Automatically removes all entity_people entries (CASCADE)

**Deleting a Habit/Todo/Note:**
- ❌ Does NOT automatically remove tag_map/entity_people entries
- 🔧 Manual cleanup required (or add triggers)

## Migration Status

**Run Migration:**
```bash
# Copy supabase/migrations/20250123000000_phase7_hub.sql
# Paste into Supabase SQL Editor
# Click Run
```

**Verify:**
```sql
-- Check tables exist
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name IN ('tags', 'tag_map', 'people', 'entity_people');
-- Should return: 4

-- Check RLS enabled
SELECT COUNT(*) FROM pg_tables 
WHERE tablename IN ('tags', 'tag_map', 'people', 'entity_people') 
  AND rowsecurity = true;
-- Should return: 4

-- Check policies
SELECT COUNT(*) FROM pg_policies 
WHERE tablename IN ('tags', 'tag_map', 'people', 'entity_people');
-- Should return: 16
```

## See Also

- `PHASE7_MIGRATION_GUIDE.md` - Full migration documentation
- `supabase/migrations/20250123000000_phase7_hub.sql` - Migration SQL
- `lib/types.ts` - TypeScript types
- `lib/repo/supabase.ts` - Repository implementation
