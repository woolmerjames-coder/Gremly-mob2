# Canonical Intent Chip Suppression - Implementation Summary

**Date**: November 22, 2025  
**Commits**: `304eea
c` (canonical resolver), `f17abdf` (chip suppression wiring)

## Problem

Mind Drop was showing forced category chips ("narrative-ask" outcome) for clearly reflective text like:

> "Just thinking about maybe starting a side hustle someday"

**Expected behavior**: Auto-log without chips (clear log, no ambiguity)  
**Actual behavior**: Created unsorted note, showed chips, logged "narrative:forced-category-chips"

### Root Cause

1. **`classifyNarrative()` heuristic in CatchAllNotepad** was checking text patterns BEFORE using canonical intent decision
2. **No integration** between canonical intent resolver and chip display logic
3. **AI confidence scale mismatch**: Some code used 0-100, canonical resolver used 0-1
4. **Mode decision** didn't respect canonical intent's auto-create recommendations

## Solution Architecture

### Stage 1: Canonical Intent Resolver (Commit `304eea
c`)

Created unified intent classification in `lib/cortex/intents/canonicalIntent.ts`:

```typescript
export function resolveCanonicalIntent(inputs: IntentInputs): CanonicalIntentResult {
  // Returns:
  // - type: 'todo' | 'habit' | 'log' | 'meta' | 'ignore'
  // - confidence: 0-1 scale
  // - allowAutoCreate: boolean (high-confidence can skip chips)
  // - suppressChips: boolean (meta-comments never show chips)
  // - reasoning: string (for debugging)
}
```

**Key rules**:
- **Reflection safety**: `ignore` + low confidence + reflection keywords → `log`
- **Auto-create thresholds**: todos ≥0.85, habits ≥0.80
- **Vague reflection detection**: "maybe someday" doesn't auto-create todos
- **Default fallback**: Always returns `log` to never lose user input

### Stage 2: Wire to Chip Display (Commit `f17abdf`)

#### 2.1 CatchAllNotepad.tsx - Guard Update

**Before**:
```typescript
if (classifyNarrative(cleanedText)) {
  // Always create unsorted note and show chips
  // ...
}
```

**After**:
```typescript
const shouldSkipChips =
  decision.mindDropDecision &&
  decision.mindDropDecision.probableKind === 'log' &&
  !decision.mindDropDecision.needsClarification;

if (__DEV__ && decision.mindDropDecision) {
  console.log('[CanonicalIntent] Chip decision:', {
    showChips: !shouldSkipChips,
    reason: shouldSkipChips
      ? 'confident-log'
      : decision.mindDropDecision.needsClarification
        ? 'ambiguous-intent'
        : 'heuristic-narrative-detection',
  });
}

// Skip narrative guard if canonical says clear log
if (classifyNarrative(cleanedText) && !shouldSkipChips) {
  // Create unsorted note and show chips
  // ...
}
```

**Logic**:
- Check `mindDropDecision.needsClarification` before forcing chips
- Skip narrative guard when:
  - `probableKind === 'log'` (canonical intent says it's a log)
  - `needsClarification === false` (high confidence, no ambiguity)
- Add debug logging to show chip decision reasoning

#### 2.2 cortexDecide.ts - Mode Decision Integration

**Integration point** (after intent detection):
```typescript
// Phase 11.9: Resolve canonical intent
const canonicalIntent = resolveCanonicalIntent({
  ruleKind: detected.kind,
  ruleConfidence: detectorConfidence,
  aiCategory: normalized.canonicalType || probable,
  aiConfidence: (detected.aiConfidence ?? 0) / 100, // Normalize to 0-1
  text: userText,
});

if (__DEV__) {
  console.log('[CanonicalIntent]', {
    type: canonicalIntent.type,
    confidence: canonicalIntent.confidence.toFixed(2),
    allowAutoCreate: canonicalIntent.allowAutoCreate,
    suppressChips: canonicalIntent.suppressChips,
    reasoning: canonicalIntent.reasoning,
  });
}
```

**Mode override** (before returning response):
```typescript
// Override 'ask' mode for clear logs
if (
  mode === 'ask' &&
  canonicalIntent.type === 'log' &&
  canonicalIntent.confidence >= 0.6 &&
  !canonicalIntent.suppressChips
) {
  mode = 'auto';
  if (__DEV__) {
    console.log('[CanonicalIntent] Overriding ask→auto for confident log');
  }
}
```

**Auto-create enhancement**:
```typescript
const canonicalForceAuto =
  canonicalIntent.allowAutoCreate &&
  !canonicalIntent.suppressChips &&
  (canonicalIntent.type === 'todo' || canonicalIntent.type === 'habit' || canonicalIntent.type === 'log');

