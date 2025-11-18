# Mind Drop Architecture - File Reference

**Created:** November 18, 2025  
**Branch:** `fix/minddrop-category-chip-mapping`

## Overview

This archive contains the core files that implement the Mind Drop AI freeze feature and views field round-trip system. The AI freeze prevents Mind Drop from re-running AI enrichment on every overlay open by using a `views.minddrop_prefilled_v1` flag.

## Files Included

### 1. **Global Overlay Controller**
- **`contexts/OverlayContext.tsx`** (207 lines)
  - Global overlay state manager
  - `openEdit({ record })` - Opens overlay with full entity including `views` field
  - `openCreate()` - Opens overlay in create mode
  - Stores full entity in `state.entity` for overlay prefill

### 2. **Mind Drop Screen & Recent Drops**
- **`app/screens/CatchAllNotepad.tsx`** (4365 lines)
  - Mind Drop submission form
  - **Recent Drops list** (colocated, lines 790-1230)
  - `handleEdit()` function calls `repo.getById()` to fetch full entity
  - Deduplication by `drop_id` (prefers canonical items)

### 3. **Database Mappers**
- **`lib/repo/supabase.ts`** (3266 lines)
  - `mapHabitFromDb()` - Includes `views: dbRecord.views ?? {}`
  - `mapTodoFromDb()` - Includes `views: dbRecord.views ?? {}`
  - `mapNoteFromDb()` - Includes `views: dbRecord.views ?? {}`
  - `getById()` - Uses `.select('*')` then passes through mappers
  - `listByType()` - Uses `.select('*')` then passes through mappers

### 4. **Entity Type Definitions**
- **`lib/types.ts`** (379 lines)
  - `Habit` interface with `views?: Record<string, any>`
  - `Todo` interface with `views?: Record<string, any>`
  - `Note` interface with `views?: Record<string, any>`
  - Changed from narrow type to flexible `Record<string, any>` to support `minddrop_prefilled_v1`

### 5. **Overlay Local State**
- **`components/overlay/overlayV2.state.ts`** (357 lines)
  - Reducer for overlay UI state (tags, title, mood, etc.)
  - **Note:** `views.minddrop_prefilled_v1` lives on entity, not in this reducer

### 6. **Overlay Prefill Hook**
- **`components/overlay/useOverlayPrefill.ts`** (542 lines)
  - Calls Cortex AI to generate title + tags
  - Used by UnifiedOverlayV2 for Mind Drop enrichment
  - **Note:** Does NOT set `views.minddrop_prefilled_v1` flag

### 7. **Main Overlay Component**
- **`components/overlay/UnifiedOverlayV2.tsx`** (3322 lines)
  - `isMindDropAiLocked()` helper (lines ~413-432) - Checks `views.minddrop_prefilled_v1`
  - `shouldRunMindDropPrefill()` (lines ~1107-1134) - Returns false if locked
  - Sets `views.minddrop_prefilled_v1 = true` after first save (line ~1915)
  - Tag and title application respect lock via `shouldRunMindDropPrefill` checks

### 8. **Test Suites**
- **`components/overlay/__tests__/overlayMindDropAiFreeze.test.tsx`** (469 lines)
  - 19 tests for AI freeze behavior (all passing)
  - Tests `isMindDropAiLocked()` helper
  - Tests `shouldRunMindDropPrefill()` logic
  - Tests tag and title override respects lock
  - Tests lock flag persistence

- **`__tests__/repo/viewsRoundTrip.test.ts`** (415 lines)
  - 15 tests for views JSONB round-trip (all passing)
  - Tests mappers include `views` field
  - Tests `views.minddrop_prefilled_v1` preservation
  - Tests create → read cycle preserves all views keys

## Data Flow

### 1. Mind Drop Submission
```
User drops text
  → CatchAllNotepad calls overlay.openCreate({ initialText })
  → UnifiedOverlayV2 opens in create mode
  → shouldRunMindDropPrefill() returns TRUE (no lock yet)
  → useOverlayPrefill.runPrefill() calls Cortex AI
  → AI generates title + tags
  → User saves
  → UnifiedOverlayV2 sets views.minddrop_prefilled_v1 = true
  → repo.create() writes to database with views JSONB
```

### 2. Mind Drop Edit (First Time)
```
User taps Recent Drops item
  → handleEdit() calls repo.getById(id)
  → SupabaseRepo.getById() executes SELECT * FROM todos
  → mapTodoFromDb() adds views: dbRecord.views ?? {}
  → Returns full entity with views.minddrop_prefilled_v1 = true
  → overlay.openEdit({ record }) called
  → UnifiedOverlayV2 reopens
  → isMindDropAiLocked() returns TRUE
  → shouldRunMindDropPrefill() returns FALSE
  → AI prefill SKIPPED ✅
```

### 3. Subsequent Edits
```
User reopens same item again
  → Same flow as above
  → views.minddrop_prefilled_v1 still present
  → AI always skipped on reopens ✅
```

## Key Architectural Decisions

1. **No global store** - Uses React Context + local state instead of Zustand/Redux
2. **Mappers are source of truth** - All Supabase queries pass through type-safe mappers
3. **Views field round-trips** - JSONB column preserved via `views: dbRecord.views ?? {}`
4. **AI freeze in overlay** - `isMindDropAiLocked()` checks `views.minddrop_prefilled_v1`
5. **One-time prefill** - Flag set on first save, prevents re-runs
6. **Display vs Edit separation** - Lists use lightweight types, edit fetches full entity

## Verification Checklist

✅ All three mappers include `views` field  
✅ All UI entry points use `repo.getById()` or `repo.listByType()`  
✅ All repo methods use `.select('*')` to include views column  
✅ No direct Supabase queries bypass mappers (only DELETE operations)  
✅ No manual entity construction in production code  
✅ 19 AI freeze tests passing  
✅ 15 views round-trip tests passing  
✅ Complete data flow verified end-to-end  

## Implementation Complete

- **Phase 1:** Mind Drop AI freeze with `isMindDropAiLocked()` helper ✅
- **Phase 2:** Views field type updates to `Record<string, any>` ✅
- **Phase 3:** Mapper functions updated with `views: dbRecord.views ?? {}` ✅
- **Phase 4:** Comprehensive verification of data flow ✅

All code verified. No bypasses found. The `views.minddrop_prefilled_v1` round-trip is complete. 🎯
