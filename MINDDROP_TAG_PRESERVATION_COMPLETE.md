# Mind Drop Tag Preservation Implementation

## Summary

Implemented tag fallback and preservation behavior for Mind Drop → todo/habit conversion and overlay saves, ensuring tags from the source unsorted note are never lost.

## Problem

When converting an unsorted note to a todo/habit via Mind Drop:
1. **BackgroundPrefill was overwriting tags**: If AI returned no tags (or empty array), existing tags from the source note were lost
2. **No fallback logic**: Tags from the unsorted note weren't being used as a fallback when AI didn't provide tags
3. **Potential tag loss on save**: Risk of wiping tags when editing title/due date in overlay

## Solution

### PART 1: Tag Fallback in BackgroundPrefill

**File**: `lib/minddrop/backgroundPrefill.ts`

**Changes**:
- Modified tag update logic for todos and habits
- Fetch existing tags from the entity before updating
- Use fallback logic: `aiTags.length > 0 ? aiTags : existingTags`
- Only update tags if we have something better than what's already there
- Added detailed logging to track tag source (ai/fallback/none)

**Behavior**:
```typescript
// Before: Always overwrote with AI tags (even if empty)
if (aiTags && aiTags.length > 0) {
  updatePayload.tags = filterAndNormalizeTags(aiTags);
}

// After: Use AI tags if present, otherwise preserve existing tags
const existingTags = fullTodo.tags || [];
const effectiveTags = 
  aiTags.length > 0 
    ? filterAndNormalizeTags(aiTags) 
    : existingTags.length > 0 
      ? existingTags 
      : [];
```

### PART 2: Overlay Save Preservation (Verified)

**File**: `components/overlay/UnifiedOverlayV2.tsx`

**Existing Behavior** (already correct):
- `toCreateOrUpdateInput` has `shouldIncludeTags` logic
- Only includes tags in patch if they were actually modified (`tagsDirty && tagsHaveChanged`)
- Otherwise preserves `existingTagsMeta` from the entity
- This ensures changing title/due date doesn't wipe tags

### PART 3: Multi-line Title Fix

**File**: `lib/minddrop/normalizeTodoTitle.ts`

**Changes**:
- Updated `createFallbackTitle` to only use first line for multi-line text
- Prevents todo titles from being "Buy milk Buy eggs Buy bread" when the body is multi-line
- Now correctly extracts "Buy milk" as the title while preserving full text in body

**Behavior**:
```typescript
// For multi-line text, only use the first line for the title
const firstLine = body.trim().split('\n')[0].trim();
const words = firstLine.split(/\s+/);
```

## Tests

### New Test File: `__tests__/minddrop.tag.fallback.test.tsx`

**6 comprehensive tests**:
1. ✅ Unsorted note with tags → todo (AI returns no tags) → todo gets source note tags
2. ✅ Unsorted note with tags → habit (AI returns no tags) → habit gets source note tags
3. ✅ Unsorted note without tags → todo → tags extracted from text via buildFallbackTags
4. ✅ Unsorted note with complex tags → todo → all source tags preserved
5. ✅ Todo with tags (conversion path) → tags preserved through conversion
6. ✅ Habit with tags + sticky meta → tags and metadata preserved

**All tests passing** ✅

### Regression Tests

- ✅ `__tests__/lib/conversion.unsortedToTodo.test.ts` (16 tests)
- ✅ `__tests__/lib/conversion.unsortedToHabit.test.ts` (all tests)

## Flow Diagram

```
Mind Drop Input: "Email accountant about tax deadline #work #email #tax"
         ↓
1. Create unsorted note with tags: ["#work", "#email", "#tax"]
   - saveToUnsortedTray() in CatchAllNotepad.tsx
   - tags from Mind Drop input preserved
         ↓
2. User taps "To-Do" chip
   - convertUnsortedToTodo(repo, noteId) called
   - buildMindDropDerivedFields('todo', { rawText, aiTags: note.tags })
   - note.tags used as aiTags parameter → preserved in todo
         ↓
3. Todo created with tags: ["#work", "#email", "#tax"]
   - repo.create({ type: 'todo', tags: ["#work", "#email", "#tax"], ... })
         ↓
4. BackgroundPrefill runs
   - Cortex returns aiTags: [] (no AI tags)
   - Fetches existing tags from todo: ["#work", "#email", "#tax"]
   - effectiveTags = aiTags.length > 0 ? aiTags : existingTags
   - Result: tags preserved as ["#work", "#email", "#tax"] ✅
         ↓
5. Overlay opens with todo
   - overlay.openEdit({ record: todo })
   - Todo displays with tags: ["#work", "#email", "#tax"]
         ↓
6. User edits title or due date (doesn't touch tags)
   - toCreateOrUpdateInput() checks shouldIncludeTags
   - Tags weren't modified → shouldIncludeTags = false
   - Patch sent to repo: { title: "Email accountant", due_at: "2025-01-20" }
   - Tags NOT included in patch → existing tags preserved ✅
```

## End-to-End Example

**Scenario**: User submits "Email accountant about tax deadline #work #email #tax" via Mind Drop

**Result**:
1. ✅ Unsorted note created with tags: `["#work", "#email", "#tax"]`
2. ✅ Todo created from note with same tags: `["#work", "#email", "#tax"]`
3. ✅ BackgroundPrefill preserves tags (no AI tags → uses existing)
4. ✅ Overlay opens showing all tags
5. ✅ User changes due date → tags still preserved
6. ✅ Final todo has all original tags intact

## Scope

**Changes affect**:
- Mind Drop → todo/habit conversion paths
- BackgroundPrefill tag update logic
- Multi-line todo title normalization

**Does NOT affect**:
- Logs/notes tag behavior
- Today view
- Spaces/People tagging
- Any non-Mind Drop creation paths

## Files Modified

1. `lib/minddrop/backgroundPrefill.ts` - Tag fallback logic for todos/habits
2. `lib/minddrop/normalizeTodoTitle.ts` - Multi-line title extraction
3. `__tests__/minddrop.tag.fallback.test.tsx` - New comprehensive test suite (6 tests)

## Verification

- ✅ All new tests passing (6/6)
- ✅ All existing conversion tests passing (16/16)
- ✅ No regressions in existing test suites
- ✅ Tag fallback working for both todos and habits
- ✅ Overlay save preserves tags when not modified
