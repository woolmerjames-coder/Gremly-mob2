# Mind Drop Raw Text Helper - Implementation Complete ✅

## Overview
Introduced `getMindDropRawText()` helper to standardize extraction of the original Mind Drop sentence across all entity types (note, todo, habit). This eliminates code duplication and ensures consistent behavior when reading raw user input from Mind Drop items.

## Changes Made

### 1. **New Helper Module**
**Location**: `components/overlay/getMindDropRawText.ts`

```typescript
/**
 * Extract the raw Mind Drop sentence from an entity.
 * 
 * Returns null if:
 * - Entity is not from Mind Drop (origin !== "catchall")
 * - No raw text is available
 * 
 * Otherwise returns the original user input text based on entity type:
 * - note (log): body → title
 * - todo: body → title → name
 * - habit: notes → title → name
 */
export function getMindDropRawText(entity: AnyOverlayEntity | null | undefined): string | null {
  if (!entity) return null;
  if (entity.origin !== 'catchall') return null;

  const type = entity.type;

  switch (type) {
    case 'note': // unsorted/log
      return entity.body?.trim() || entity.title?.trim() || null;

    case 'todo':
      return entity.body?.trim() || entity.title?.trim() || entity.name?.trim() || null;

    case 'habit':
      return entity.notes?.trim() || entity.title?.trim() || entity.name?.trim() || null;

    default:
      return null;
  }
}
```

**Also exports**:
- `hasMindDropRawText(entity)` - Boolean helper to check if raw text exists

### 2. **Unified Overlay V2 Integration**
**Location**: `components/overlay/UnifiedOverlayV2.tsx`

**Updated Functions**:

1. **`isRawSentenceTitle()`** (lines ~213-230):
   - **Before**: Duplicated logic with type-specific field checks (body, notes, etc.)
   - **After**: Uses `getMindDropRawText()` for single source of truth
   ```typescript
   function isRawSentenceTitle(entity: any): boolean {
     const shortTitle = getEntityShortTitle(entity);
     if (!shortTitle || shortTitle.trim().length === 0) return false;
     
     const trimmed = shortTitle.trim();
     const wordCount = trimmed.split(/\s+/).length;
     if (wordCount < 5) return false;
     
     // Use standardized helper to get raw Mind Drop text
     const rawText = getMindDropRawText(entity);
     if (!rawText) return false;
     
     // Check if title equals the raw Mind Drop sentence
     return trimmed === rawText.trim();
   }
   ```

2. **`buildDraftPayloadFromEntity()`** (lines ~2484-2590):
   - **Before**: Manual field extraction with nested fallbacks per type
   - **After**: Uses `getMindDropRawText()` as first priority
   ```typescript
   export function buildDraftPayloadFromEntity(entity: any): Partial<V2State> {
     // Use standardized helper to get raw Mind Drop text
     const mindDropRawText = getMindDropRawText(entity);
     
     // For habits: prefer Mind Drop raw text, then notes, then body, then name
     const habitLongText =
       mindDropRawText ??
       (entity as any)?.notes ??
       (entity as any)?.body ??
       (entity as any)?.name ?? '';
     
     // For todos/logs: use Mind Drop raw text if available
     const rawDetails = mindDropRawText ??
       (entity as any)?.details ?? 
       (entity as any)?.body ?? 
       (entity as any)?.notes ?? '';
     
     // ... rest of function
   }
   ```

### 3. **Public API Export**
**Location**: `components/overlay/index.ts`

```typescript
// Export Mind Drop helpers
export { getMindDropRawText, hasMindDropRawText } from './getMindDropRawText';
```

## Test Coverage

### New Test Suite: `getMindDropRawText.test.ts` (27 tests) ✅

**Coverage**:
1. **Non-Mind Drop Entities** (5 tests):
   - Returns null when origin !== 'catchall'
   - Returns null for null/undefined entities
   - Returns null for unknown entity types

2. **Note Extraction** (5 tests):
   - Extracts from body (primary field)
   - Falls back to title
   - Returns null when no text exists
   - Trims whitespace correctly

3. **Todo Extraction** (5 tests):
   - Extracts from body (primary field)
   - Falls back to title
   - Falls back to name
   - Returns null when no text exists
   - Trims whitespace correctly

4. **Habit Extraction** (5 tests):
   - Extracts from notes (primary field)
   - Falls back to title
   - Falls back to name
   - Returns null when no text exists
   - Trims whitespace correctly

5. **Consistency Test** (1 test):
   - **Critical**: Verifies note, todo, and habit created from same Mind Drop text all return identical raw sentence

6. **`hasMindDropRawText()` Helper** (6 tests):
   - Validates boolean detection logic

### Existing Tests: Still Passing ✅
- ✅ 6 Mind Drop integration tests (minddrop.habit.notes)
- ✅ 8 Conversion tests (conversion.unsortedToHabit)
- ✅ 10 Shared utilities tests (minddropShared)
- ✅ 4 Unified Overlay V2 core tests
- ✅ 27 new getMindDropRawText tests