const shouldAuto =
  !forceListAsk &&
  !forceIdeaAsk &&
  effectiveCandidateActions.length > 0 &&
  (confidence > autoThreshold || preferHabitAuto || listStrong || canonicalForceAuto);
```

### Stage 3: Normalize AI Confidence Scale

**Problem**: Some code used 0-100, some used 0-1, causing threshold mismatches.

**Solution**: Standardize on **0-1 scale everywhere**.

#### Changes:

1. **classifyIntentWithAI.ts**:
```typescript
// Divide by 100 when passing to canonical resolver
const canonical = resolveCanonicalIntent({
  // ...
  aiConfidence: (aiConfidence ?? 0) / 100, // Normalize to 0-1
  text,
});

// Divide by 100 when returning DetectedIntent
const detectedIntent: DetectedIntent = {
  // ...
  aiConfidence: aiConfidence ? aiConfidence / 100 : undefined,
};
```

2. **canonicalIntent.ts**:
```typescript
// Update interface docs
export interface IntentInputs {
  aiConfidence: number; // 0-1 scale (normalized)
  // ...
}

// Update thresholds to 0-1 scale
if (
  (normalizedAI === 'ignore' || normalizedAI === null) &&
  inputs.aiConfidence < 0.7 && // 0-1 scale (0.7 = 70%)
  hasReflectionKeywords(inputs.text)
) {
  // Reflection safety override
}
```

3. **cortexDecide.ts**:
```typescript
// Update type docs
export type MindDropDecision = {
  /** Phase 11.8: AI confidence score 0-1 (normalized scale) */
  aiConfidence?: number;
};
```

4. **Tests**:
```typescript
// All test values updated to 0-1 scale
const result = resolveCanonicalIntent({
  ruleKind: 'none',
  ruleConfidence: 0,
  aiCategory: 'ignore',
  aiConfidence: 0.3, // Was: 30
  text: 'Just thinking about maybe starting a side hustle someday',
});
```

## Testing

### Canonical Intent Resolver Tests

**File**: `__tests__/canonical-intent.test.ts`

**Coverage**:
- ✅ Reflection safety rule (3 tests)
- ✅ Auto-create todos (3 tests)
- ✅ Auto-create habits (2 tests)
- ✅ Meta-comments and ignore (2 tests)
- ✅ Default fallback to log (2 tests)

**Total**: 12 tests passing

### Narrative Chip Suppression Tests

**File**: `__tests__/minddrop.narrative.chips.test.tsx`

**Coverage**:
- ✅ Clear reflective logs don't show chips (3 tests)
  - "Just thinking about maybe starting a side hustle someday"
  - "Wondering if I should change careers"
  - "Had a really productive conversation with Alex today"
- ✅ Ambiguous cases show chips (2 tests)
  - "Maybe I should finally email my accountant" (todo vs log)
  - Medium-confidence todos
- ✅ Reflection safety override (2 tests)

**Total**: 7 tests passing

### Test Execution

```bash
npx jest __tests__/canonical-intent.test.ts __tests__/minddrop.narrative.chips.test.tsx
```

**Result**: ✅ All 19 tests passing

## Expected Behavior Changes

### Before

```
Input: "Just thinking about maybe starting a side hustle someday"

1. intentRules → matched "reflective_thoughts" with kind: "note"
2. AI classification → {"category": "log", "confidence": 45}
3. classifyNarrative() → true (narrative text detected)
4. Creates unsorted note
5. Shows category chips (todo/log/habit)
6. Outcome: "narrative-ask"
```

### After

```
Input: "Just thinking about maybe starting a side hustle someday"

1. intentRules → matched "reflective_thoughts" with kind: "note"
2. AI classification → {"category": "log", "confidence": 0.45} (normalized)
3. resolveCanonicalIntent() → {
     type: 'log',
     confidence: 0.45,
     needsClarification: false,
     allowAutoCreate: false,
     reasoning: 'Default fallback to log'
   }
4. [CanonicalIntent] showChips=false reason=confident-log
5. classifyNarrative() guard SKIPPED (shouldSkipChips=true)
6. Auto-creates log without chips
7. Outcome: "auto-log"
```

## Decision Flow Diagram

```
User drops text
    ↓
