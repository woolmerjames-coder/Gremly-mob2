# Schema ↔ Code Alignment Audit Report

**Phase 10R: Database Schema Alignment Reset**  
**Date:** October 21, 2025  
**Branch:** `feat/phase-10R-alignment-reset`

---

## **A. Entities & Fields Used by Code**

Based on `lib/types.ts`, `lib/repo/types.ts`, and `lib/repo/IRepo.ts`:

**Core Entities:**
- `Habit`, `Todo`, `Note` (main content types)
- `Space` (organizational containers)
- `SpaceChat` (space-specific conversations)
- `Tag` (labeling system)
- `TagMap` (tag-to-entity linkage)
- `Person` (contacts/relationships)
- `EntityPerson` (person-to-entity linkage)

**Field Expectations:**
- **Tag**: `id`, `owner_id`, `name`, `color` (lib/types.ts) vs `id`, `user_id`, `name` (lib/repo/types.ts)
- **TagMap**: `id`, `tag_id`, `entity_type`, `entity_id`, `owner_id` (lib/types.ts) vs `id`, `tag_id`, `item_type`, `item_id`, `user_id` (lib/repo/types.ts)
- **EntityPerson**: `id`, `person_id`, `entity_type`, `entity_id`, `owner_id` (lib/types.ts) vs `id`, `person_id`, `item_type`, `item_id`, `user_id` (lib/repo/types.ts)

---

## **B. Present in Database Migrations**

**Tags & Tag Mapping** (`20251020032701_phase8_tags_and_map.sql`):
```sql
-- tags table uses user_id (NOT owner_id)
create table public.tags (
  id uuid primary key,
  user_id uuid not null,  -- ❌ Mismatch: Code expects owner_id
  name text not null,
  -- No color column! ❌
);

-- tag_map uses item_id/item_type (NOT entity_id/entity_type)
create table public.tag_map (
  id uuid primary key,
  user_id uuid not null,  -- ❌ Mismatch: Code expects owner_id
  item_id uuid not null,   -- ❌ Mismatch: lib/types.ts expects entity_id
  tag_id uuid not null,
  item_type text not null, -- ❌ Mismatch: lib/types.ts expects entity_type
);
```

**Entity-People Linking** (`20250123000000_phase7_hub.sql`):
```sql
-- entity_people has NO id column! ❌ CRITICAL
CREATE TABLE entity_people (
  -- NO id uuid column (lib/types.ts EntityPerson expects it!)
  person_id uuid NOT NULL,
  entity_type text NOT NULL,  -- ✅ Matches lib/types.ts
  entity_id uuid NOT NULL,     -- ✅ Matches lib/types.ts
  owner_id uuid NOT NULL,      -- ✅ Matches lib/types.ts
  PRIMARY KEY (person_id, entity_type, entity_id)  -- Composite PK, no id!
);
```

**Completed At** (`20251022_add_completed_at.sql`):
```sql
alter table todos  add column if not exists completed_at timestamptz; -- ✅
alter table habits add column if not exists completed_at timestamptz; -- ✅
```

---

## **C. Critical Mismatches**

### **1. Tag Field Naming Conflict** 🚨 HIGH PRIORITY

**Problem:** 
- DB migration uses `user_id`
- `lib/types.ts` (main types) uses `owner_id`  
- `lib/repo/types.ts` (repo types) uses `user_id`
- **Impact:** Runtime errors when code tries to access `Tag.owner_id`

**Evidence:**
```typescript
// lib/types.ts
export interface Tag {
  id: ID;
  owner_id: ID; // ← Code expects this
  name: string;
  color?: string | null;
}

// lib/repo/types.ts
export interface Tag {
  id: string;
  user_id: string; // ← Different field name!
  name: string;
}

// DB (20251020032701_phase8_tags_and_map.sql)
create table tags (
  user_id uuid not null, -- ← DB has this
);
```

**Recommendation:**
- **Option A (Preferred):** Standardize on `owner_id` across all tables (matches RLS convention)
  ```sql
  ALTER TABLE tags RENAME COLUMN user_id TO owner_id;
  ALTER TABLE tag_map RENAME COLUMN user_id TO owner_id;
  ```
- **Option B:** Update `lib/types.ts` to use `user_id` (breaks naming consistency)