**Total: 55/55 tests passing** ✅

## Benefits

### 1. **Single Source of Truth**
- All code that needs Mind Drop raw text now calls one function
- No more scattered logic with type-specific field checks
- Easy to update extraction rules in one place

### 2. **Consistent Behavior**
- Same extraction priority for all entity types:
  - Notes: body → title
  - Todos: body → title → name
  - Habits: notes → title → name
- Guaranteed consistency across overlay, tag generation, AI prefill

### 3. **Type Safety**
- Clear TypeScript interface for supported entity shapes
- Explicit null handling for non-Mind Drop entities
- Prevents accidental extraction from manual/non-catchall items

### 4. **Easier Maintenance**
Before:
```typescript
// Duplicated in multiple places
if (type === 'todo') {
  const body = entity.body ?? '';
  return trimmed === body.trim();
}
if (type === 'habit') {
  const notes = entity.notes ?? '';
  return trimmed === notes.trim();
}
// ... etc
```

After:
```typescript
// Single call everywhere
const rawText = getMindDropRawText(entity);
if (!rawText) return false;
return trimmed === rawText.trim();
```

### 5. **AI Pipeline Integration**
The helper is used by:
- ✅ Overlay prefill logic (resume AI suggestions)
- ✅ Tag generation pipeline (useOverlayPrefill)
- ✅ Entity hydration (buildDraftPayloadFromEntity)
- ✅ Raw sentence detection (isRawSentenceTitle)

All ensure: **If origin === "catchall" and we have raw text, offer AI title + tags once**

## Usage Examples

### In Overlay Code
```typescript
import { getMindDropRawText } from '../components/overlay';

// Check if entity has Mind Drop text for AI suggestions
const rawText = getMindDropRawText(entity);
if (rawText) {
  // Offer AI title condensation and tag suggestions
  suggestImprovedTitle(rawText);
  suggestTags(rawText);
}
```

### In Tag Generation
```typescript
// Instead of manually checking fields:
const text = entity.body ?? entity.notes ?? entity.title ?? '';

// Use standardized helper:
const text = getMindDropRawText(entity) ?? '';
if (text) {
  generateTags(text);
}
```

### In Tests
```typescript
const mindDropNote = {
  type: 'note',
  origin: 'catchall',
  body: 'Run for 30 minutes every morning'
};

const mindDropTodo = {
  type: 'todo',
  origin: 'catchall',
  body: 'Run for 30 minutes every morning'
};

const mindDropHabit = {
  type: 'habit',
  origin: 'catchall',
  notes: 'Run for 30 minutes every morning'
};

// All three return the same text
expect(getMindDropRawText(mindDropNote)).toBe('Run for 30 minutes every morning');
expect(getMindDropRawText(mindDropTodo)).toBe('Run for 30 minutes every morning');
expect(getMindDropRawText(mindDropHabit)).toBe('Run for 30 minutes every morning');
```

## Scope

**Affects**:
- ✅ UnifiedOverlayV2 prefill logic
- ✅ Raw sentence detection
- ✅ Entity hydration from database
- ✅ AI tag suggestion pipeline
- ✅ Any code reading Mind Drop original text

**Does NOT affect**:
- ❌ Database schema
- ❌ Mind Drop creation paths (already handled by previous phases)
- ❌ Manual create flows
- ❌ Non-catchall entities

## Files Modified

### Core Implementation:
1. **`components/overlay/getMindDropRawText.ts`** - NEW
   - Main helper function (60 lines)
   - TypeScript types
   - Documentation

2. **`components/overlay/UnifiedOverlayV2.tsx`**
   - Added import: `getMindDropRawText`
   - Updated `isRawSentenceTitle()` (removed 25 lines of duplicated logic)
   - Updated `buildDraftPayloadFromEntity()` (uses helper for consistency)

3. **`components/overlay/index.ts`**
   - Export `getMindDropRawText` and `hasMindDropRawText`

### Tests:
1. **`__tests__/overlay/getMindDropRawText.test.ts`** - NEW
   - 27 comprehensive tests
   - Covers all entity types
   - Tests fallback behavior
   - Validates consistency

## Verification

✅ Helper extracts same text for note/todo/habit from same Mind Drop  
✅ Returns null for non-catchall entities  
✅ Handles null/undefined/empty gracefully  
✅ Trims whitespace consistently  
✅ 55/55 tests passing (27 new + 28 existing)  
✅ No regressions in overlay behavior  
✅ Unified Overlay V2 core tests pass  
✅ Mind Drop integration tests pass  

## Next Steps

**Potential Future Enhancements** (not required now):
1. Use helper in tag generation pipeline (lib/tags/*)
2. Use helper in AI title condensation logic
3. Use helper in search/filter code that needs raw text
4. Add to storybook examples for dev reference

**Current Status**: Implementation complete and tested. Helper is available for any code that needs to read Mind Drop raw text.

---

**Implementation Date**: January 2025  
**Status**: Complete and Verified ✅  
**Tests**: 55/55 passing ✅
