# Mind Drop v3 Phase 4B - Two-Stage Pipeline Architecture

**Date:** November 22, 2025  
**Status:** ✅ Complete

## Overview

Refactored the Mind Drop decision pipeline into two explicit stages to separate classification from enrichment. This enables better observability, retry logic, and stage-specific failure handling.

## Architecture

### Stage A: Classification
**Purpose:** Intent detection + canonical resolution → entity creation

**Responsibilities:**
- Convert unsorted notes to target entities (todo/habit/note)
- Set entity type and basic properties
- Update `views.minddrop_stage = 'classified'`
- Clear `views.ai_pending = false`

**Location:** `lib/minddrop/pipelineStages.ts::runMindDropStageAClassification()`

### Stage B: Prefill
**Purpose:** AI enhancement for classified entities

**Responsibilities:**
- Call Cortex for title + tags generation
- Update entity with enriched data
- Set `views.minddrop_stage = 'prefilled'`
- Set `views.minddrop_prefilled_v1 = true`
- Set freeze flags (`ai_title_frozen`, `ai_tags_frozen`)

**Location:** `lib/minddrop/backgroundPrefill.ts::backgroundPrefill()`

## Implementation

### Stage A: Classification

```typescript
export async function runMindDropStageAClassification(params: StageAParams): Promise<StageAResult> {
  const { repo, decision, unsortedNoteId, parsedDue } = params;
  
  // Convert based on decision type
  if (firstAction.type === 'create.todo') {
    const { todo } = await convertUnsortedToTodo(repo, unsortedNoteId, { due: parsedDue });
    
    // Mark classification complete
    await repo.update({
      id: todo.id,
      patch: {
        views: {
          minddrop_stage: 'classified',
          ai_pending: false,
        },
      },
    });
  }
  // ... similar for habits and notes
}
```

### Stage B: Prefill

```typescript
export async function backgroundPrefill(entity: PrefillEntity, rawSentence?: string) {
  // Step 1: Call Cortex for AI enhancement
  const classification = await callClassify(rawSentence ?? entity.title);
  
  // Step 2: Build update payload with stage flags
  const updatedViews = {
    ...existingViews,
    minddrop_prefilled_v1: true,
    minddrop_stage: 'prefilled', // Mark prefill complete
    ai_title_frozen: true,
    ai_tags_frozen: true,
    ai_pending: false,
  };
  
  // Step 3: Update entity with enriched data
  await supabase.from(tableName).update({
    views: updatedViews,
    name: computedTitle,
    tags: enrichedTags,
  });
}
```

### Pipeline Orchestration

In `CatchAllNotepad.tsx::performSave()`:

```typescript
// Step 1: Create unsorted note (existing)
const unsortedNoteId = await saveToUnsortedTray(repo, cleanedText, { dropId });

// Step 2A: Run classification stage
if (firstAction.type === 'create.todo' || firstAction.type === 'create.habit') {
  const stageAResult = await runMindDropStageAClassification({
    repo,
    decision,
    unsortedNoteId,
    parsedDue,
    // ...
  });
  createdIds = stageAResult.entities;
} else if (firstAction.type === 'create.note') {
  // Notes handled inline (complex UI dependencies)
  const updatedNote = await repo.update({
    id: unsortedNoteId,
    patch: {
      subtype,
      views: { minddrop_stage: 'classified' },
    },
  });
  createdIds.notes.push(updatedNote.id);
}

// Step 2B: Run prefill stage (background, non-blocking)
void runMindDropStageBPrefill({
  repo,
  entityIds: createdIds,
  rawText: cleanedText,
});
```

## Stage Progression

```
User Input
    ↓
[Unsorted Note Created]
    ↓
STAGE A: CLASSIFICATION
    ↓
views.minddrop_stage = 'pending' → 'classified'
views.ai_pending = true → false
    ↓
[Entity Created: Todo/Habit/Note]
    ↓
STAGE B: PREFILL (background)
    ↓
views.minddrop_stage = 'classified' → 'prefilled'
views.minddrop_prefilled_v1 = false → true
views.ai_title_frozen = undefined → true
views.ai_tags_frozen = undefined → true
    ↓
[Entity Enriched with AI Data]
```

## Behavior Preservation

✅ **Entities Created:**
- Todos: Converted from unsorted notes, due dates preserved
- Habits: Converted from unsorted notes, frequency extracted
- Notes: Updated in place, subtype determined by decision

✅ **Tags/Subtypes:**
- Initial tags from Cortex decision applied during unsorted creation
- Quality filter applied to remove low-value tags
- Theme tags added during prefill
- Subtype tags (e.g., #list) applied during classification

✅ **Decision Logic:**
- Todo vs habit vs log decision unchanged
- Confidence thresholds preserved
- Chip display logic unchanged
- Narrative detection unchanged

## Files Modified

### 1. **lib/minddrop/pipelineStages.ts** (NEW)
- `runMindDropStageAClassification()` - Stage A implementation
- `runMindDropStageBPrefill()` - Stage B orchestrator
- Type definitions for stage params/results

### 2. **lib/minddrop/backgroundPrefill.ts**
- Added `minddrop_stage: 'prefilled'` to views update
- No other changes to enrichment logic

### 3. **app/screens/CatchAllNotepad.tsx**
- Imported pipeline stage functions
- Refactored auto-create path to use stages
- Preserved inline note handling (complex UI dependencies)
- Maintained timing chips, metrics, logging

## Testing

**Test Results:** ✅ All 46 tests passing

### Test Suites:
1. **getMindDropVisualState.test.ts** (27 tests)
   - Visual state logic unchanged
   - Stage flags tested via roundtrip tests

2. **views.extended.test.ts** (7 tests)
   - New stage flags type-safe
   - All combinations valid

3. **views.roundtrip.test.ts** (5 tests)
   - Stage flags round-trip through repo layer
   - Views object preserved correctly

4. **minddrop-pipeline.integration.test.ts** (7 tests)
   - End-to-end pipeline behavior identical
   - All classification decisions preserved
   - Auto-create vs chip logic unchanged

## Benefits

### 1. **Observability**
- Clear stage markers in `views.minddrop_stage`
- Can track pipeline progression in database
- Easier debugging of failures

### 2. **Retry Logic**
- Failed enrichment can be retried independently
- Classification failures don't block prefill
- Stage-specific error handling

### 3. **Performance**
- Stage B runs in background (non-blocking)
- User sees entity immediately after Stage A
- AI enrichment happens asynchronously

### 4. **Future Extensibility**
- Easy to add Stage C (e.g., smart reminders)
- Can parallelize stages where appropriate
- Clear separation of concerns

## Next Steps

Phase 5 will implement:
1. **Failure Handling**
   - Retry failed prefills
   - Mark entities with `ai_failed` flag
   - Show retry UI for failed enrichments

2. **Stage Monitoring**
   - Track stage durations
   - Log stage transitions
   - Alert on stuck entities

3. **Smart Retries**
   - Exponential backoff
   - Max retry limits
   - Fallback to heuristic tags