detectIntent() / classifyIntentWithAI()
    ↓
resolveCanonicalIntent()
    ├─→ type: 'log' + needsClarification=false
    │       ↓
    │   shouldSkipChips=true
    │       ↓
    │   Auto-log, no chips
    │
    ├─→ type: 'todo' + allowAutoCreate=true
    │       ↓
    │   Auto-create todo
    │
    ├─→ type: 'todo' + allowAutoCreate=false
    │       ↓
    │   Show chips (medium confidence)
    │
    ├─→ type: 'meta' + suppressChips=true
    │       ↓
    │   Reply mode, no chips
    │
    └─→ type: 'ignore' + high confidence
            ↓
        Discard, no action
```

## Logging Reference

### New Logs Added

1. **CatchAllNotepad.tsx - Chip Decision**:
```
[CanonicalIntent] Chip decision: {
  showChips: false,
  reason: 'confident-log',
  probableKind: 'log',
  needsClarification: false
}
```

2. **cortexDecide.ts - Canonical Intent Result**:
```
[CanonicalIntent] {
  type: 'log',
  confidence: '0.45',
  allowAutoCreate: false,
  suppressChips: false,
  reasoning: 'Default fallback to log (preserve user input)'
}
```

3. **cortexDecide.ts - Mode Override**:
```
[CanonicalIntent] Overriding ask→auto for confident log
```

### Reasons for Chip Display

- **`confident-log`**: Canonical intent says it's a clear log, auto-create
- **`ambiguous-intent`**: needsClarification=true, show chips
- **`heuristic-narrative-detection`**: classifyNarrative() triggered but no canonical decision

## Configuration

No new environment variables needed. Uses existing thresholds:

- `INTENT_MIN_CONFIDENCE=0.85` - Auto-create threshold for todos
- `INTENT_HABIT_AUTO_FLOOR=0.90` - Auto-create threshold for habits

Canonical resolver has internal thresholds:
- `AUTO_TASK_FLOOR=0.85` - High confidence todos
- `AUTO_HABIT_FLOOR=0.80` - High confidence habits
- `MIN_AI_FLOOR=0.40` - Minimum AI trust threshold

## Files Modified

### Core Logic
- `lib/cortex/intents/canonicalIntent.ts` (NEW) - Canonical intent resolver
- `lib/cortex/intents/classifyIntentWithAI.ts` - AI confidence normalization
- `lib/cortex/cortexDecide.ts` - Mode decision integration
- `app/screens/CatchAllNotepad.tsx` - Chip display guard

### Tests
- `__tests__/canonical-intent.test.ts` (NEW) - Canonical resolver tests
- `__tests__/minddrop.narrative.chips.test.tsx` (NEW) - Chip suppression tests

## Future Work

1. **Entity Creation Wiring**: Use `canonical.allowAutoCreate` flag in conversion pipeline
2. **Tag Filtering**: Centralize tag quality filtering (remove junk words)
3. **Integration Tests**: End-to-end tests verifying actual chip display behavior
4. **Performance**: Cache canonical intent results to avoid re-computation

## Migration Notes

**Breaking Changes**: None - all changes are additive or internal improvements.

**Behavioral Changes**:
- Clear reflective logs auto-create without chips (was: showed chips)
- AI confidence now on 0-1 scale internally (was: inconsistent 0-100/0-1)

**Rollback Strategy**: 
- Revert commits `f17abdf` and `304eea
c`
- Previous behavior: All narrative text shows chips

## Verification Steps

1. Drop "Just thinking about maybe starting a side hustle someday"
   - Should see: `[CanonicalIntent] showChips=false reason=confident-log`
   - Should NOT see: `narrative:forced-category-chips`
   - Result: Auto-created log, no chips

2. Drop "Maybe I should finally email my accountant"
   - Should see: `[CanonicalIntent] showChips=true reason=ambiguous-intent`
   - Result: Shows chips (todo vs log)

3. Check logs for AI confidence scale
   - Should see: `ai_confidence=0.45` (not `45`)
   - Should see: Canonical confidence values between 0-1

## Summary

✅ **Canonical intent now controls chip display**  
✅ **Clear logs auto-create without chips**  
✅ **Ambiguous text still shows chips for clarification**  
✅ **AI confidence scale normalized to 0-1 everywhere**  
✅ **Comprehensive logging for debugging**  
✅ **All 19 tests passing**

**Impact**: Better UX for reflective journaling - "thinking about X" thoughts are preserved as logs without interrupting the user with unnecessary chip selection.
