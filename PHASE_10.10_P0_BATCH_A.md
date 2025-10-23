# Phase 10.10 - Cortex Audit & Hardening: P0 Batch A

**Status:** ✅ Complete  
**Branch:** `feat/10.10-cortex-audit-hardening`  
**Commit:** `861c1c8`  
**Date:** October 23, 2025

---

## Overview

This batch addresses **P0 (blocking/correctness)** issues identified in the Cortex audit, focusing on router behavior, spaceId propagation, intent thresholds, and overlay prefill accuracy.

---

## Fixes Implemented

### A1) Router Fallback Fix ✅

**Problem:** "Saving to Catch-All for now" message appearing in Space Chat when worker call fails.

**Solution:**
- Modified `tryDirectWorkerCall` fallback in `lib/cortex/pipelines/conversation.ts`
- Changed from `mode: 'keep'` with catch-all explanation to `mode: 'reply'` with smalltalk
- Returns friendly fallback: "I'm here to help. What would you like to talk about?"
- Empty explanation field prevents catch-all text from being displayed

**Impact:** Space chat now never shows classification/catch-all messages, maintaining conversational UX.

---

### A2) spaceId Propagation & Validation ✅

**Problem:** spaceId could be undefined/null without clear error, causing silent failures.

**Solution:**
- Added strict validation in `ChatThreadScreen.tsx` at message send
- Throws error in `__DEV__` mode if spaceId is missing: `"[P0] spaceId is required for space_chat lane"`
- Consolidated debug logging to validation point
- Removed duplicate logging later in flow

**Impact:** 
- Immediate detection of spaceId issues during development
- Clear error messages for debugging
- Guaranteed spaceId presence in CortexContext for space_chat lane

---

### A3) Intent Thresholds Raised ✅

**Problem:** Chips appearing too aggressively at low confidence levels.

**Solution:**
Updated thresholds in both `detectIntent.ts` and `conversation.ts`:

| Intent Type | Old Threshold | New Threshold | Change |
|-------------|---------------|---------------|--------|
| habit       | 0.85          | 0.90          | +0.05  |
| todo        | 0.88          | 0.92          | +0.04  |
| note        | 0.80          | 0.85          | +0.05  |
| question    | 0.70          | 0.70          | (same) |
| reflection  | 0.75          | 0.75          | (same) |
| idea        | 0.75          | 0.75          | (same) |

**Impact:**
- Fewer false positive chip suggestions
- More confident intent detection required before showing chips
- Better user experience with less pushy behavior
- Cooldown mechanism still active (2 turns default via `EXPO_PUBLIC_INTENT_COOLDOWN_TURNS`)

---

### A4) Overlay Prefill Mapping ✅

**Problem:** Overlay prefill logic not correctly mapping title/body for different entity types.

**Solution:**
Improved `convertFromChip` in `ChatThreadScreen.tsx`:

**For Notes:**
- Title: Strips prefixes like "remember:", "note:", "don't forget"
- Body: Contains original user message (unmodified)
- Example: "remember: buy milk" → title="buy milk", body="remember: buy milk"

**For Todos:**
- Title: Converts to imperative form (removes "I need to", "I have to")
- Body: Empty string
- Example: "I need to call mom" → title="call mom", body=""

**For Habits:**
- Title: Concise habit phrase (removes "start", "begin", "want to")
- Body: Empty string
- Example: "start running every morning" → title="running every morning", body=""

**Bridge Update:**
- Fixed `openUnifiedFromChat.ts` to ensure proper mapping: `initialTitle: initial.title || ''`
- UnifiedCreateOverlay already reads `conversionMeta.initialTitle/initialNote` correctly

**Impact:**
- Overlay now opens with properly formatted prefill values
- No overwriting on focus changes
- Better UX for chat-to-entity conversion

---

## Testing

### Test Results ✅

```
Test Suites: 88 passed, 6 skipped, 88 of 94 total
Tests:       883 passed, 72 skipped, 955 total
```

### Specific Test Coverage

1. **Router Tests** (`__tests__/cortex/router.test.ts`): ✅ 3/3 passed
   - Validates space_chat never returns catch-all message
   
2. **Intent Tests** (`__tests__/cortex/conversation.intent.test.ts`): ✅ 13/13 passed
   - Updated threshold expectations to 0.90 for habits
   - Validates high-confidence detection behavior

3. **Conversation Rules** (`__tests__/cortex/conversation.rules.test.ts`): ✅ 2/2 passed
   - Validates catch-all suppression in space_chat
   - Validates smalltalk fallback behavior

4. **Overlay Prefill** (`__tests__/overlay/prefill.note.test.tsx`): ✅ 2/2 passed
   - Validates note body prefill from chat conversion

5. **Full Cortex Suite** (`__tests__/cortex/`): ✅ 56/56 passed
   - All pipeline, intent, routing tests passing

---

## Files Modified

```
M  __tests__/cortex/conversation.intent.test.ts
M  app/spaces/ChatThreadScreen.tsx
M  app/spaces/chat/openUnifiedFromChat.ts
M  lib/cortex/intents/detectIntent.ts
M  lib/cortex/pipelines/conversation.ts
```

**Lines Changed:** +75 insertions, -40 deletions

---

## Configuration

No environment variables changed. Existing behavior:
- `EXPO_PUBLIC_INTENT_COOLDOWN_TURNS`: Default `2` (unchanged)
- `EXPO_PUBLIC_DEBUG_CORTEX`: `'on'` enables detailed logging
- `EXPO_PUBLIC_CHAT_CURIOSITY_PHASE`: `'true'` enables curiosity prompts

---

## Migration Notes

**No breaking changes.** All fixes are internal improvements that don't affect public APIs.

**User-Visible Changes:**
1. Fewer chip suggestions (higher confidence required)
2. Better prefilled overlay values when converting from chat
3. No more "Saving to Catch-All for now" in space chat
4. Dev errors if spaceId missing (development only)

---

## Next Steps

### P1 Fixes (High Priority - Performance)
- Implement request debouncing for rapid message sends
- Add caching for repeated intent detection
- Optimize context window assembly

### P2 Fixes (Medium Priority - UX Polish)
- Improve curiosity prompts
- Add intent confidence display in debug mode
- Better chip animation timing

### P3 Fixes (Low Priority - Nice-to-have)
- Intent detection tuning based on usage data
- Custom threshold overrides per space
- Extended prefill support for more entity types

---

## Validation Checklist

- [x] All Cortex tests passing (56/56)
- [x] Full test suite passing (883/955)
- [x] No "Saving to Catch-All" in space_chat
- [x] spaceId validation throws in dev
- [x] Intent thresholds updated consistently
- [x] Overlay prefill correctly maps title/body
- [x] No regression in existing features
- [x] Git commit with detailed message
- [x] Documentation complete

---

**Ready for:** Code review, QA testing, merge to main
