# Mind Drop AI Freeze - Implementation Guide

**Created:** November 18, 2025  
**Branch:** `fix/minddrop-category-chip-mapping`  
**Status:** ✅ Complete & Tested (34 tests passing)

## Problem Statement

Mind Drop was re-running AI enrichment (title generation, tag extraction) **every time** a user reopened an item for editing. This caused:
- User edits to titles getting overwritten
- Unnecessary AI API calls
- Confusing UX where titles would change unexpectedly
- Wasted tokens/compute

## Solution Overview

Implement a **one-time AI freeze** using a `views.minddrop_prefilled_v1` flag that prevents AI from re-running after the first enrichment.

### Key Changes:

1. **Entity Types** - Changed `views` field from narrow type to `Record<string, any>`
2. **Database Mappers** - Added `views: dbRecord.views ?? {}` to all three mappers
3. **Overlay Logic** - Added `isMindDropAiLocked()` helper and updated prefill guards
4. **Flag Persistence** - Set `views.minddrop_prefilled_v1 = true` on first save

---

## Files in This Archive

### 1. **`app/screens/CatchAllNotepad.tsx`** (143 KB)
- Mind Drop submission form
- Recent Drops list component (colocated)
- `handleEdit()` function that calls `repo.getById()` to fetch full entity

**Key Section:**
```typescript
// Line ~1025: handleEdit function
const handleEdit = async (id: string, kind: UnifiedDrop['kind']) => {
  try {
    // Fetch full record via repo.getById() → includes views field via mapper
    const record = await repo.getById(id);
    
    if (record && record.type === kind) {
      overlay.openEdit({
        record: record, // ← Full entity with views.minddrop_prefilled_v1
        spaceId: record.space_id ?? null,
      });
    }
  } catch (error) {
    // Fallback to minimal record
    overlay.openEdit({ record: { id, type: kind }, spaceId: null });
  }
};
```

### 2. **`components/overlay/UnifiedOverlayV2.tsx`** (115 KB)
- Main overlay component for editing todos/habits/notes
- Hosts Mind Drop AI prefill logic

**Key Sections:**

**A. AI Lock Detection (lines ~413-432):**
```typescript
/**
 * Detect if Mind Drop AI should be locked (frozen) for this entity.
 * Returns true when:
 * - Entity has drop_id (Mind Drop origin)
 * - Entity was AI-placed (ai_placed = true)
 * - Entity has already been prefilled once (views.minddrop_prefilled_v1 = true)
 */
function isMindDropAiLocked(entity: any): boolean {
  const drop_id = entity?.drop_id;
  const ai_placed = entity?.ai_placed === true;
  const views = entity?.views ?? {};
  const alreadyPrefilled = views.minddrop_prefilled_v1 === true;
  
  return !!(drop_id && ai_placed && alreadyPrefilled);
}
```

**B. Prefill Guard (lines ~1107-1134):**
```typescript
// Check if already prefilled (views.minddrop_prefilled_v1 === true)
if (isMindDropAiLocked(entity)) {
  console.log('[OverlayV2] Mind Drop entity is locked - skipping prefill');
  return false; // Don't run prefill - entity already enriched
}
```

**C. Flag Persistence (lines ~1891-1920):**
```typescript
// NEW Mind Drop Prefill System: Mark views.minddrop_prefilled_v1 = true after first prefill
if (isMindDropPrefillNeeded(editingEntity, conversionMeta)) {
  const existingViews = editingEntity?.views ?? {};
  patch.views = {
    ...existingViews,
    minddrop_prefilled_v1: true, // Lock AI for future opens
  };
}
```

### 3. **`contexts/OverlayContext.tsx`** (5.3 KB)
- Global overlay state manager
- Handles opening/closing overlay across all screens

**Key Section:**
```typescript
// Line ~118: openEdit stores full entity
const openEdit = useCallback(({ record, spaceId }: EditOptions) => {
  setState({
    visible: true,
    mode: 'edit',
    initialEntity: { type: entityType, id: record.id, logSubtype },
    initialSpaceId: spaceId,
    entity: record, // ← Store full record including views field
  });
}, []);
```

### 4. **`lib/repo/supabase.ts`** (105 KB)
- Supabase repository with type-safe database mappers
- All query methods use `.select('*')` then pass through mappers

**Key Sections:**

