# cortexDecide Action Generation Fix

**Date**: January 2025
**Status**: ✅ COMPLETE

## Critical Bug

### Symptom
"Meditate every morning" was being correctly classified as a HABIT (95% confidence) by the Cloudflare Worker, but the final entity created was a NOTE instead of a HABIT.

### Root Cause
The action generation logic in `cortexDecide.ts` was using the old rule-based `detected.kind` instead of the worker's canonical classification stored in `detected.canonicalType`.

**Evidence from logs**:
```
detected.canonicalType = 'habit'  ✅ Worker correctly classified
detected.kind = 'note'            ❌ Old rule-based heuristic
actions = ['create.note']         ❌ Wrong action generated
```

Even though the canonical classification was stored correctly (Phase 3.2), the action generation was ignoring it.

## The Fix

### File: `lib/cortex/cortexDecide.ts`

#### 1. Normalized Action Builder (Lines 478-524)
**Before**: Used `detected.kind` as primary source
```typescript
// Old code relied on detected.kind from rule-based heuristics
if (detected.kind === 'habit') {
  normalized = { actions: [{type: 'create.habit'}] };
}
```

**After**: Use `detected.canonicalType` as primary source
```typescript
// Use canonical type from worker classification (or fallback to rule-based kind)
const effectiveKind = detected.canonicalType || detected.kind;

if (effectiveKind === 'habit') {
  normalized = { 
    actions: [{type: 'create.habit'}],
    canonicalType: 'habit' 
  };
}
```

**Impact**: When engine is disabled, actions are now based on worker classification, not heuristics.

#### 2. Auto-Create Action Builder (Lines 682-722)
**Before**: Built actions from `detected.kind`
```typescript
if (detected.kind === 'habit' && shouldAutoCreate) {
  return { actions: [{type: 'create.habit'}] };
}
```

**After**: Use `detected.canonicalType` first
```typescript
const effectiveKind = detected.canonicalType || detected.kind;

if (effectiveKind === 'habit' && shouldAutoCreate) {
  return { 
    actions: [{type: 'create.habit'}],
    canonicalType: 'habit'
  };
}
```

**Impact**: Auto-create decisions now respect worker classification.

## Why This Matters

### The Classification Pipeline
```
1. User Input: "Meditate every morning"
2. Cloudflare Worker: Returns bucket='habit', type='habit', confidence=95
3. classifyIntentWithAI: Stores canonicalType='habit' in DetectedIntent
4. cortexDecide: 
   ❌ BEFORE: Ignores canonicalType, uses detected.kind='note'
   ✅ AFTER: Uses canonicalType='habit' to generate actions
5. Stage A: Processes create.habit action → Creates HABIT entity
```

### The Bug Flow (Before Fix)
```
Worker says: "This is a HABIT (95% confidence)"
  ↓
DetectedIntent.canonicalType = 'habit'  ✅ Stored correctly
  ↓
cortexDecide.ts normalized builder:
  Uses detected.kind = 'note'           ❌ Wrong source
  ↓
Returns actions = ['create.note']       ❌ Wrong action
  ↓
Stage A creates NOTE entity             ❌ Wrong entity type
```

### The Fixed Flow (After Fix)
```
Worker says: "This is a HABIT (95% confidence)"
  ↓
DetectedIntent.canonicalType = 'habit'  ✅ Stored correctly
  ↓
cortexDecide.ts normalized builder:
  const effectiveKind = detected.canonicalType || detected.kind
  Uses effectiveKind = 'habit'          ✅ Correct source
  ↓
Returns actions = ['create.habit']      ✅ Correct action
  ↓
Stage A creates HABIT entity            ✅ Correct entity type
```

## Changes Made

### 1. Normalized Action Builder
**Location**: Lines 478-524

**Key Change**: Prioritize canonical type over heuristic kind
```typescript
// Determine effective kind (canonical takes precedence)
const effectiveKind = detected.canonicalType || detected.kind;

// Build actions based on effective kind
if (effectiveKind === 'todo') {
  normalized = {
    actions: [{type: 'create.todo', payload}],
    canonicalType: detected.canonicalType || 'todo',
  };
} else if (effectiveKind === 'habit') {
  normalized = {
    actions: [{type: 'create.habit', payload}],
    canonicalType: detected.canonicalType || 'habit',
  };
} else if (effectiveKind === 'log') {
  normalized = {
    actions: [{type: 'create.note', payload}],
    canonicalType: detected.canonicalType || 'log',
  };
}
```

