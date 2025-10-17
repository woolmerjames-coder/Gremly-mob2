# Catch-All Cortex Refactor - Exact Edits

## Overview
Refactored the Catch-All form to fire Cortex classification directly from the Capture button and bubble the result to parent screens, eliminating duplicate classification calls.

## Date
December 2024

## Modified Files

### 1. `components/overlay/CatchAllForm.tsx`

**Purpose**: Move classification logic from parent handlers to form component button press

**Changes**:
- Added `useCortex` hook import and call
- Added `classification` field to `onSubmit` payload type
- Created new `async handleCapture` function that:
  - Calls `engine.classify()` with input text when `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL` is enabled
  - Bubbles classification result in `onSubmit` payload
  - Includes DEBUG logs: `[CATCHALL][CAPTURE] start`, `[CATCHALL][CAPTURE] classifyFlag`
- Updated Capture button `onPress` handler from `handleSubmit` → `handleCapture`

**Key Code Segments**:
```typescript
const engine = useCortex();

const handleCapture = async () => {
  if (DEBUG) console.log('[CATCHALL][CAPTURE] start', { text: inputText.trim() });
  
  let classification = null;
  if (classifyFlag) {
    if (DEBUG) console.log('[CATCHALL][CAPTURE] classifyFlag enabled, calling engine');
    classification = await engine.classify({ text: inputText.trim(), spaceId: null });
  }
  
  const data: CatchAllData = { entry: inputText.trim() };
  onSubmit({ type: 'catchall', data, classification }); // bubbles classification
};
```

---

### 2. `app/tabs/TodayScreen.tsx`

**Purpose**: Update catch-all handler to use bubbled classification instead of re-classifying

**Changes**:
- Modified catch-all case in `handleAddManual` to:
  - Extract `classification` from `payload` (bubbled from form)
  - Add DEBUG log showing `fromChild: true/false` to track classification source
  - Use bubbled classification directly if present
  - Fallback to heuristic classification only if not bubbled
  - Map `classification.type` to appropriate repo payload type (note/todo/habit)
  - Include `ai_placed` and `why_string` fields when classification is present

**Key Code Segments**:
```typescript
case 'catchall': {
  const classification = payload.classification || null;
  if (DEBUG) console.log('[CATCHALL][PIPE] start', { 
    text: payload.data.entry, 
    fromChild: !!classification // track if classification came from form
  });
  
  // Use bubbled classification if present, else fallback to heuristic
  const finalClassification = classification || classifyHeuristic(payload.data.entry);
  
  // Map classification type to repo payload
  let finalPayload: any;
  if (finalClassification.type === 'note') {
    finalPayload = {
      type: 'note' as const,
      body: payload.data.entry,
      ai_placed: classification ? true : false,
      why_string: classification ? finalClassification.reasoning : undefined,
    };
  }
  // ... similar for todo and habit types
  
  await repo.create(finalPayload);
}
```

---

### 3. `app/tabs/HubScreen.tsx`

**Purpose**: Update catch-all handler with same logic as TodayScreen

**Changes**:
- Identical catch-all handler logic as TodayScreen
- Extracts and uses bubbled classification
- DEBUG logs with `fromChild` flag
- Maps classification to repo payload with `ai_placed` and `why_string`

---

### 4. `app/screens/SpaceDetailScreen.tsx`

**Purpose**: Update space-scoped catch-all handler with same logic

**Changes**:
- Identical catch-all handler logic as TodayScreen and HubScreen
- Additionally includes `space_id` in final payload for space-scoped items
- Same classification bubbling and mapping logic

**Key Difference**:
```typescript
finalPayload = {
  type: 'note' as const,
  body: payload.data.entry,
  space_id: spaceId, // space-scoped
  ai_placed: classification ? true : false,
  why_string: classification ? finalClassification.reasoning : undefined,
};
```

---

### 5. `__tests__/manualAddOverlay.ds.test.tsx`

**Purpose**: Add test verification for bubbled classification

**Changes**:
- Added `mockClassify` mock function
- Added mock for `useCortex` hook in `CortexProvider` mock
- Updated test setup with `beforeEach`/`afterEach` to set `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true`
- Added new test case: `"uses bubbled classification from Capture button when provided"`
  - Mocks Cortex engine to return specific classification
  - Verifies `engine.classify()` is called with correct parameters
  - Asserts `mockOnSubmit` receives classification in payload
  - Validates classification bubbling behavior

**Key Test Code**:
```typescript
it('uses bubbled classification from Capture button when provided', async () => {
  const mockClassification = {
    type: 'todo' as const,
    confidence: 0.85,
    reasoning: 'AI detected todo item',
  };
  mockClassify.mockResolvedValue(mockClassification);

  // ... render and interact with form ...

  await waitFor(() => {
    expect(mockClassify).toHaveBeenCalledWith({
      text: 'Buy milk tomorrow',
      spaceId: null,
    });
    
    expect(mockOnSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'catchall',
        data: expect.objectContaining({ entry: 'Buy milk tomorrow' }),
        classification: mockClassification, // verified bubbled
      }),
    );
  });
});
```