---

### **2. TagMap Field Naming Conflict** 🚨 HIGH PRIORITY

**Problem:**
- DB uses `item_id` + `item_type`
- `lib/types.ts` expects `entity_id` + `entity_type`
- `lib/repo/types.ts` uses `item_id` + `item_type`
- **Impact:** Field access errors, query failures

**Evidence:**
```typescript
// lib/types.ts
export interface TagMap {
  id: ID;
  tag_id: ID;
  entity_type: EntityType;  // ← Code expects this
  entity_id: ID;            // ← Code expects this
  owner_id: ID;
}

// lib/repo/types.ts
export interface TagMap {
  id: string;
  tag_id: string;
  item_type: ItemType;  // ← Different name
  item_id: string;      // ← Different name
  user_id: string;
}
```

**Recommendation:**
- **Option A:** Keep DB as-is, update `lib/types.ts` to use `item_id`/`item_type`
- **Option B:** Standardize on `entity_*` naming (requires migration)
  ```sql
  ALTER TABLE tag_map RENAME COLUMN item_id TO entity_id;
  ALTER TABLE tag_map RENAME COLUMN item_type TO entity_type;
  ```

---

### **3. EntityPerson Missing `id` Column** 🚨 CRITICAL

**Problem:**
- DB table uses composite primary key `(person_id, entity_type, entity_id)` with NO `id` column
- TypeScript type `EntityPerson` has `id: ID` field
- `unlinkPerson()` method tries to delete by `id`
- **Impact:** Runtime errors, broken unlinking functionality

**Evidence:**
```typescript
// lib/types.ts
export interface EntityPerson {
  id: ID;  // ← Type expects this field
  person_id: ID;
  entity_type: EntityType;
  entity_id: ID;
  owner_id: ID;
}

// DB (20250123000000_phase7_hub.sql)
CREATE TABLE entity_people (
  -- NO id column! ❌
  person_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  PRIMARY KEY (person_id, entity_type, entity_id)
);

// lib/repo/supabase.ts:1263
async unlinkPerson(entityPersonId: string): Promise<void> {
  // This will FAIL - no id column exists!
  await supabase.from('entity_people').delete().eq('id', entityPersonId);
}
```

**Recommendation:**
- **Option A (Safest):** Add `id` column to `entity_people` table
  ```sql
  ALTER TABLE entity_people 
    ADD COLUMN id uuid DEFAULT gen_random_uuid() PRIMARY KEY;
  
  -- Update existing records
  UPDATE entity_people SET id = gen_random_uuid() WHERE id IS NULL;
  ```
- **Option B:** Change `unlinkPerson()` to delete by composite key (breaks API contract)

---

### **4. Tag Missing `color` Column** ⚠️ MEDIUM PRIORITY

**Problem:**
- `lib/types.ts` defines `Tag.color?: string | null`
- DB table has no `color` column
- **Impact:** Color data cannot be persisted

**Recommendation:**
```sql
ALTER TABLE tags ADD COLUMN color text NULL;
```

---

### **5. Direct Supabase Calls Bypassing Repo Layer** ⚠️ MEDIUM PRIORITY

**Problem:** `app/(dev)/DevLogin.tsx` makes direct Supabase calls, bypassing repo abstraction

**Evidence:**
```typescript
// app/(dev)/DevLogin.tsx:87
const { data: testQuery } = await supabase
  .from('todos')
  .select('id')
  .limit(1);

// app/(dev)/DevLogin.tsx:116
const { data: result } = await supabase
  .from('todos')
  .insert([payload])
  .select('id')
  .single();
```

**Recommendation:** Refactor to use repo methods:
```typescript
// Replace line 87:
const allTodos = await repo.listByType('todo', { limit: 1 });

// Replace line 116:
const newTodo = await repo.create({
  type: 'todo',
  name: 'Test Todo',
  space_id: null,
});
```

---

### **6. SupabaseRepo Using Mismatched Field Names** 🚨 HIGH PRIORITY

**Problem:** Code attempts to access non-existent fields

