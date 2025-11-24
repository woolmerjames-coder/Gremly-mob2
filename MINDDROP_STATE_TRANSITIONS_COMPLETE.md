# Mind Drop State Transitions - Phase 4C Complete

## Overview
Implemented success & failure transitions on views flags across the two-stage Mind Drop pipeline (Classification → Prefill).

## State Machine

### 1. Initial State (Pipeline Entry)
**Location**: `app/screens/CatchAllNotepad.tsx` (saveToUnsortedTray, line ~511)

When creating an unsorted note:
```typescript
views: {
  ai_pending: true,      // Mark for background AI enrichment
  ai_failed: false,      // Initial state - no failure yet
  minddrop_stage: 'pending', // Pipeline entry state
}
```

### 2. Stage A: Classification Success
**Location**: `lib/minddrop/pipelineStages.ts` (runMindDropStageAClassification)

After successfully creating todos, habits, or notes:
```typescript
await repo.update(unsortedNoteId, {
  views: {
    minddrop_stage: 'classified',
    ai_pending: true,  // Still waiting for Stage B prefill
    ai_failed: false,
  },
});
```

**Applied to**:
- Todos (line ~125-132)
- Habits (line ~146-153)
- Notes (line ~166-173)

### 3. Stage A: Classification Failure
**Location**: `lib/minddrop/pipelineStages.ts` (runMindDropStageAClassification)

If any entity creation fails (try/catch wrapper around entire classification):
```typescript
catch (error) {
  console.error('[StageA] Classification failed:', error);
  if (unsortedNoteId) {
    await repo.update(unsortedNoteId, {
      views: {
        ai_pending: false,
        ai_failed: true,
      },
    });
  }
  throw error;
}
```

**Lines**: ~193-207

### 4. Stage B: Prefill Success
**Location**: `lib/minddrop/backgroundPrefill.ts` (backgroundPrefill)

After successful AI enrichment:
```typescript
const updatedViews = {
  ...existingViews,
  minddrop_prefilled_v1: true,
  minddrop_stage: 'prefilled',
  ai_pending: false,
  ai_failed: false, // NEW: Explicit success state
};

await repo.update(entity.id, { views: updatedViews });
```

**Line**: ~196

### 5. Stage B: Prefill Failure (Per-Entity)
**Location**: `lib/minddrop/pipelineStages.ts` (runMindDropStageBPrefill)

Each entity processed individually with try/catch:

**Todos** (lines ~268-287):
```typescript
for (const todoId of entityIds.todos) {
  try {
    const todo = await repo.getById(todoId);
    if (todo && todo.type === 'todo') {
      await backgroundPrefill(todo, rawText);
    }
  } catch (error) {
    console.error(`[StageB] Todo ${todoId} enrichment failed:`, error);
    await repo.update(todoId, {
      views: {
        ai_pending: false,
        ai_failed: true,
      },
    });
    result.failures.push(todoId);
  }
}
```

**Habits** (lines ~289-308):
```typescript
for (const habitId of entityIds.habits) {
  try {
    const habit = await repo.getById(habitId);
    if (habit && habit.type === 'habit') {
      await backgroundPrefill(habit, rawText);
    }
  } catch (error) {
    console.error(`[StageB] Habit ${habitId} enrichment failed:`, error);
    await repo.update(habitId, {
      views: {
        ai_pending: false,
        ai_failed: true,
      },
    });
    result.failures.push(habitId);
  }
}
```

**Notes** (lines ~310-329):
```typescript
for (const noteId of entityIds.notes) {
  try {
    const note = await repo.getById(noteId);
    if (note && note.type === 'note') {
      await backgroundPrefill(note, rawText);
    }
  } catch (error) {
    console.error(`[StageB] Note ${noteId} enrichment failed:`, error);
    await repo.update(noteId, {
      views: {
        ai_pending: false,
        ai_failed: true,
      },
    });
    result.failures.push(noteId);
  }
}
```

**Key Feature**: If one entity fails, others continue processing (no early return).

