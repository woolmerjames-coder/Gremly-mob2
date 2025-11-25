# Phase 3.2 Classifier Audit - Call Site Mapping

## Problem Identified

Mind Drop is calling `resolveCanonicalIntent` TWICE per classification, causing conflicting results:

1. **First call**: In `classifyIntentWithAI.ts` line 254
   - Passes unified classifier fields: `aiBucket`, `aiType`, `aiSubtype`
   - Returns canonical intent with correct type (todo/habit/log)
   - Result stored in `DetectedIntent`

2. **Second call**: In `cortexDecide.ts` line 603
   - Passes LEGACY fields: `aiCategory` (not `aiBucket`!)
   - Does NOT pass `aiBucket`, `aiType`, `aiSubtype`
   - Can return DIFFERENT type than first call
   - This result OVERWRITES the correct classification

## Concrete Bug Example

"Run 5km every Saturday":
- Worker classifies as: `bucket=habit, type=habit, confidence=95%`
- First `resolveCanonicalIntent` → type='habit' ✅
- Second `resolveCanonicalIntent` with `aiCategory='log_general'` → type='log' ❌
- Final result: Creates NOTE instead of HABIT

## Call Site Map

### Primary Classification Flow

```
cortexDecide (lib/cortex/cortexDecide.ts:336)
  ↓
classifyIntentWithAI (lib/cortex/intents/classifyIntentWithAI.ts:156)
  ↓ calls worker
  ↓
resolveCanonicalIntent (lib/cortex/intents/classifyIntentWithAI.ts:254) ← FIRST CALL ✅
  ↓ returns canonical.type
  ↓
Back to cortexDecide.ts
  ↓
resolveCanonicalIntent (lib/cortex/cortexDecide.ts:603) ← SECOND CALL ❌
  ↓ OVERWRITES canonical.type with wrong value
  ↓
Stage A uses actions based on SECOND canonical result (wrong!)
```

### Where Actions Are Built

`cortexDecide.ts` lines 656-714:
- Checks `canonicalIntent.type` to build actions
- Adds `create.todo`, `create.habit`, or `create.note` action
- Stage A reads `actions[0].type` to decide what entity to create

### Where Entities Are Created

`pipelineStages.ts` `runMindDropStageAClassification`:
- Line 247: `if (firstAction.type === 'create.todo')` → calls `convertUnsortedToTodo`
- Line 363: `else if (firstAction.type === 'create.habit')` → calls `convertUnsortedToHabit`  
- Line 619: Creates note with `buildCanonicalFromMindDrop`

### Build Canonical Usage

`buildCanonicalFromMindDrop` (lib/minddrop/buildCanonicalFromMindDrop.ts):
- Does NOT call `resolveCanonicalIntent`
- Receives `kind` (todo/habit/log) from caller
- Uses `classifierSubtype` to determine log subtype (journal/idea/general)
- Called AFTER entity type has been determined

## Fix Strategy

Remove the second `resolveCanonicalIntent` call from `cortexDecide.ts` and use the canonical result already computed in `classifyIntentWithAI`.

### Changes Required

1. **cortexDecide.ts**: Remove duplicate `resolveCanonicalIntent` call at line 603
2. **cortexDecide.ts**: Use `detected.classifierType` instead of calling `resolveCanonicalIntent` again
3. **Store canonical result in DetectedIntent**: Add `canonicalType` field to `DetectedIntent` interface
4. **classifyIntentWithAI.ts**: Store the canonical result in returned `DetectedIntent`

## Next Steps

1. ✅ Map all call sites
2. ⏳ Remove duplicate `resolveCanonicalIntent` call
3. ⏳ Fix Stage A to respect classifier type
4. ⏳ Add regression tests
5. ⏳ Verify "Meditate every morning" → HABIT
6. ⏳ Verify "Run 5km every Saturday" → HABIT
7. ⏳ Verify "Feeling overwhelmed" → JOURNAL log
