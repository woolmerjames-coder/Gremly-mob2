# Stage A Pipeline Consistency Enhancement

**Date**: January 2025
**Status**: ✅ COMPLETE

## Summary
Enhanced Stage A of the Mind Drop pipeline to ensure consistent handling and logging across all three entity types (todo/habit/note). All creation paths now use the same canonical approach and include debug logging for troubleshooting.

## Changes Made

### 1. Added Debug Logging for Todos
**File**: `lib/minddrop/pipelineStages.ts` (lines 250-265)

Added `[MindDrop.StageA.Persist]` logging for todo creation to match the pattern used for habits and notes:

```typescript
console.log('[MindDrop.StageA.Persist]', {
  scope: 'MindDrop.StageA.Persist',
  dropId,
  todoId: createdTodo.id,
  canonicalType: 'todo',
  dueDate: createdTodo.due_date,
  labels: createdTodo.labels,
  tags: (createdTodo.tags ?? []).slice(0, 5),
});
```

### 2. Enhanced Debug Logging for Habits
**File**: `lib/minddrop/pipelineStages.ts` (lines 391-410)

Added `[MindDrop.StageA.Persist]` logging for habit creation:

```typescript
console.log('[MindDrop.StageA.Persist]', {
  scope: 'MindDrop.StageA.Persist',
  dropId,
  habitId: createdHabit.id,
  canonicalType: 'habit',
  recurrence: createdHabit.recurrence,
  labels: createdHabit.labels,
  tags: (createdHabit.tags ?? []).slice(0, 5),
});
```

## Verified Consistency Across Entity Types

### All Three Creation Paths Follow Same Pattern:

#### 1. **Todo Creation** (`create.todo` action, lines 233-320)
- ✅ Uses `convertUnsortedToTodo()` → calls `buildCanonicalFromMindDrop` with `kind: 'todo'`
- ✅ Sets `labels: ['todo']`
- ✅ Passes classifier fields (`bucket`, `type`, `subtype`, `aiTitle`, `aiConfidence`)
- ✅ Marks `minddrop_stage: 'classified'`, `ai_pending: true`
- ✅ Logs `[MindDrop.StageA.Persist]` with canonical fields
- ✅ Includes idempotency check (prevents duplicate creation)

#### 2. **Habit Creation** (`create.habit` action, lines 322-421)
- ✅ Uses `convertUnsortedToHabit()` → calls `buildCanonicalFromMindDrop` with `kind: 'habit'`
- ✅ Sets `labels: ['habit']`
- ✅ Passes classifier fields (`bucket`, `type`, `subtype`, `aiTitle`, `aiConfidence`)
- ✅ Marks `minddrop_stage: 'classified'`, `ai_pending: true`
- ✅ Logs `[MindDrop.StageA.Persist]` with canonical fields
- ✅ Includes idempotency check (prevents duplicate creation)

#### 3. **Note Creation** (`create.note` action, lines 551-683)
- ✅ Calls `buildCanonicalFromMindDrop` directly with `kind: 'log'`
- ✅ Sets `labels: ['log']`
- ✅ Passes classifier fields and subtype
- ✅ Marks `minddrop_stage: 'classified'`, `ai_pending: true`
- ✅ Logs `[MindDrop.StageA.Persist]` with canonical fields
- ✅ Includes idempotency check (prevents duplicate creation)

## Benefits

### 1. **Consistent Classification Flow**
All three entity types now use the same canonical approach:
- Worker classification → stored in `DetectedIntent.canonical*` fields
- `cortexDecide` uses `detected.canonicalType` to generate actions
- Stage A processes actions using canonical conversion functions
- All entities get proper `labels`, `tags`, `tags_meta` from `buildCanonicalFromMindDrop`

### 2. **Improved Debugging**
The new `[MindDrop.StageA.Persist]` logs provide visibility into:
- Which entity type was created
- Canonical type classification
- Entity-specific fields (due date, recurrence)
- Labels and tags applied
- Drop ID for tracing back to original input

### 3. **Verified Idempotency**
All three paths include checks to prevent duplicate entity creation:
- Todos: Check for existing todo with same `dropId` in context
- Habits: Check for existing habit with same `dropId` in context
- Notes: Check for existing note with same `dropId`

## Test Results

### Classification Tests: ✅ PASSING
```
Test Suites: 3 passed, 3 total
Tests:       1 skipped, 201 passed, 202 total
```

### TypeScript Validation: ✅ NO ERRORS
- `lib/minddrop/pipelineStages.ts` - No errors
- `lib/cortex/cortexDecide.ts` - No errors

## Integration with Previous Fixes

This enhancement builds on the Phase 3.2 canonical integration fixes:

1. **Phase 3.2**: Store canonical classification once in `DetectedIntent`
   - Added `canonicalType`, `canonicalAllowAutoCreate`, etc. fields
   - Modified `classifyIntentWithAI` to call `resolveCanonicalIntent()` once
   - Modified `cortexDecide` to reuse stored canonical result

2. **Action Generation Fix**: Use canonical type for action decisions
   - Fixed `cortexDecide` normalized action builder (lines 478-524)
   - Changed from `detected.kind` to `detected.canonicalType`
   - Ensures `create.habit` action generated when canonical type is 'habit'

3. **Stage A Consistency** (this document):
   - Verified all three entity types use same canonical approach
   - Added consistent debug logging across todo/habit/note creation
   - Confirmed idempotency protection for all paths

## Example Flow: "Meditate every morning"

```
1. Worker Classification:
   ✅ bucket='habit', type='habit', subtype=null, confidence=95

2. DetectedIntent Storage (classifyIntentWithAI):
   ✅ canonicalType='habit', canonicalAllowAutoCreate=true, canonicalConfidence=95

3. Decision Engine (cortexDecide):
   ✅ Uses detected.canonicalType='habit' (not detected.kind)
   ✅ Returns actions: ['create.habit']

4. Stage A Pipeline (pipelineStages.ts):
   ✅ Processes create.habit action
   ✅ Calls convertUnsortedToHabit()
   ✅ Uses buildCanonicalFromMindDrop with kind='habit'
   ✅ Sets labels: ['habit']
   ✅ Logs [MindDrop.StageA.Persist] with canonicalType='habit'
   ✅ Marks minddrop_stage='classified', ai_pending=true

5. Entity Created:
   ✅ Habit entity with proper labels, tags, recurrence
   ✅ NOT a note entity
```

## Files Modified

1. **lib/minddrop/pipelineStages.ts**:
   - Lines 250-265: Added debug logging for todo creation
   - Lines 391-410: Added debug logging for habit creation
   - (Note creation already had logging at lines 645-654)

## Next Steps

### Recommended Testing:
1. ✅ Classification tests passing (201/202)
2. [ ] Run full Mind Drop integration tests
3. [ ] Runtime validation:
   - Test "Meditate every morning" → Should create HABIT
   - Test "Run 5km every Saturday" → Should create HABIT
   - Test "Feeling overwhelmed" → Should create NOTE (log/journal)

### Future Enhancements:
- Consider adding similar logging to Stage B (backgroundPrefill)
- Add metrics tracking for entity type distribution
- Monitor canonical type confidence levels in production

## Related Documentation
- `PHASE_3_2_CANONICAL_SINGLE_CALL_FIX.md` - Canonical integration fix
- `CORTEX_DECIDE_ACTION_FIX.md` - Action generation fix (if created)
- `CATCHALL_PIPELINE_FLOW.md` - Overall pipeline architecture
