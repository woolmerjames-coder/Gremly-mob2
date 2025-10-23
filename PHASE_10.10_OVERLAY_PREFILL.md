# Phase 10.10: Overlay Prefill Correction

**Status:** ✅ Complete  
**Branch:** `feat/10.10-cortex-audit-hardening`  
**Commit:** `820817d`  
**Date:** 2025-01-24

## Overview

Corrected overlay prefill mapping to use the **current user message text** that triggered the action, rather than using the first message or last assistant message. Created utility functions for smart title extraction and structured data parsing to ensure proper prefill values for notes, todos, and habits.

## Problem Statement

**Before:**
- Overlay was using `lastUser` message from the messages array
- Required finding the last user message before assistant response
- Prefill logic was embedded in ChatThreadScreen
- Inconsistent handling of command verbs and prefixes

**After:**
- Uses `lastUserMessage` state variable (current user text)
- Clean utility functions for each entity type
- Proper prefix stripping and imperative form conversion
- Comprehensive test coverage

## Implementation

### 1. Prefill Utility Functions

**Location:** `app/spaces/chat/prefillUtils.ts`

#### smartTitle()
Strips common prefixes from note text:
```typescript
smartTitle('Remember: cancel gym') → 'cancel gym'
smartTitle('Note: call mom tomorrow') → 'call mom tomorrow'
```

**Patterns Removed:**
- `remember`, `note`, `don't forget`, `remind me`
- `keep in mind`, `write down`, `jot down`
- With optional colons/semicolons and spaces

#### extractTodoTitle()
Converts to imperative form:
```typescript
extractTodoTitle('I need to buy milk') → 'buy milk'
extractTodoTitle('Create a todo to call John') → 'call John'
extractTodoTitle('Add buy flowers') → 'buy flowers'
```

**Conversions:**
1. Remove command verbs: `set`, `add`, `create`, `remember`, `save`, `send`, `log`
2. Convert intent phrases: `I need to`, `I have to`, `I should`, `I must`
3. Remove leading `to` after command removal

#### parseHabit()
Extracts habit name and cadence:
```typescript
parseHabit('Meditate every day') → { name: 'Meditate', cadence: 'every day' }
parseHabit('Add a habit to run every morning') → { name: 'run', cadence: 'every morning' }
```

**Extractions:**
1. Remove command verbs: `set`, `add`, `create`, `save`, `log`
2. Remove prefixes: `start`, `begin`, `want to`, `would like to`
3. Extract cadence: `every [day/morning/night/week/month/Monday/etc]`, `daily`, `weekly`, `monthly`
4. Clean name by removing cadence

### 2. ChatThreadScreen Updates

**Location:** `app/spaces/ChatThreadScreen.tsx`

#### Prefill Mapping
```typescript
// NOTE
if (kind === 'note') {
  initial = {
    title: smartTitle(userText),
    note: userText,  // Preserves full original text
  };
}

// TODO
if (kind === 'todo') {
  initial = {
    title: extractTodoTitle(userText),
  };
}

// HABIT
if (kind === 'habit') {
  const habitData = parseHabit(userText);
  initial = {
    title: habitData.name,
    // cadence: habitData.cadence  // Future enhancement
  };
}
```

#### Logging
```typescript
console.log('[ChatThread][10.10] Opening overlay', {
  kind,
  prefill: initial,
  userText,
});
```

**Purpose:**
- Debug overlay opens
- Verify prefill correctness
- Track which user message triggered action

### 3. Data Flow

```
User types message → Cortex detects intent → Shows chip
        ↓
User clicks chip → handleSuggestionPress → convertFromChip
        ↓
Uses lastUserMessage (current user text that triggered action)
        ↓
Applies utility function based on kind:
  - note: smartTitle + full text
  - todo: extractTodoTitle
  - habit: parseHabit
        ↓
Opens overlay with correct prefill
```

## Testing

### Unit Tests

**File:** `__tests__/spaces/chat/prefillUtils.test.ts`

**Coverage (29 tests):**

**smartTitle (8 tests):**
1. ✅ Strips "Remember:" prefix
2. ✅ Strips "Note:" prefix
3. ✅ Strips "Don't forget" prefix
4. ✅ Strips "Remind me" prefix
5. ✅ Handles text without prefix
6. ✅ Handles empty text
7. ✅ Preserves text when no match
8. ✅ Strips "write down:" with colon and space

**extractTodoTitle (8 tests):**
1. ✅ Removes command verb "Add"
2. ✅ Removes command verb "Create" with "a todo"
3. ✅ Converts "I need to" to imperative
4. ✅ Converts "I have to" to imperative
5. ✅ Converts "I should" to imperative
6. ✅ Handles direct imperative form
7. ✅ Removes "Send a todo:" prefix
8. ✅ Handles empty text

**parseHabit (9 tests):**
1. ✅ Extracts habit name with "every day" cadence
2. ✅ Extracts habit name with "every morning" cadence
3. ✅ Extracts habit with "daily" cadence
4. ✅ Removes "Add a habit" prefix
5. ✅ Removes "start" prefix
6. ✅ Removes "want to" prefix
7. ✅ Handles habit without cadence
8. ✅ Handles specific day cadence
9. ✅ Handles empty text

**Integration Tests (4 tests):**
1. ✅ Note: "Remember: cancel gym" → title='cancel gym', note='Remember: cancel gym'
2. ✅ Note: Preserves full text in note field
3. ✅ Todo: Creates imperative title
4. ✅ Habit: Extracts name and cadence

