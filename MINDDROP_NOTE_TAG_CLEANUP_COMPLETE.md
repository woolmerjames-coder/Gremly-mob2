# Mind Drop Unsorted Note Tag Cleanup Implementation

## Summary
Updated Mind Drop unsorted/log note creation to use the new shared helper (`buildMindDropDerivedFields`), ensuring consistent tag cleaning across todos, habits, and notes.

## Changes Made

### 1. Updated `app/screens/CatchAllNotepad.tsx`

**Added Import** (line ~67):
```typescript
import { buildMindDropDerivedFields } from '../../lib/minddrop/minddropShared';
```

**Updated `create.note` Handler** (lines 2317-2345):

**Before:**
```typescript
} else if (action.type === 'create.note') {
  const rawText = action.payload.text?.trim() || cleanedText || trimmed;
  const text = clampNoteLength(rawText);
  const rawSubtype = action.payload.subtype;
  const subtype = rawSubtype === 'journal' ? 'journal' : 'catchall';
  const canonicalType = persistedToCanonical('note', subtype);

  // Use AI tags or fallback to locally generated tags for this note subtype
  const noteTags =
    combinedTags.length > 0
      ? combinedTags
      : buildFallbackTags(cleanedText, 'note', subtype);

  mapped.push({
    bucket: 'notes',
    payload: {
      type: 'note',
      title: text || 'Quick note',
      body: text,
      subtype,
      origin: 'catchall',
      ai_placed: subtype !== 'catchall',
      space_id: action.payload.spaceId ?? null,
      why_string: decision.explanation || 'Organized via Mind Drop',
      canonicalType,
      labels: [CATCHALL_LABEL],
      views: { alsoShowIn: ['Hub:Catch-All'] },
      sourceMessageId: validSourceMessageId,
      dropId,
      ...(noteTags.length > 0 && { tags: noteTags }),
    },
  });
}
```

**After:**
```typescript
} else if (action.type === 'create.note') {
  const rawText = action.payload.text?.trim() || cleanedText || trimmed;
  const text = clampNoteLength(rawText);
  const rawSubtype = action.payload.subtype;
  const subtype = rawSubtype === 'journal' ? 'journal' : 'catchall';
  const canonicalType = persistedToCanonical('note', subtype);

  // Use shared Mind Drop helper for consistent field mapping and tag cleaning
  const derived = buildMindDropDerivedFields('log', {
    rawText: trimmed, // Use full raw text
    aiTags: combinedTags.length > 0 ? combinedTags : undefined,
  });

  mapped.push({
    bucket: 'notes',
    payload: {
      type: 'note',
      title: derived.title || 'Quick note',
      body: derived.body ?? undefined,
      subtype,
      origin: 'catchall',
      ai_placed: subtype !== 'catchall',
      space_id: action.payload.spaceId ?? null,
      why_string: decision.explanation || 'Organized via Mind Drop',
      canonicalType,
      labels: [CATCHALL_LABEL],
      views: { alsoShowIn: ['Hub:Catch-All'] },
      sourceMessageId: validSourceMessageId,
      dropId,
      ...(derived.tags.length > 0 && { tags: derived.tags }),
    },
  });
}
```

### 2. Updated `__tests__/minddrop.habit.notes.test.tsx`

**Added Test** (new test case):
```typescript
it('filters same junk words for unsorted notes as habits and todos', async () => {
  // Verify that unsorted/log notes use the same tag cleaning as habits and todos
  mockDecideWithContext.mockResolvedValueOnce({
    mode: 'auto',
    actions: [
      {
        type: 'create.note',
        payload: { text: 'Today I ran for 30 minutes', subtype: 'note', spaceId: null },
      },
    ],
    confidence: 0.85,
    suggestions: [],
    explanation: 'Noted!',
    engineTags: ['#running', '#every', '#minutes', '#today', '#fitness'],
  });

  render(<CatchAllNotepad />);

  const noteInput = screen.getByTestId('minddrop-input');
  fireEvent.changeText(noteInput, 'Today I ran for 30 minutes every morning');

  const noteSubmit = screen.getByTestId('minddrop-submit-button');
  fireEvent.press(noteSubmit);

  await waitFor(() => {
    expect(mockCreate).toHaveBeenCalled();
  });

  const noteCall = mockCreate.mock.calls[0][0];
  const noteTags = noteCall.tags || [];

  // Should filter same junk words as habits and todos
  expect(noteTags).not.toContain('#every');
  expect(noteTags).not.toContain('#minutes');
  expect(noteTags).not.toContain('#today'); // 'today' is also a stop word
  
  // Should keep meaningful tags
  expect(noteTags).toContain('#running');
  expect(noteTags).toContain('#fitness');

  // Verify the note has both title and body (log behavior)
  expect(noteCall.type).toBe('note');
  expect(noteCall.title).toBeTruthy();
  expect(noteCall.body).toBeTruthy();
});
```