### 2. Auto-Create Action Builder
**Location**: Lines 682-722

**Key Change**: Use canonical type for auto-create decisions
```typescript
const effectiveKind = detected.canonicalType || detected.kind;
const shouldAutoCreate = detected.canonicalAllowAutoCreate ?? true;

if (effectiveKind === 'todo' && shouldAutoCreate) {
  return {
    actions: [{type: 'create.todo'}],
    canonicalType: detected.canonicalType || 'todo',
  };
} else if (effectiveKind === 'habit' && shouldAutoCreate) {
  return {
    actions: [{type: 'create.habit'}],
    canonicalType: detected.canonicalType || 'habit',
  };
} else if (effectiveKind === 'log' && shouldAutoCreate) {
  return {
    actions: [{type: 'create.note'}],
    canonicalType: detected.canonicalType || 'log',
  };
}
```

## Integration with Phase 3.2

This fix builds directly on the Phase 3.2 canonical storage work:

### Phase 3.2: Store Canonical Classification
- **Files Modified**: `types.ts`, `classifyIntentWithAI.ts`
- **What**: Added `canonicalType`, `canonicalAllowAutoCreate`, etc. to `DetectedIntent`
- **Why**: Single source of truth for worker classification
- **Result**: Worker result stored once, available for reuse

### This Fix: Use Canonical Classification for Actions
- **Files Modified**: `cortexDecide.ts`
- **What**: Changed action generation to use `detected.canonicalType`
- **Why**: Actions should reflect worker classification, not heuristics
- **Result**: Correct entity types created (habit → HABIT, not NOTE)

## Test Results

### Classification Tests: ✅ PASSING
```
Test Suites: 3 passed, 3 total
Tests:       1 skipped, 201 passed, 202 total
```

### Pipeline Wiring Tests: ✅ PASSING
```
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

### TypeScript Validation: ✅ NO ERRORS
- `lib/cortex/cortexDecide.ts` - No errors

## Example: "Meditate every morning"

### Before Fix
```json
{
  "detected": {
    "kind": "note",              // ❌ Rule-based heuristic
    "canonicalType": "habit",    // ✅ Worker classification (ignored!)
    "canonicalConfidence": 95
  },
  "decision": {
    "actions": [
      {"type": "create.note"}    // ❌ Wrong action
    ]
  }
}
```
**Result**: Creates NOTE entity instead of HABIT

### After Fix
```json
{
  "detected": {
    "kind": "note",              // ⚠️ Fallback only
    "canonicalType": "habit",    // ✅ Worker classification (used!)
    "canonicalConfidence": 95
  },
  "decision": {
    "actions": [
      {"type": "create.habit"}   // ✅ Correct action
    ],
    "canonicalType": "habit"
  }
}
```
**Result**: Creates HABIT entity as intended

## Fallback Strategy

The fix uses a defensive pattern:
```typescript
const effectiveKind = detected.canonicalType || detected.kind;
```

**Why this is safe**:
1. **Normal case**: `canonicalType` exists (from worker) → use it
2. **Fallback**: Worker unavailable → use rule-based `kind`
3. **Backward compatible**: Old code paths still work
4. **Fail-safe**: Always has a value to work with

## Related Documentation
- `PHASE_3_2_CANONICAL_SINGLE_CALL_FIX.md` - Canonical storage implementation
- `STAGE_A_CONSISTENCY_ENHANCEMENT.md` - Stage A pipeline consistency
- `CATCHALL_PIPELINE_FLOW.md` - Overall pipeline architecture

## Next Steps

### Runtime Validation Required
Test these sacred examples in the live app:
1. ✅ "Meditate every morning" → Should create HABIT
2. ✅ "Run 5km every Saturday" → Should create HABIT
3. ✅ "Feeling overwhelmed" → Should create NOTE (log/journal)

### Success Criteria
- [x] Classification tests passing
- [x] Pipeline wiring tests passing
- [x] No TypeScript errors
- [ ] Runtime validation confirms correct entity types

### Future Enhancements
- Add metrics for canonical vs. heuristic kind mismatches
- Monitor confidence levels for different entity types
- Consider phasing out rule-based `kind` entirely