**A. Habit Mapper (lines ~210-223):**
```typescript
function mapHabitFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    name: dbRecord.name || dbRecord.title,
    frequency_value: dbRecord.frequency_json,
    reminders: dbRecord.reminders_json,
    triggers: dbRecord.triggers_json,
    tags: dbRecord.tags ?? null,
    drop_id: dbRecord.drop_id ?? null,
    views: dbRecord.views ?? {}, // ← Round-trip views JSONB
  };
}
```

**B. Todo Mapper (lines ~233-249):**
```typescript
function mapTodoFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    name: dbRecord.name,
    title: dbRecord.name,
    reminders: dbRecord.reminders_json,
    tags: dbRecord.tags ?? null,
    drop_id: dbRecord.drop_id ?? null,
    views: dbRecord.views ?? {}, // ← Round-trip views JSONB
  };
}
```

**C. Note Mapper (lines ~251-267):**
```typescript
function mapNoteFromDb(dbRecord: any): any {
  return {
    ...dbRecord,
    reminders: dbRecord.reminders_json,
    tags: dbRecord.tags ?? null,
    source_message_id: dbRecord.source_message_id ?? null,
    drop_id: dbRecord.drop_id ?? null,
    views: dbRecord.views ?? {}, // ← Round-trip views JSONB
  };
}
```

### 5. **`lib/types.ts`** (11.4 KB)
- Core entity type definitions

**Key Changes:**

**A. Habit Type (line ~42):**
```typescript
export interface Habit {
  // ... other fields ...
  views?: Record<string, any>; // ← Changed from narrow type to flexible JSONB
  drop_id?: string | null;
  // ... more fields ...
}
```

**B. Todo Type (line ~107):**
```typescript
export interface Todo {
  // ... other fields ...
  views?: Record<string, any>; // ← Changed from narrow type to flexible JSONB
  drop_id?: string | null;
  // ... more fields ...
}
```

**C. Note Type (line ~139):**
```typescript
export interface Note {
  // ... other fields ...
  views?: Record<string, any>; // ← Changed from narrow type to flexible JSONB
  drop_id?: string | null;
  // ... more fields ...
}
```

### 6. **`lib/cortex/cortexDecide.ts`** (36.3 KB) - Optional
- AI decision engine for Mind Drop classification
- Determines whether to create todo/habit/log/journal
- Not directly modified for AI freeze, but included for context

---

## Implementation Steps

### Step 1: Update Entity Types
Replace `lib/types.ts` with the version from this archive.

**Changed:** `views` field type from narrow to `Record<string, any>`

### Step 2: Update Database Mappers
Replace `lib/repo/supabase.ts` with the version from this archive.

**Changed:** All three mappers now include `views: dbRecord.views ?? {}`

### Step 3: Update Overlay Context
Replace `contexts/OverlayContext.tsx` with the version from this archive.

**Changed:** `openEdit()` now stores full `entity` in state for prefill access

### Step 4: Update Main Overlay
Replace `components/overlay/UnifiedOverlayV2.tsx` with the version from this archive.

**Changed:**
- Added `isMindDropAiLocked()` helper
- Updated `shouldRunMindDropPrefill()` to check lock
- Added `views.minddrop_prefilled_v1 = true` persistence on save

### Step 5: Update Mind Drop Screen
Replace `app/screens/CatchAllNotepad.tsx` with the version from this archive.

**Changed:** `handleEdit()` uses `repo.getById()` to fetch full entity (already correct)

---

## Data Flow Verification

### ✅ First Mind Drop Submission
```
1. User drops: "Email the landlord about the leak before Friday"
2. cortexDecide detects intent: todo (confidence: 0.9)
3. RPC creates todo with origin='catchall', drop_id, ai_placed=true
4. views field is empty: {}
```

### ✅ First Edit Open
```
1. User taps item in Recent Drops
2. handleEdit() calls repo.getById(id)
3. SupabaseRepo executes: SELECT * FROM todos WHERE id = $1
4. mapTodoFromDb() adds: views: dbRecord.views ?? {} → views: {}
5. overlay.openEdit({ record }) passes full entity
6. UnifiedOverlayV2 checks: isMindDropAiLocked(entity) → FALSE (no flag yet)
7. shouldRunMindDropPrefill() → TRUE
8. AI runs: generates title "Email landlord about leak" + tags
9. User saves
10. Overlay sets: views.minddrop_prefilled_v1 = true
11. repo.update() writes to database: views = {"minddrop_prefilled_v1": true}
```