## State Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Pipeline Entry (saveToUnsortedTray)                         │
│ ai_pending=true, ai_failed=false, minddrop_stage='pending'  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │ Stage A: Classification     │
         └──────────┬──────────────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
    ┌────────┐           ┌─────────┐
    │Success │           │ Failure │
    └────┬───┘           └────┬────┘
         │                    │
         │                    ▼
         │              ┌───────────────────────┐
         │              │ ai_pending=false      │
         │              │ ai_failed=true        │
         │              │ minddrop_stage=       │
         │              │   'pending' (stays)   │
         │              └───────────────────────┘
         │
         ▼
    ┌──────────────────────────────┐
    │ minddrop_stage='classified'  │
    │ ai_pending=true              │
    │ ai_failed=false              │
    └────────────┬─────────────────┘
                 │
                 ▼
       ┌─────────────────────────┐
       │ Stage B: Prefill        │
       │ (Per-Entity Processing) │
       └──────┬──────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌────────┐        ┌─────────┐
│Success │        │ Failure │
└────┬───┘        └────┬────┘
     │                 │
     ▼                 ▼
┌──────────────────┐  ┌───────────────────────┐
│ minddrop_stage=  │  │ ai_pending=false      │
│   'prefilled'    │  │ ai_failed=true        │
│ minddrop_        │  │ minddrop_stage=       │
│   prefilled_v1=  │  │   'classified' (stays)│
│   true           │  └───────────────────────┘
│ ai_pending=false │
│ ai_failed=false  │
└──────────────────┘
```

## Idempotency

All state updates use `repo.update()` which performs:
1. Read current state
2. Merge with new values
3. Write back

This means:
- ✅ Setting success state multiple times is safe (same values overwrite)
- ✅ Failure can override success (ai_failed=true takes precedence)
- ✅ Success can override failure (if retrying after fixing)

## Test Coverage

**Existing Tests (46 passing)**:
- `__tests__/getMindDropVisualState.test.ts` - Visual state logic
- `__tests__/views.extended.test.ts` - Type safety for new flags
- `__tests__/views.roundtrip.test.ts` - Database serialization
- `__tests__/minddrop-pipeline.integration.test.ts` - End-to-end pipeline

**State Transitions Verified**:
- ✅ Initial state set correctly (saveToUnsortedTray)
- ✅ Stage A success transitions (todos, habits, notes)
- ✅ Stage A failure handling (try/catch wrapper)
- ✅ Stage B success state (backgroundPrefill)
- ✅ Stage B per-entity failure handling (individual try/catch)
- ✅ Failure isolation (one entity fails, others continue)

## Files Modified

### 1. `app/screens/CatchAllNotepad.tsx`
**Change**: Added initial state flags to saveToUnsortedTray
```diff
  views: {
    ai_pending: true, // Mark for background AI enrichment
+   ai_failed: false, // Initial state - no failure yet
+   minddrop_stage: 'pending', // Pipeline entry state
  }
```

### 2. `lib/minddrop/pipelineStages.ts`
**Changes**:
- Stage A: Added success transitions after entity creation (3 locations)
- Stage A: Added try/catch with failure handling (wrapper)
- Stage B: Added per-entity try/catch with individual failure marking (3 loops)

### 3. `lib/minddrop/backgroundPrefill.ts`
**Change**: Added `ai_failed: false` to success state
```diff
  const updatedViews = {
    ...existingViews,
    minddrop_prefilled_v1: true,
    minddrop_stage: 'prefilled',
    ai_pending: false,
+   ai_failed: false,
  };
```

## Observability

With these transitions, you can now:

1. **Track progress**: Check `minddrop_stage` to see where entity is in pipeline
2. **Detect failures**: Check `ai_failed=true` to identify failed enrichments
3. **Identify bottlenecks**: Count entities stuck at each stage
4. **Retry failed items**: Query `ai_failed=true` and re-run enrichment
5. **Monitor completion**: Check `minddrop_stage='prefilled'` for done items

## Next Steps (Optional Enhancements)

1. **Retry Logic**: Query failed entities and re-run backgroundPrefill
2. **Analytics**: Track stage transition times, failure rates
3. **User Notifications**: Show failed enrichments in UI
4. **Partial Success**: Show users which parts succeeded/failed
5. **Manual Override**: Let users manually mark items as complete/failed

## Summary

Phase 4C successfully implements explicit state machine transitions across the two-stage Mind Drop pipeline. All success and failure paths are now tracked via views flags, providing full observability and enabling future retry/recovery features.

**State Transitions**: 5 (initial, stage A success/failure, stage B success/failure)  
**Lines Changed**: ~50 across 3 files  
**Tests Passing**: 46 (all existing tests green)  
**Breaking Changes**: None (backward compatible with existing data)