### Test Results

```
Test Suites: 1 passed, 1 total
Tests:       29 passed, 29 total
Time:        0.707 s
```

All Cortex tests still passing: **77 passed**

## Examples

### Note Prefill

**Input:** `"Remember: cancel gym"`

**Prefill:**
```typescript
{
  title: 'cancel gym',
  note: 'Remember: cancel gym'
}
```

**Result:**
- Title field: Clean, actionable text
- Note field: Full original context preserved

### Todo Prefill

**Input:** `"I need to buy milk and eggs"`

**Prefill:**
```typescript
{
  title: 'buy milk and eggs'
}
```

**Result:**
- Imperative form, ready to use
- No "I need to" prefix cluttering title

### Habit Prefill

**Input:** `"Add a habit to meditate every morning"`

**Prefill:**
```typescript
{
  title: 'meditate',
  // cadence: 'every morning' (future)
}
```

**Result:**
- Clean habit name
- Cadence parsed for future cadence selector

## Command Verb Handling

Both command verbs (from explicit commands) and intent phrases are properly stripped:

**Command Verbs:**
- `Set a reminder to call mom` → `call mom`
- `Add buy groceries` → `buy groceries`
- `Create a todo to review document` → `review document`

**Intent Phrases:**
- `I need to finish report` → `finish report`
- `I should clean garage` → `clean garage`
- `Want to exercise daily` → `exercise` + `daily` cadence

## Integration with Explicit Commands

Works seamlessly with Phase 10.10 explicit command handling:

**Flow:**
1. User: `"Add a habit to meditate every morning"`
2. Cortex: Detects `isCommand=true`, `kind='habit'`
3. Pipeline: Opens overlay immediately
4. ChatThread: Uses `parseHabit()` to extract:
   - `name: 'meditate'`
   - `cadence: 'every morning'`
5. Overlay: Opens with clean prefill

## Files Modified

1. **app/spaces/ChatThreadScreen.tsx** (+20 lines, -44 deletions)
   - Import utility functions
   - Replace `convertFromChip` to use `lastUserMessage`
   - Apply utility functions based on kind
   - Add `[ChatThread][10.10]` logging

2. **app/spaces/chat/prefillUtils.ts** (+84 lines, new file)
   - `smartTitle()` function
   - `extractTodoTitle()` function
   - `parseHabit()` function
   - `HabitPrefill` interface

3. **__tests__/spaces/chat/prefillUtils.test.ts** (+177 lines, new file)
   - Comprehensive test coverage
   - Integration test scenarios

## Logging Format

```
[ChatThread][10.10] Opening overlay {
  kind: 'note',
  prefill: { title: 'cancel gym', note: 'Remember: cancel gym' },
  userText: 'Remember: cancel gym'
}
```

**Purpose:**
- Debug overlay prefill issues
- Verify correct text extraction
- Track user message → prefill transformation

## Edge Cases Handled

1. **Empty Text:** Returns empty string, doesn't crash
2. **No Prefix:** Returns text as-is
3. **Multiple Prefixes:** Removes first match only
4. **Cadence Without Habit:** Extracts name correctly
5. **Command Verb Only:** Handles gracefully
6. **Nested "to":** `"to call to discuss"` → `"call to discuss"`

## Future Enhancements

1. **Cadence Selector in Overlay**
   - Pass `habitData.cadence` to overlay
   - Pre-select cadence dropdown/picker
   - Reduce manual data entry

2. **Due Date Extraction for Todos**
   - Parse "tomorrow", "next week", "Monday"
   - Pre-fill due date picker

3. **Tags Extraction**
   - Parse hashtags: `"#work meeting notes"`
   - Auto-tag entity

4. **Location Extraction**
   - Parse "at gym", "in office"
   - Pre-fill location field

5. **Priority Extraction**
   - Parse "urgent", "important"
   - Set priority flag

## Benefits

### Before
```typescript
// Hard to understand, brittle
const lastUser = messages.find((m, index) => 
  (m.role === 'user' && index === messages.length - 1) ||
  (index < messages.length - 1 && messages[index + 1]?.role === 'assistant')
);
const lastUserText = lastUser?.content || '';
const todoTitle = lastUserText.replace(/^(i need to|i have to)\s+/i, '');
```

### After
```typescript
// Clear, testable, maintainable
const userText = lastUserMessage.trim();
const prefill = {
  title: extractTodoTitle(userText)
};
```

### Improvements
- ✅ **Clearer:** Uses current user message, not complex find logic
- ✅ **Testable:** Pure functions with comprehensive tests
- ✅ **Maintainable:** Separated concerns, easy to update
- ✅ **Correct:** Handles command verbs, prefixes, imperative form
- ✅ **Logging:** Debug-friendly console markers

## Related Work

- **Phase 10.10 Explicit Commands:** Command verb detection
- **Phase 10.7E:** Context building with database messages
- **Phase 10.7D:** Intent detection improvements
- **P0 Batch A:** Original overlay prefill fix (partial)

## Notes

- All 77 Cortex tests passing ✅
- 29 new prefill utility tests passing ✅
- No breaking changes to existing functionality
- Production-ready for Space Chat
- Committed and pushed to `feat/10.10-cortex-audit-hardening`

---

**Implementation Complete:** ✅  
**Tests Passing:** ✅  
**Documentation:** ✅  
**Committed:** ✅  
**Pushed:** ✅
