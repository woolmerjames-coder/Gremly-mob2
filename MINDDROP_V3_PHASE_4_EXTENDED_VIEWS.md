# Mind Drop v3 Phase 4 - Extended Views with Stage + Failure Flags

**Date:** November 22, 2025  
**Status:** ✅ Complete

## Overview

Extended the `views` JSONB field in the type system and repository layer to support Mind Drop pipeline stage tracking and failure flags.

## Changes Made

### 1. Type Definitions (`lib/types.ts`)

Extended `views` shape for all Mind Drop entities (Habit, Todo, Note):

```typescript
views?: {
  ai_pending?: boolean;           // Existing: AI enrichment in progress
  ai_failed?: boolean;            // NEW: AI enrichment failed
  minddrop_stage?: 'pending' | 'classified' | 'prefilled'; // NEW: Pipeline stage
  minddrop_prefilled_v1?: boolean; // Existing: Prefill applied
  [key: string]: any;             // Allow custom fields
};
```

**Stage Values:**
- `'pending'`: Initial Mind Drop creation, awaiting classification
- `'classified'`: Type determined, awaiting prefill
- `'prefilled'`: Entity prefilled with AI suggestions

### 2. Repository Layer (`lib/repo/supabase.ts`)

**Updated `normalizeViews()` function:**
```typescript
function normalizeViews(input: any): Record<string, any> {
  if (!input || typeof input !== 'object') return {};
  // Preserve all fields including ai_pending, ai_failed, minddrop_stage, minddrop_prefilled_v1
  return { ...input };
}
```

**Ensures:**
- Always returns non-null object (never null or undefined)
- Preserves all fields when mapping from database
- Round-trips stage and failure flags properly

**Existing Round-Trip Support:**

Insert operations already use:
```typescript
views: input.views ?? {}  // Ensures views object is sent
```

Update operations already use:
```typescript
if ('views' in normalizedPatch) updatePayload.views = normalizedPatch.views ?? {};
```

## Verification

### Type Safety Tests (`__tests__/views.extended.test.ts`)

Created comprehensive test suite with 7 tests covering:

✅ Habit views with ai_failed and minddrop_stage  
✅ Todo views with ai_failed and minddrop_stage  
✅ Note views with ai_failed and minddrop_stage  
✅ All stage values ('pending', 'classified', 'prefilled')  
✅ Individual flag usage (only ai_failed or only minddrop_stage)  
✅ Combined flag usage (all flags together)  
✅ Custom fields preservation ([key: string]: any)

**Test Results:** All 7 tests passing ✅

### Integration Points

1. **Database Schema**: JSONB column `views` with default `'{}'`
2. **Mappers**: `mapHabitFromDb`, `mapTodoFromDb`, `mapNoteFromDb` all use `normalizeViews()`
3. **Insert/Update**: Both operations preserve views object with all fields
4. **Type System**: TypeScript enforces shape while allowing flexibility

## Usage Example

```typescript
// Create Mind Drop with stage tracking
const note = await repo.create({
  type: 'note',
  title: 'Buy groceries',
  subtype: 'catchall',
  ai_placed: true,
  views: {
    ai_pending: true,
    minddrop_stage: 'pending',  // Just created, awaiting classification
  },
});

// Update after classification
await repo.update(note.id, {
  views: {
    ...note.views,
    minddrop_stage: 'classified',  // Type determined
  },
});

// Update after prefill
await repo.update(note.id, {
  views: {
    ...note.views,
    ai_pending: false,
    minddrop_stage: 'prefilled',  // Prefill complete
    minddrop_prefilled_v1: true,
  },
});

// Handle failure
await repo.update(note.id, {
  views: {
    ...note.views,
    ai_pending: false,
    ai_failed: true,  // Pipeline failed
  },
});
```

## Files Modified

1. **lib/types.ts**
   - Extended `Habit.views` interface
   - Extended `Todo.views` interface
   - Extended `Note.views` interface

2. **lib/repo/supabase.ts**
   - Enhanced `normalizeViews()` with better documentation
   - Ensured spread operator preserves all fields

3. **__tests__/views.extended.test.ts** (NEW)
   - Comprehensive type safety tests
   - Stage value validation
   - Flag combination tests

## Backward Compatibility

✅ Fully backward compatible:
- Existing `ai_pending` flag unchanged
- Existing `minddrop_prefilled_v1` flag unchanged
- New fields are optional (all use `?`)
- `[key: string]: any` allows custom fields
- `normalizeViews()` handles null/undefined gracefully
- Insert/update operations already preserve views object

## Next Steps

Phase 5 will implement:
1. Pipeline stage management logic
2. Failure retry mechanisms
3. Stage transition workflows
4. Visual state updates based on stage