### ✅ Second Edit Open (AI Freeze Active)
```
1. User taps same item again
2. handleEdit() calls repo.getById(id)
3. SupabaseRepo executes: SELECT * FROM todos WHERE id = $1
4. mapTodoFromDb() adds: views: dbRecord.views ?? {} → views: {minddrop_prefilled_v1: true}
5. overlay.openEdit({ record }) passes full entity with flag
6. UnifiedOverlayV2 checks: isMindDropAiLocked(entity) → TRUE ✅
7. shouldRunMindDropPrefill() → FALSE
8. AI SKIPPED - title and tags preserved from first edit ✅
```

---

## Testing

### Test Suites Included

**Not in this archive** (see architecture archive for tests):
- `components/overlay/__tests__/overlayMindDropAiFreeze.test.tsx` (19 tests)
- `__tests__/repo/viewsRoundTrip.test.ts` (15 tests)

**All 34 tests passing:**
- ✅ isMindDropAiLocked() returns correct boolean
- ✅ shouldRunMindDropPrefill() respects lock
- ✅ Tag and title override skipped when locked
- ✅ Lock flag persisted on save
- ✅ Mappers include views field
- ✅ Views JSONB round-trips correctly
- ✅ Handles null/undefined views gracefully
- ✅ Preserves all views keys (minddrop_prefilled_v1, alsoShowIn, etc.)

### Manual Testing Checklist

1. **Submit Mind Drop** → AI generates title/tags ✅
2. **Edit item** → Title auto-applies on first open ✅
3. **Close and reopen** → Title NOT re-generated (locked) ✅
4. **Check database** → `views.minddrop_prefilled_v1 = true` persisted ✅
5. **Edit different item** → AI runs normally (not locked) ✅

---

## Database Schema

**No migration required!** The `views` column already exists as JSONB in all three tables:
- `habits.views` (JSONB)
- `todos.views` (JSONB)
- `notes.views` (JSONB)

We're just adding a new key (`minddrop_prefilled_v1`) to the existing JSON object.

---

## Rollback Plan

If issues arise, revert these changes:

1. **Entity Types** → Restore original `views?: { alsoShowIn?: string[] }`
2. **Mappers** → Remove `views: dbRecord.views ?? {}` lines
3. **Overlay** → Remove `isMindDropAiLocked()` and `views.minddrop_prefilled_v1` logic

**Database cleanup** (optional):
```sql
-- Remove minddrop_prefilled_v1 from all entities
UPDATE habits SET views = views - 'minddrop_prefilled_v1'::text;
UPDATE todos SET views = views - 'minddrop_prefilled_v1'::text;
UPDATE notes SET views = views - 'minddrop_prefilled_v1'::text;
```

---

## Architecture Decisions

### Why `views.minddrop_prefilled_v1` instead of a new column?

1. **Flexible** - JSONB allows adding more view-state flags later
2. **No migration** - Column already exists
3. **UI-scoped** - `views` is explicitly for UI state, not domain logic
4. **Version-safe** - `_v1` suffix allows future schema evolution

### Why check `drop_id && ai_placed && views.minddrop_prefilled_v1`?

1. **`drop_id`** - Confirms this is a Mind Drop item (not manual creation)
2. **`ai_placed`** - Confirms AI was involved in creation
3. **`views.minddrop_prefilled_v1`** - Confirms prefill has already run once

All three conditions must be true to lock AI.

### Why mapper-based instead of direct queries?

1. **Type safety** - Mappers ensure consistent field mapping
2. **Single source of truth** - All queries go through mappers
3. **Easy to verify** - Only three mappers to check
4. **Maintainable** - Adding fields is centralized

---

## Success Metrics

✅ **Zero regressions** - All existing tests pass  
✅ **34 new tests** - Comprehensive coverage of AI freeze + views round-trip  
✅ **Zero migrations** - Uses existing JSONB column  
✅ **Zero API changes** - Internal implementation only  
✅ **Complete data flow** - Verified from UI → DB → UI  

---

## Support

For questions or issues:
1. Check test suites for expected behavior
2. Review data flow diagrams above
3. Verify mapper functions include `views` field
4. Confirm `views.minddrop_prefilled_v1` flag in database

**Branch:** `fix/minddrop-category-chip-mapping`  
**Date:** November 18, 2025  
**Status:** Ready for deployment 🚀