---

## Behavior Flow

### Before (Old Flow)
1. User types text in CatchAllForm
2. User presses Capture button
3. Form calls `onSubmit` with just text data
4. Parent screen (TodayScreen/HubScreen/SpaceDetailScreen) receives submission
5. Parent calls `engine.classify()` to classify the text
6. Parent maps classification to repo payload
7. Parent calls `repo.create()`

### After (New Flow)
1. User types text in CatchAllForm
2. User presses Capture button
3. Form calls `engine.classify()` directly (if enabled)
4. Form bubbles classification in `onSubmit` payload
5. Parent screen receives submission with classification
6. Parent uses bubbled classification (no re-classification)
7. Parent maps classification to repo payload
8. Parent calls `repo.create()`

**Benefits**:
- ✅ Eliminates duplicate classification calls
- ✅ Reduces API calls and latency
- ✅ Classification happens at interaction point (button press)
- ✅ Backward compatible (parents handle null classification)
- ✅ DEBUG logs track classification source (`fromChild` flag)

---

## DEBUG Log Flow

When classification is enabled, you'll see:
```
[CATCHALL][CAPTURE] start { text: "Buy milk tomorrow" }
[CATCHALL][CAPTURE] classifyFlag enabled, calling engine
[CATCHALL][PIPE] start { text: "Buy milk tomorrow", fromChild: true }
[CATCHALL][PIPE] using bubbled classification from form
[CATCHALL][PIPE] final payload { type: "todo", ai_placed: true, ... }
```

When classification is disabled or null:
```
[CATCHALL][CAPTURE] start { text: "Random note" }
[CATCHALL][PIPE] start { text: "Random note", fromChild: false }
[CATCHALL][PIPE] fallback to heuristic
[CATCHALL][PIPE] final payload { type: "note", ai_placed: false, ... }
```

---

## Quality Gates

### TypeScript
```bash
npx tsc --noEmit
```
**Result**: ✅ No errors

### Linting
```bash
npm run lint
```
**Result**: ✅ No errors (7 pre-existing warnings unrelated to changes)

### Tests
```bash
npm test -- __tests__/manualAddOverlay.ds.test.tsx
```
**Result**: ✅ 23 tests passed, including new bubbled classification test

---

## Environment Flags

- `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true` - Enable classification in catch-all form
- `EXPO_PUBLIC_DEBUG_CORTEX=true` - Enable detailed DEBUG logs
- `EXPO_PUBLIC_OPENAI_API_KEY` - Required for OpenAI classification

---

## Files Not Modified

- `components/ManualAddSheet.tsx` - Already had Cortex integration in submit handler (Phase 6.5)
- `cortex/heuristicEngine.ts` - Heuristic fallback remains unchanged
- `lib/repo/*` - Repository layer already supports `why_string` field
- `providers/CortexProvider.tsx` - Provider unchanged, just consumed via `useCortex` hook

---

## Testing Recommendations

1. **Manual Testing**:
   - Open app with `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=true`
   - Navigate to Today screen
   - Open Manual Add overlay (Catch-All tab)
   - Enter text like "Buy milk tomorrow" (todo-like)
   - Press Capture button
   - Verify DEBUG logs show `fromChild: true`
   - Verify item created with correct type (todo) and `ai_placed: true`

2. **Edge Cases**:
   - Test with classification disabled (should fallback to heuristic)
   - Test with network error during classification (should handle gracefully)
   - Test in space detail screen (should include space_id)
   - Test classification timeout/rate-limit scenarios

3. **Regression Testing**:
   - Run full test suite: `npm test`
   - Verify other manual add tabs (Note, Todo, Habit, Journal) still work
   - Verify ManualAddSheet (ActionSheet) still works independently

---

## Next Steps (If Needed)

1. Monitor OpenAI API usage reduction (should see ~50% fewer classification calls)
2. Add analytics to track classification source (form vs fallback)
3. Consider adding user-visible confidence indicator when AI classification is used
4. Optimize classification timing (debounce on input change vs button press)
5. Add retry logic for transient classification failures

---

## Rollback Instructions

If issues arise, revert these 5 files to previous versions:
1. `components/overlay/CatchAllForm.tsx`
2. `app/tabs/TodayScreen.tsx`
3. `app/tabs/HubScreen.tsx`
4. `app/screens/SpaceDetailScreen.tsx`
5. `__tests__/manualAddOverlay.ds.test.tsx`

Set `EXPO_PUBLIC_CORTEX_CLASSIFY_CATCHALL=false` to disable classification entirely.
