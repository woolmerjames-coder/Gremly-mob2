# Ambiguous Social Plan Detection - Implementation Summary

## Overview
Implemented detection and handling for ambiguous social plans like "Drinks with Sam on Friday", "Dinner tonight with Jeff", and "Brunch with Alex next weekend" to reliably show chips (Log vs To-Do) instead of auto-creating entries.

## Changes Made

### 1. Updated `canonicalIntent.ts`

#### Added Detection Functions
- **Temporal Keywords**: `tonight`, `tomorrow`, `this weekend`, `next weekend`, `Friday`, `Saturday`, `Sunday`, etc.
- **Social Event Words**: `dinner`, `lunch`, `brunch`, `breakfast`, `drinks`, `coffee`, `meeting`, `call`
- **Person Indicators**: Detects "with [Name]" patterns (capitalized names)
- **Combined Heuristic**: `isAmbiguousSocialPlan()` returns true when text has person indicators AND (temporal keywords OR social event words)

#### Updated `CanonicalIntentResult` Interface
Added new optional fields:
```typescript
export interface CanonicalIntentResult {
  // ... existing fields
  mode?: 'auto' | 'ask';  // Override decision mode for special cases
  chipDecision?: {
    showChips: boolean;
    needsClarification: boolean;
    reason?: string;  // e.g., 'ambiguous-social-plan'
  };
  probableKind?: 'todo' | 'habit' | 'log' | 'none';  // Hint for UI
}
```

#### New Resolution Rules

**For Medium-Confidence Todos with Social Plan Heuristics:**
- If AI says 'todo' with 40-85% confidence AND text matches social plan heuristics
- Return: `type='todo'`, `mode='ask'`, `allowAutoCreate=false`, `chipDecision.showChips=true`
- Reasoning: "Ambiguous social plan: needs user clarification (Log vs To-Do)"

**For Logs with Ambiguous Confidence:**
- If AI says 'log' with 30-70% confidence AND text matches social plan heuristics
- OR if AI says 'log' AND text matches social plan heuristics (regardless of confidence)
- Return: `type='log'`, `mode='ask'`, `allowAutoCreate=false`, `chipDecision.showChips=true`
- Reasoning: "Ambiguous social plan: needs user clarification (Log vs To-Do)"

### 2. Updated `cortexDecide.ts`

Added logic to respect `canonicalIntent.mode`:
```typescript
// CRITICAL: Respect canonicalIntent.mode for ambiguous social plans
if (canonicalIntent.mode === 'ask') {
  mode = 'ask';
  // For ambiguous social plans, clear auto-create actions to force user decision
  if (canonicalIntent.chipDecision?.reason === 'ambiguous-social-plan') {
    effectiveCandidateActions = [];
  }
}
```

Updated reflection safety override to NOT override explicit `mode='ask'`:
```typescript
if (
  mode === 'ask' &&
  canonicalIntent.type === 'log' &&
  canonicalIntent.confidence >= 0.55 &&
  !canonicalIntent.suppressChips &&
  canonicalIntent.mode !== 'ask' // Don't override explicit mode='ask'
) {
  mode = 'auto';
  // ...
}
```

### 3. Added Unit Tests

Created `lib/cortex/intents/__tests__/canonicalIntent.test.ts` with 9 test cases:

✅ "Drinks with Sam on Friday" → mode='ask', showChips=true
✅ "Dinner tonight with Jeff" (log category) → mode='ask', showChips=true
✅ "Brunch with Alex next weekend" → mode='ask', showChips=true
✅ "Coffee with Maria tomorrow" → mode='ask', showChips=true
✅ "Dinner tonight with Jeff" (todo category, 60%) → type='todo', mode='ask', showChips=true
✅ High-confidence todos NOT affected → auto-create
✅ Reflective logs NOT affected → auto-create
✅ Social plan heuristics work with low AI confidence
✅ "Dinner tonight" (no person) does NOT trigger → normal fallback

## Behavior Matrix

| Input | AI Category | AI % | Has Temporal | Has Person | Result |
|-------|-------------|------|--------------|------------|--------|
| "Drinks with Sam on Friday" | log | 58% | ✓ | ✓ | mode='ask', chips shown |
| "Dinner tonight with Jeff" | todo | 60% | ✓ | ✓ | mode='ask', chips shown |
| "Brunch with Alex next weekend" | log | 55% | ✓ | ✓ | mode='ask', chips shown |
| "Email Sarah the proposal" | todo | 88% | ✗ | ✓ | Auto-create todo (high confidence) |
| "Dinner tonight" | log | 50% | ✓ | ✗ | Default fallback (no person) |
| "Just thinking out loud" | log | 48% | ✗ | ✗ | Auto-create log (reflective) |

## Integration Test Results

All existing tests pass:
- ✅ Mind Drop Pipeline Integration (6 tests)
- ✅ Mind Drop Classification Report (4 tests)
- ✅ Canonical Intent Ambiguous Social Plans (9 tests)

"Dinner tonight with Jeff" now correctly:
- Shows canonical type: 'todo' (AI classification)
- Shows chips: YES (mode='ask')
- Actions: none (no auto-create)
- Labels: 'catchall', 'needs_review'

## Key Design Decisions

1. **Respect AI Classification**: If AI says 'todo' with medium confidence, keep it as todo but force mode='ask'
2. **Heuristic-Based Override**: Social plan heuristics can trigger mode='ask' even with low AI confidence
3. **Preserve Existing Behavior**: High-confidence todos/habits and reflective logs continue to auto-create
4. **No UI Changes Required**: Chips already render when mode='ask' AND chipDecision.showChips=true
5. **Backward Compatible**: Existing code paths unchanged, new logic only activates for ambiguous social plans

## Files Modified

1. `/lib/cortex/intents/canonicalIntent.ts` - Core detection and resolution logic
2. `/lib/cortex/cortexDecide.ts` - Respect canonicalIntent.mode field
3. `/lib/cortex/intents/__tests__/canonicalIntent.test.ts` - Unit tests (NEW FILE)

## Testing

Run tests:
```bash
npm test -- lib/cortex/intents/__tests__/canonicalIntent.test.ts
npm test -- minddrop-pipeline.integration.test.ts
npm test -- minddrop-classification-report.test.ts
```

All tests passing ✅
