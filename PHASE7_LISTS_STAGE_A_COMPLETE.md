# Phase 7 Lists: Mind Drop Stage A Integration Complete

**Status**: ✅ Complete  
**Date**: November 23, 2025

## Summary

Successfully updated Mind Drop Stage A to understand **lists as an attribute, not a subtype**. The pipeline now automatically detects list-like content and sets `has_list = true` + `list_items` for todos, habits, and notes, without changing the entity type or subtype classification.

## Key Changes

### 1. Canonical Mapper (`lib/minddrop/buildCanonicalFromMindDrop.ts`)

**Added list helper imports:**
```typescript
import { hasListLikeStructure, parseTextToListItems } from '../lists/helpers';
import type { ListItem } from '../lists/types';
```

**Extended `CanonicalPayload` interface:**
```typescript
export interface CanonicalPayload {
  // ... existing fields
  
  // Phase 7 Lists: List support for all entity types
  has_list: boolean;
  list_items: ListItem[] | null;
  
  // Updated comment
  subtype?: LogSubtype | null; // For logs: journal | reference | idea | plain (NOTE: 'list' removed - now an attribute)
}
```

**Added list detection to all entity types:**

**Logs:**
```typescript
case 'log': {
  const title = compactTitle(trimmedRawText, aiTitle);
  let subtype: LogSubtype | null = await getEffectiveLogSubtype(trimmedRawText);

  // Phase 7 Lists: Detect list as an attribute, not a subtype
  const hasListStructure = hasListLikeStructure(trimmedRawText);
  const listItems = hasListStructure ? parseTextToListItems(trimmedRawText) : null;

  // If subtype is 'list', change it to null (plain) since list is now an attribute
  if (subtype === 'list') {
    subtype = null;
  }

  return {
    // ... existing fields
    has_list: hasListStructure,
    list_items: listItems,
  };
}
```

**Todos:**
```typescript
case 'todo': {
  const title = normalizeTodoTitle(trimmedRawText, aiTitle);

  // Phase 7 Lists: Detect list as an attribute
  const hasListStructure = hasListLikeStructure(trimmedRawText);
  const listItems = hasListStructure ? parseTextToListItems(trimmedRawText) : null;

  return {
    // ... existing fields
    has_list: hasListStructure,
    list_items: listItems,
  };
}
```

**Habits:**
```typescript
case 'habit': {
  // ... title extraction
  
  // Phase 7 Lists: Detect list as an attribute
  const hasListStructure = hasListLikeStructure(trimmedRawText);
  const listItems = hasListStructure ? parseTextToListItems(trimmedRawText) : null;

  return {
    // ... existing fields
    has_list: hasListStructure,
    list_items: listItems,
  };
}
```

### 2. Pipeline Stage A (`lib/minddrop/pipelineStages.ts`)

**Updated note classification to pass list fields:**
```typescript
// Update note with canonical fields
await repo.update({
  id: unsortedNoteId,
  patch: {
    title: canonical.title,
    body: canonical.body,
    tags: canonical.tags,
    tags_meta: canonical.tags_meta,
    subtype: canonical.subtype as NoteSubtype | null,
    has_list: canonical.has_list,        // NEW
    list_items: canonical.list_items,    // NEW
    views: {
      // ... stage tracking
    },
  },
});
```

### 3. Conversion Functions (`lib/conversion.ts`)

**Updated `convertUnsortedToTodo`:**
```typescript
const todoInput: CreateRecordInput = {
  type: 'todo',
  name: todoName,
  // ... existing fields
  has_list: canonical.has_list,        // NEW
  list_items: canonical.list_items,    // NEW
};
```

**Updated `convertUnsortedToHabit`:**
```typescript
const habitInput: CreateRecordInput = {
  type: 'habit',
  name: habitName,
  // ... existing fields
  has_list: canonical.has_list,        // NEW
  list_items: canonical.list_items,    // NEW
};
```

## Behavior Changes

### Before (Phase 7 Lists)
```
Mind Drop: "- Buy milk\n- Walk dog\n- Call mom"
   ↓
Stage A: Creates note with subtype='list'
   ↓
Result: Note with subtype='list' (special case)
```

### After (Phase 7 Lists)
```
Mind Drop: "- Buy milk\n- Walk dog\n- Call mom"
   ↓
Stage A: Detects list structure via hasListLikeStructure()
   ↓
Cortex decides: "create.todo" (or note/habit based on content)
   ↓
Result: Todo/Note/Habit with:
  - has_list: true
  - list_items: [
      { id: "uuid-1", text: "Buy milk", checked: false },
      { id: "uuid-2", text: "Walk dog", checked: false },
      { id: "uuid-3", text: "Call mom", checked: false }
    ]
  - subtype: null (for logs, NOT 'list')
```

## List Detection Logic

**Uses `hasListLikeStructure()` helper:**
- Requires 2+ items to qualify as a list
- Detects bullets (`-`, `*`, `•`)
- Detects numbered lists (`1.`, `2.`)
- Detects checkboxes (`- [ ]`, `- [x]`)

**Auto-parses using `parseTextToListItems()`:**
- Each list item becomes a `ListItem` object with unique ID
- Checkbox state is preserved (`[x]` → `checked: true`)
- Text is cleaned (bullet/number prefixes removed)
- Non-list lines are ignored

## Entity Type Preservation

✅ **Critical Rule**: List detection **never changes entity type**

| Mind Drop Content | Cortex Decision | Result |
|------------------|----------------|--------|
| "Buy groceries:\n- Milk\n- Eggs" | create.todo | **Todo** with checklist |
| "Morning routine:\n- Meditate\n- Journal" | create.habit | **Habit** with checklist |
| "Ideas:\n- New feature\n- Design update" | create.note | **Note** with checklist |

