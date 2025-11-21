# Phase 2B: Overlay AI Removal Plan

## Files to Modify

### 1. components/overlay/useOverlayPrefill.ts
**Status:** ✅ COMPLETE
- Replaced entire file with stub returning empty values
- Exports: `suggestedTitle: null`, `suggestedTags: []`, `refresh: null`

### 2. components/overlay/UnifiedOverlayV2.tsx  
**Status:** 🔄 IN PROGRESS

#### Sections to Remove/Modify:

**A. Import Section (Line ~63)**
- ✅ Remove: `import useOverlayPrefill, { type SuggestedTag as PrefillSuggestedTag }`
- Add comment explaining Phase 2B

**B. Helper Functions (Lines 380-520)**
- Comment out or stub:
  - `isMindDropEntity()` - Line 380
  - `isMindDropAiLocked()` - Line 419  
  - `isRawSentenceTitle()` - Line 440
  - `normalizePrefillSuggestions()` - Line 512

**C. State/Hooks Section (Lines 1100-1180)**
- Remove: `shouldRunMindDropPrefill` useMemo (Line 1113)
- Remove: `rawSentence` useMemo (Line 1145)
- Remove: `shouldSkipAutoPrefill` (Line 1154)
- Remove: `useOverlayPrefill` hook call (Line 1172)
- Remove: AI prefill console logs

**D. Auto-Prefill useEffect (Lines 1180-1220)**
- Remove entire effect that runs `refreshPrefill()` on edit mode open
- This is the main AI trigger on overlay open

**E. Suggested Title Application (Lines 1220-1260)**
- Remove: `prefillSuggestionsRef` and `suggestedTitleRef` refs
- Remove: Auto-apply suggestedTitle effect (Line 1240)
- Remove: Manual title edit detection (Line 1250)

**F. Tag Suggestions Logic (Lines 1260-1340)**
- Remove: `normalizePrefillSuggestions` calls
- Remove: Tag merging from AI suggestions
- Remove: `sanitizedTagSuggestions`, `filteredTagSuggestions` useMemos

**G. AI Tag Override (Lines 1340-1450)**
- Remove: `aiTagOverrideAppliedRef` ref
- Remove: Entire effect that applies AI tags to Mind Drop items
- Remove: `mergeLogTags`, `filterHabitTags`, `hasOnlyGenericHabitTags` logic

**H. Re-suggest Actions (Lines 1600-1680)**
- Remove: `handleResuggestTags()` callback
- Remove: `handleResummarizeTitle()` callback  
- Remove: `applyResummarizedTitle` effect (Line 1682)

**I. UI Buttons/Controls**
- Remove any "Re-summarize" or "Re-suggest tags" buttons
- Remove AI loading states from UI

#### What to Keep:

1. **Core Editor Logic:**
   - Text input handling
   - Tag add/remove (user-driven only)
   - Title editing (user-driven only)
   - Save/cancel actions

2. **Initial State from Entity:**
   ```typescript
   // Use entity fields as-is (no AI enrichment)
   const initialTitle = entity.title || entity.name || '';
   const initialTags = entity.tags || [];
   const initialBody = entity.body || entity.details || entity.notes || '';
   ```

3. **Save Logic:**
   - Only send user-edited fields
   - Never overwrite AI-generated fields unless user explicitly changed them

### 3. components/overlay/overlayV2.state.ts
**Status:** PENDING

Remove state fields:
- Any prefill-related temporary state
- AI suggestion caches
- Mind Drop detection flags (if only used for AI)

### 4. Test Files
**Status:** PENDING

Update mocked `useOverlayPrefill` in test files to match new stub signature.

## Implementation Strategy

1. ✅ Stub useOverlayPrefill first (done)
2. 🔄 Remove AI logic from UnifiedOverlayV2.tsx (in progress)
   - Start with simple removals (refs, effects)
   - Then remove helper functions
   - Finally clean up UI elements
3. Clean up state file
4. Fix tests
5. Verify type-check passes
6. Document changes

## Expected Outcome

**Before Phase 2B:**
- Overlay calls AI on open → 500-2000ms delay
- Suggests title/tags based on entity body
- Re-runs AI when user clicks "Re-summarize"

**After Phase 2B:**
- Overlay opens instantly, shows entity.title/tags as-is
- No AI calls ever from overlay
- Pure editor: user types → saves → done
- Background prefill (Phase 2A) already populated title/tags after creation
