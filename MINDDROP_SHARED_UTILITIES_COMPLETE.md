# Mind Drop Shared Utilities Implementation

## Summary
Created a unified helper module (`lib/minddrop/minddropShared.ts`) that consolidates tag cleaning and field mapping logic for Mind Drop items (habits, todos, logs/notes).

## Files Created

### 1. `lib/minddrop/minddropShared.ts`
Shared utilities module with:

**Types:**
```typescript
export type MindDropItemKind = 'log' | 'todo' | 'habit';

export interface MindDropSource {
  rawText: string;       // Full sentence from Mind Drop input
  aiTags?: string[];     // Tags from Cortex/Overlay prefill
}

export interface MindDropDerivedFields {
  title?: string;
  name?: string;
  body?: string | null;
  notes?: string | null;
  tags: string[];
}
```

**Functions:**
- `buildMindDropTags(source, kind)`: Unified tag cleaning logic
  - Uses AI tags if available
  - Falls back to `buildFallbackTags()` if not
  - Applies `filterAndNormalizeTags()` to strip junk words
  - **Same logic for todos, habits, and logs**

- `buildMindDropDerivedFields(kind, source)`: Field mapping per item type
  - **Log**: Full sentence in `title` and `body`
  - **Todo**: Sentence in `title`/`name`, null `body`/`notes`
  - **Habit**: Sentence in `title`/`name`/`notes`, undefined `body`

### 2. `lib/minddrop/__tests__/minddropShared.test.ts`
Comprehensive test suite with 10 test cases:

**Tag Cleaning Tests (4):**
- ✅ Filters junk words from AI tags
- ✅ Generates fallback tags when AI tags absent
- ✅ Returns same cleaned tags for all item kinds
- ✅ Handles empty AI tags gracefully

**Field Mapping Tests (6):**
- ✅ Habit: name, title, notes with full sentence
- ✅ Todo: title, name, null body/notes
- ✅ Log: title and body with full sentence
- ✅ Trims whitespace
- ✅ All kinds get same cleaned tags from same AI input
- ✅ Preserves full sentence in habit notes

**Test Results**: 10/10 passing ✅

## Architecture

### Tag Pipeline
```
User Input → Cortex AI → engineTags + classificationTags
                              ↓
                    buildMindDropTags()
                              ↓
                    filterAndNormalizeTags()
                              ↓
                    Remove junk words (TAG_STOP_WORDS)
                              ↓
                    Normalize format (#tag, @mention)
                              ↓
                    Deduplicate
                              ↓
                    Final cleaned tags
```

### Field Mapping

| Kind  | title       | name        | body        | notes       |
|-------|-------------|-------------|-------------|-------------|
| log   | full text   | -           | full text   | -           |
| todo  | full text   | full text   | null        | null        |
| habit | full text   | full text   | undefined   | full text   |

## Integration Points

### Current Usage
This module **unifies existing logic** from:
- `CatchAllNotepad.tsx` lines 2255-2315 (Mind Drop auto-create)
- `filterAndNormalizeTags()` from `lib/tags/normalize.ts`
- `buildFallbackTags()` from `cortex/openAiEngine.ts`

### Future Migration
The Mind Drop creation code in `CatchAllNotepad.tsx` can be refactored to use:
```typescript
import { buildMindDropDerivedFields } from '@/lib/minddrop/minddropShared';

// Instead of manual field mapping:
const fields = buildMindDropDerivedFields('habit', {
  rawText: trimmed,
  aiTags: combinedTags,
});

// Then use:
// fields.title, fields.name, fields.notes, fields.tags
```

## Benefits

### 1. **Consistency**
- Todos, habits, and logs all use identical tag cleaning logic
- Same junk word filtering (no more `#every`, `#minutes`, `#daily`)
- Single source of truth for field mapping

### 2. **Maintainability**
- Tag cleanup logic in one place
- Easy to add new item kinds
- Clear separation of concerns

### 3. **Testability**
- Comprehensive unit tests (10 test cases)
- Independent of UI components
- Fast, focused tests

### 4. **Type Safety**
- TypeScript interfaces for all data structures
- Clear contracts between modules
- Compile-time validation

## Tag Cleanup Rules

The unified tag cleaner filters out:
- **Time words**: `morning`, `afternoon`, `evening`, `night`
- **Frequency words**: `every`, `daily`, `weekly`, `monthly`
- **Duration words**: `minutes`, `mins`, `hours`, `days`, `weeks`, `months`
- **Generic words**: `before`, `after`, `during`, `each`, `all`
- **Meal times**: `lunch`, `dinner`
- **40+ other stop words** (see `lib/tags/constants.ts`)

## Example Usage

```typescript
import { buildMindDropDerivedFields } from '@/lib/minddrop/minddropShared';

// Example 1: Habit
const habitFields = buildMindDropDerivedFields('habit', {
  rawText: 'Run every morning for 30 minutes',
  aiTags: ['#running', '#every', '#morning', '#fitness', '#minutes'],
});
// Result:
// {
//   title: 'Run every morning for 30 minutes',
//   name: 'Run every morning for 30 minutes',
//   notes: 'Run every morning for 30 minutes',
//   body: undefined,
//   tags: ['#running', '#fitness']  // junk words filtered
// }

// Example 2: Todo
const todoFields = buildMindDropDerivedFields('todo', {
  rawText: 'Book flight back home to SFO',
  aiTags: ['#travel', '#flight'],
});
// Result:
// {
//   title: 'Book flight back home to SFO',
//   name: 'Book flight back home to SFO',
//   body: null,
//   notes: null,
//   tags: ['#travel', '#flight']
// }

// Example 3: Log
const logFields = buildMindDropDerivedFields('log', {
  rawText: 'Today I finally completed the marathon',
  aiTags: ['#accomplishment', '#running'],
});
// Result:
// {
//   title: 'Today I finally completed the marathon',
//   body: 'Today I finally completed the marathon',
//   tags: ['#accomplishment', '#running']
// }
```

## Testing

Run tests:
```bash
npm test -- lib/minddrop/__tests__/minddropShared.test.ts
```

Expected: 10/10 tests passing ✅

## Implementation Date
2025-11-18

## Status
✅ **COMPLETE**
- Module created: ✅
- Type definitions: ✅
- Tag cleaning function: ✅
- Field mapping function: ✅
- Unit tests: ✅ (10/10 passing)
- Documentation: ✅

## Next Steps (Optional Migration)

To fully integrate this module into the Mind Drop flow:

1. Update `CatchAllNotepad.tsx` to use `buildMindDropDerivedFields()`
2. Replace manual tag/field logic with helper calls
3. Reduce code duplication
4. Run integration tests

This migration is **optional** - the module can be used for new code while existing code continues to work.