**Examples:**
```typescript
// lib/repo/supabase.ts:1185 - Tries to use .eq('item_id', params.itemId)
async unlinkTag(params: { itemId: string; tagId: string }): Promise<void> {
  await supabase.from('tag_map')
    .delete()
    .eq('user_id', this.currentUserId)
    .eq('item_id', params.itemId)  // ✅ Matches DB (item_id exists)
    .eq('tag_id', params.tagId);
}

// But insertPayload uses entity_id! ❌
const insertPayload: DBTagMapInsert = {
  owner_id: this.currentUserId,
  entity_id: params.itemId,    // ❌ DB expects item_id!
  entity_type: params.itemType, // ❌ DB expects item_type!
  tag_id: params.tagId,
};
```

**Impact:** Insert will fail because payload uses wrong field names

---

## **D. Generated Types vs Manual Types**

The repo uses both generated Supabase types (prefixed `DB*`) and manual types from `lib/types.ts`. This creates conflicts:

**Current Pattern:**
```typescript
// Repo inserts use DBTagInsert
const insertPayload: DBTagInsert = {
  owner_id: userId,  // ← Assumes DB has owner_id
  name,
};

// But actual DB has user_id!
```

**Recommendation:** Ensure generated types (`lib/repo/supabase-types.ts`) match actual DB schema

---

## **E. Final Actionable Checklist**

### **Immediate (Breaking Issues):**
- [ ] Add `id` column to `entity_people` table (CRITICAL - unlinkPerson is broken)
- [ ] Standardize field naming: `owner_id` vs `user_id` across all tables
- [ ] Fix `TagMap` insert payload to use `item_id`/`item_type` (not `entity_id`/`entity_type`)
- [ ] Align `lib/types.ts` TagMap interface to match DB (entity→item renaming)

### **High Priority:**
- [ ] Add `color` column to `tags` table
- [ ] Refactor `DevLogin.tsx` to use repo layer instead of direct Supabase calls
- [ ] Regenerate Supabase types to ensure `DB*Insert` types match actual schema

### **Medium Priority:**
- [ ] Decide on canonical naming: `entity` vs `item` for linking tables
- [ ] Add generated column migration for backward compatibility if needed:
  ```sql
  ALTER TABLE tag_map ADD COLUMN entity_id uuid GENERATED ALWAYS AS (item_id) STORED;
  ```

### **Documentation:**
- [ ] Update type definitions in `lib/types.ts` to match schema truth
- [ ] Document field naming conventions (owner_id vs user_id, entity vs item)

---

## **F. Recommended Migration (Immediate Fix)**

```sql
-- Fix 1: Add missing id to entity_people
ALTER TABLE entity_people ADD COLUMN id uuid DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX entity_people_id_idx ON entity_people(id);
-- Keep composite PK for uniqueness constraint
ALTER TABLE entity_people ADD CONSTRAINT entity_people_id_unique UNIQUE(id);

-- Fix 2: Add missing color to tags
ALTER TABLE tags ADD COLUMN color text NULL;

-- Fix 3: Standardize to owner_id (CHOOSE ONE: A or B)
-- Option A: Rename user_id → owner_id in DB
ALTER TABLE tags RENAME COLUMN user_id TO owner_id;
ALTER TABLE tag_map RENAME COLUMN user_id TO owner_id;

-- OR Option B: Keep user_id in DB, update lib/types.ts instead
-- (No SQL needed, just TypeScript changes)

-- Fix 4: Add compatibility columns for entity→item naming
ALTER TABLE tag_map ADD COLUMN entity_id uuid GENERATED ALWAYS AS (item_id) STORED;
ALTER TABLE tag_map ADD COLUMN entity_type text GENERATED ALWAYS AS (item_type) STORED;
```

---

## **G. Summary**

**Total Critical Issues:** 3
- EntityPerson missing `id` column (breaks unlinkPerson)
- Tag field naming mismatch (owner_id vs user_id)
- TagMap field naming mismatch (entity_* vs item_*)

**Total High Priority Issues:** 3
- SupabaseRepo using wrong field names in inserts
- Missing `color` column in tags table
- Direct Supabase calls in DevLogin.tsx

**Recommended Approach:**
1. Apply immediate migration (Section F) to fix critical schema issues
2. Regenerate Supabase types from actual schema
3. Update `lib/types.ts` to match DB truth
4. Refactor code to use standardized field names
5. Run full test suite to validate fixes

---

**End of Audit Report**