The entity type is determined by **Cortex AI classification** based on intent, **not by the presence of a list**.

## Database Impact

**Migration already applied:**
- `has_list` column added to todos, notes, habits
- `list_items_json` JSONB column added
- Existing notes with `subtype='list'` migrated to `has_list=true`

**Stage A now populates:**
- `has_list`: boolean flag
- `list_items`: Array of ListItem objects (serialized to JSONB)

## Backward Compatibility

**Old 'list' subtype handling:**
- `subtype='list'` still exists in type definitions (NoteSubtype, LogSubtype)
- **New behavior**: If AI returns `subtype='list'`, buildCanonical converts it to `null`
- Existing notes with `subtype='list'` are valid (already migrated via SQL)
- UI overlay still handles `subtype='list'` for legacy items

**Why keep 'list' in types?**
- Database may still contain old notes with `subtype='list'`
- Type safety requires it to be valid
- New items won't get it (converted to null + has_list=true)

## Testing Requirements

### Unit Tests Needed

**Test: List detection in todos**
```typescript
it('should detect list structure in todo Mind Drop', async () => {
  const canonical = await buildCanonicalFromMindDrop({
    kind: 'todo',
    rawText: '- Buy milk\n- Walk dog\n- Call mom',
  });
  
  expect(canonical.has_list).toBe(true);
  expect(canonical.list_items).toHaveLength(3);
  expect(canonical.list_items[0].text).toBe('Buy milk');
  expect(canonical.list_items[0].checked).toBe(false);
});
```

**Test: No list detection for single item**
```typescript
it('should not detect list for single bullet', async () => {
  const canonical = await buildCanonicalFromMindDrop({
    kind: 'todo',
    rawText: '- Just one item',
  });
  
  expect(canonical.has_list).toBe(false);
  expect(canonical.list_items).toBe(null);
});
```

**Test: List subtype conversion**
```typescript
it('should convert list subtype to null for logs', async () => {
  // Mock getEffectiveLogSubtype to return 'list'
  jest.spyOn(require('../logs/getEffectiveLogSubtype'), 'getEffectiveLogSubtype')
    .mockResolvedValue('list');
  
  const canonical = await buildCanonicalFromMindDrop({
    kind: 'log',
    rawText: '- Item 1\n- Item 2',
  });
  
  expect(canonical.subtype).toBe(null); // Converted from 'list'
  expect(canonical.has_list).toBe(true);
  expect(canonical.list_items).toHaveLength(2);
});
```

**Test: Entity type preservation**
```typescript
it('should create todo with list, not change type', async () => {
  // Test that a list Mind Drop classified as todo stays a todo
  const canonical = await buildCanonicalFromMindDrop({
    kind: 'todo',
    rawText: 'Grocery list:\n- Milk\n- Eggs\n- Bread',
  });
  
  expect(canonical.canonicalType).toBe('todo'); // Still a todo!
  expect(canonical.has_list).toBe(true);
});
```

### Integration Tests Needed

**Test: Full pipeline flow**
```typescript
it('should create todo with checklist from Mind Drop', async () => {
  const result = await runMindDropStageA({
    repo,
    text: '- Buy groceries\n- Walk dog',
    cleanedText: '- Buy groceries\n- Walk dog',
    decision: { mode: 'auto', actions: [{ type: 'create.todo', payload: {} }] },
    dropId: 'test-drop-1',
  });
  
  const todo = await repo.getById(result.entities.todos[0]);
  expect(todo.has_list).toBe(true);
  expect(todo.list_items).toHaveLength(2);
});
```

## Files Modified

- ✅ `lib/minddrop/buildCanonicalFromMindDrop.ts` - List detection + canonical payload
- ✅ `lib/minddrop/pipelineStages.ts` - Pass list fields to repo.update
- ✅ `lib/conversion.ts` - Pass list fields to repo.create

## Files NOT Modified (Backward Compatibility)

- `lib/types.ts` - 'list' still in NoteSubtype/LogSubtype (for old data)
- `lib/schemas.ts` - 'list' still valid in Zod schemas (for validation)
- UI components - Still handle legacy `subtype='list'` items

## Next Steps

1. **Add Unit Tests** - Test list detection logic in buildCanonicalFromMindDrop
2. **Add Integration Tests** - Test full Mind Drop → entity creation flow
3. **Update Documentation** - Document list detection in Mind Drop guide
4. **Monitor Production** - Watch for any list subtypes still being created (should be 0)

## Verification Commands

```bash
# Run Mind Drop tests
npm test -- lib/minddrop/buildCanonicalFromMindDrop.test.ts

# Type check
npx tsc --noEmit

# Check for list subtype usage (should only be in types/schemas)
grep -r "subtype.*'list'" lib/ --include="*.ts" | grep -v "test"
```

## Success Criteria

✅ **Stage A detects lists** - `has_list=true` when 2+ list items detected  
✅ **Stage A parses items** - `list_items` array populated with structured data  
✅ **Entity type preserved** - List detection doesn't change todo/habit/note classification  
✅ **Subtype cleaned** - 'list' subtype converted to null for logs  
✅ **All types supported** - Works for todos, habits, and notes  
✅ **No compilation errors** - All modified files compile cleanly  

## Related Documentation

- `PHASE7_LISTS_TYPESCRIPT_INTEGRATION.md` - Type system integration
- `PHASE7_LISTS_HELPERS_COMPLETE.md` - Helper functions
- `PHASE7_LISTS_OVERLAY_INTEGRATION_COMPLETE.md` - UI integration
- `PHASE7_LISTS_QUICK_START.md` - User guide
- Database migration: `supabase/migrations/20251124000000_phase7_lists_attributes.sql`
