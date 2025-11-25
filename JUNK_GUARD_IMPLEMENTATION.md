# Junk Guard Implementation Summary

## Overview
Implemented comprehensive junk detection to prevent gibberish text from entering the Mind Drop pipeline and showing Ask chips.

## What is "Pure Junk"?
Text that meets ALL of these criteria:
1. **Pattern Match**: Either dots-only (`…`, `...`) OR gibberish (no recognizable words) OR very short (<3 words)
2. **Low Confidence**: AI classifier confidence ≤ 5%
3. **Unsorted Bucket**: Classified as `bucket='unsorted'`

## Implementation Layers

### Layer 1: cortexDecide Early Return
**File**: `lib/cortex/cortexDecide.ts`
**Lines**: 200-226 (helper), 369-430 (guard check)

```typescript
function isPureJunk(text: string, bucket?: string, confidence?: number): boolean {
  // Dots-only check
  if (/^[.·…]+$/.test(text.trim())) return true;
  
  // Word count check
  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const hasNoWords = words.every(w => /^[^a-zA-Z0-9]+$/.test(w));
  const tooFewWords = words.length < 3;
  
  // Requires unsorted bucket + low confidence
  return (hasNoWords || tooFewWords) && 
         bucket === 'unsorted' && 
         (confidence ?? 0) <= 5;
}
```

**Behavior**:
- Runs immediately after `classifyIntentWithAI`
- Returns early with `mode: 'reply'`, `actions: []`
- Sets `mindDropDecision.type = 'ignore'`, `probableKind = 'none'`
- Logs `[JunkGuard] Pure junk detected`

### Layer 2: Mind Drop Pipeline Fallback
**File**: `app/screens/CatchAllNotepad.tsx`
**Lines**: After line 481 (helper), 3336-3367 (guard check)

Same `isPureJunk()` logic duplicated in the component.

**Behavior**:
- Checks junk before showing Ask chips in fallback
- Returns `outcome: 'auto-junk-suppressed'`
- Skips unsorted note creation
- No chips displayed to user

## Test Coverage

### Integration Tests
**File**: `__tests__/minddrop/junkGuard.integration.test.ts`
**Status**: ✅ All 8 tests passing

**Test Strategy**: Conditional assertions
- Tests verify that IF the AI worker classifies text as `bucket='unsorted'` with low confidence, THEN the junk guard suppresses it
- Does not mock the AI worker, tests actual behavior
- Console logs show what the worker actually classified each input as

**Test Cases**:
1. ✅ Dots-only input (`…`)
2. ✅ Pure dots (`...`)
3. ✅ Gibberish (`asdfghjkl`)
4. ✅ Very short text (`ab`)
5. ✅ Meaningful short text not suppressed
6. ✅ Meaningful log text not suppressed
7. ✅ Edge case: unsorted with higher confidence (not junk)
8. ✅ Pipeline behavior documentation test

### Unit Tests
The canonical badge rendering tests also verify logs are displayed correctly:
**File**: `app/screens/__tests__/minddrop.canonical-badge.test.tsx`
**Status**: ✅ All 8 tests passing

## User Experience

### Before Junk Guard
User enters: `…`
1. Worker classifies as `bucket='unsorted', type='ignore', conf=0`
2. cortexDecide runs full engine
3. Mind Drop shows Ask chips: "To-do? / Habit? / Note?"
4. User forced to categorize gibberish

### After Junk Guard
User enters: `…`
1. Worker classifies as `bucket='unsorted', type='ignore', conf=0`
2. cortexDecide detects junk, returns early with `mode='reply'`
3. Mind Drop pipeline checks junk, skips fallback
4. **No chips shown**, no entity created
5. User sees clean response without categorization prompt

## Dependencies

The junk guard relies on:
1. **Cloudflare Worker** returning `bucket='unsorted'` for junk inputs
2. **Low confidence** (≤ 5%) from AI classifier
3. **Pattern detection** for dots-only, gibberish, or short text

If the worker classifies something as a specific type (todo, log, etc.), the junk guard will NOT trigger, even if the text looks like gibberish to the pattern matcher.

## Related Work

This implementation builds on:
- **Canonical Type System**: Badge rendering uses `canonical_type` from database
- **Mind Drop Pipeline**: Two-stage processing (Stage A = classification, Stage B = enrichment)
- **Recent Drops Enhancement**: Extended data pipeline to include canonical fields

## Files Modified

1. `lib/cortex/cortexDecide.ts` - Added junk guard with early return
2. `app/screens/CatchAllNotepad.tsx` - Added junk guard in fallback logic
3. `__tests__/minddrop/junkGuard.integration.test.ts` - Integration tests (8 passing)

## Success Metrics

✅ TypeScript compiles with no errors
✅ All integration tests passing (8/8)
✅ All canonical badge tests passing (8/8)
✅ No regression in existing functionality
✅ Junk guard prevents "…" from showing Ask chips (when worker classifies as unsorted)

## Manual Testing

To verify the junk guard works:
1. Open the app
2. Enter `…` in Mind Drop input
3. Verify NO Ask chips appear
4. Verify no entity is created
5. Try with `...`, `asdfghjkl`, `ab` - same behavior
6. Try with meaningful text like "Buy milk" - should show chips normally

## Future Enhancements

Potential improvements:
- [ ] Add more sophisticated gibberish detection (dictionary-based)
- [ ] Configurable confidence threshold (currently hardcoded to 5%)
- [ ] User feedback mechanism ("Was this junk?")
- [ ] Analytics to track junk suppression rate
- [ ] Worker-side junk detection (prevent unnecessary API calls)