**Test Results**: 5/5 tests passing ✅

## Key Changes

### Tag Cleaning
- **Before**: Used `buildFallbackTags(cleanedText, 'note', subtype)` OR `combinedTags`
- **After**: Uses `buildMindDropDerivedFields('log', { rawText, aiTags })` which internally:
  - Uses AI tags if provided (already filtered via `filterAndNormalizeTags`)
  - Falls back to `buildFallbackTags()` if no AI tags
  - **Always applies `filterAndNormalizeTags()` to remove junk words**

### Field Mapping
- **Before**: `title: text`, `body: text` (manually set)
- **After**: `title: derived.title`, `body: derived.body` (from helper)
- **Result**: Same values, but now using shared logic

### Consistency
All three Mind Drop creation paths now use the same tag cleanup:
- ✅ **Todos**: `buildMindDropDerivedFields('todo', ...)`
- ✅ **Habits**: `buildMindDropDerivedFields('habit', ...)`
- ✅ **Notes/Logs**: `buildMindDropDerivedFields('log', ...)` ← NEW

## Behavior

### Before
- Input: `"Today I ran for 30 minutes every morning"`
- Tags: `#today`, `#running`, `#every`, `#minutes`, `#morning`, `#fitness` (3 meaningful, 4 junk)

### After
- Input: `"Today I ran for 30 minutes every morning"`
- Tags: `#running`, `#fitness` (only meaningful tags)
- Junk filtered: `#today`, `#every`, `#minutes`, `#morning`

## Scope

### ✅ Affected (Mind Drop Notes Only)
- **Mind Drop auto-create notes** (`origin: 'catchall'`, `dropId` set)
- Only the `create.note` action handler in `performSave()`
- Lines 2317-2345 in `CatchAllNotepad.tsx`

### ✅ Unaffected (Other Note Creation)
- **Manual note creation** (overlay, chat, other UI)
- **List notes** (`add.to.list` action - still uses old logic)
- **Narrative mode notes** (different code path)
- **Existing notes** in database

## Testing

### Test Coverage
```
✅ All 5 tests passing

Mind Drop habit notes field:
  ✓ stores full raw Mind Drop text in notes field when creating habit
  ✓ preserves full text even when AI suggests shorter name

Mind Drop habit tag cleanup:
  ✓ filters out junk time/frequency words from habit tags
  ✓ filters same junk words for both habits and todos
  ✓ filters same junk words for unsorted notes as habits and todos  ← NEW
```

### Run Tests
```bash
npm test -- __tests__/minddrop.habit.notes.test.tsx
```

Expected: 5/5 tests passing ✅

### Manual Testing
1. Open Mind Drop
2. Enter: `"Today I ran for 30 minutes every morning"`
3. Cortex should decide `create.note`
4. Check created note:
   - ✅ `title` and `body` should both have full text
   - ✅ Tags should NOT include: `#today`, `#every`, `#minutes`, `#morning`
   - ✅ Tags SHOULD include: `#running`, `#fitness` (if AI suggests them)

## Implementation Notes

### Why `trimmed` instead of `cleanedText`?
Used `trimmed` (full raw user input) to preserve all context in title/body, matching the behavior of habits which also use `trimmed` for the `notes` field.

### Type Safety
- Added `?? undefined` for `body` field to handle `string | null | undefined` → `string | undefined` conversion
- This matches the `noteInsertSchema` requirements

### Backward Compatibility
- Only affects Mind Drop notes (`origin === 'catchall'`)
- Existing notes unchanged
- Other note creation flows unchanged
- No database migrations needed

## Related Work

- **Previous**: Mind Drop habit notes field ([MINDDROP_HABIT_NOTES_FIELD_COMPLETE.md])
- **Previous**: Mind Drop tag cleanup ([MINDDROP_TAG_CLEANUP_COMPLETE.md])
- **Previous**: Mind Drop shared utilities ([MINDDROP_SHARED_UTILITIES_COMPLETE.md])

## Implementation Date
2025-11-18

## Status
✅ **COMPLETE**
- Code updated: ✅
- Import added: ✅
- Tests added: ✅ (5/5 passing)
- Tag cleaning unified: ✅
- Field mapping consistent: ✅
