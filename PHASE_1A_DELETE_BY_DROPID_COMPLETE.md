# Phase 1A: Mind Drop Delete by drop_id - COMPLETE

## Overview

Successfully implemented Phase 1A of the Mind Drop architecture to fix the "zombie unsorted" problem. When a user deletes a Mind Drop item (note/todo/habit/log), the system now soft-deletes **all entities** with the same `drop_id` instead of only the currently visible item.

## Implementation Summary

### 1. Helper Module: `lib/minddrop/deleteHelpers.ts`

Created a new helper module with two key functions:

#### `deleteByDropId(repo: IRepo, dropId: string)`
- Archives all entities (notes, todos, habits) with the given `drop_id`
- Sets `archived: true` and `archived_reason: 'user_deleted_drop'`
- Idempotent - safe to call multiple times
- Uses the existing `repo.archiveItemsByDropId()` method

#### `deleteEntityOrDrop(repo: IRepo, entityId: string, entityType, dropId?)`
- Convenience wrapper that checks if entity has a `drop_id`
- If yes: calls `deleteByDropId()` to archive all related entities
- If no: falls back to single entity deletion via `repo.remove()`
- Accepts optional `dropId` parameter for efficiency (avoids fetch)

### 2. Repo Layer Integration

The implementation leverages **existing** repo methods:

- **IRepo Interface** (`lib/repo/IRepo.ts`):
  - Already had `archiveItemsByDropId(dropId: string, archivedReason?: string): Promise<void>`
  
- **SupabaseRepo** (`lib/repo/supabase.ts` lines 1728-1763):
  - Already implemented - archives todos, habits, notes by `drop_id`
  - Todos: sets `status='archived'` and `archived_reason`
  - Habits: sets `archived=true` and `archived_reason`
  - Notes: sets `archived=true` and `archived_reason`

- **MemoryRepo** (`lib/repo/memory.ts` lines 847-862):
  - Already implemented for tests
  - Same behavior as SupabaseRepo

### 3. UI Wiring: `app/screens/CatchAllNotepad.tsx`

The delete path was **already wired up** (lines 1065-1089):

```typescript
const handleDelete = async (id: string, kind: UnifiedDrop['kind']) => {
  try {
    // Find the item being deleted to check for drop_id
    const itemToDelete = items.find((item) => item.id === id);
    const dropId = itemToDelete?.drop_id;

    if (dropId) {
      // Archive all items (todos, habits, notes) with this drop_id
      await repo?.archiveItemsByDropId?.(dropId, 'user_deleted_drop');

      // Remove all items with this drop_id from local state
      setItems((prev) => prev.filter((item) => item.drop_id !== dropId));
    } else {
      // No drop_id: fallback to single-item delete
      await (repo?.remove?.(id) ?? repo?.[`${kind}s`]?.delete?.(id));

      // Remove only this item from local state
      setItems((prev) => prev.filter((item) => item.id !== id));
    }

    onDeleted?.();
  } catch (err) {
    console.error('[handleDelete] Failed to delete:', err);
  }
};
```

**Key behavior:**
- Checks if item has `drop_id`
- If yes: archives all items with that `drop_id` (fixes zombie problem)
- If no: single-item delete (preserves backward compatibility)
- Updates local state to remove all matching items from UI

### 4. Comprehensive Test Suite

Created `lib/minddrop/__tests__/deleteHelpers.test.ts` with **15 passing tests**:

#### `deleteByDropId` tests:
✅ Archives all entities with the same drop_id  
✅ Archives only the unsorted note if no converted entity exists  
✅ Is idempotent - calling twice leaves state consistent  
✅ Archives all three entity types (note, todo, habit) with same drop_id  
✅ Does not affect entities with different drop_ids  
✅ Throws error if dropId is not provided  

#### `deleteEntityOrDrop` tests:
✅ Deletes all items with drop_id when entity has drop_id  
✅ Deletes only single entity when drop_id is null  
✅ Uses provided drop_id when available (more efficient)  
✅ Handles different entity types (habit)  
✅ Fallback to single delete if entity fetch fails  
✅ Throws error if entityId is not provided  
✅ Does not delete entities without drop_id when explicitly passed null  

#### Integration tests:
✅ Handles the full Mind Drop lifecycle: create unsorted → convert → delete  
✅ Handles multiple conversions from same drop (e.g., todo + habit)  

## Files Changed

### New Files
- `lib/minddrop/deleteHelpers.ts` - Helper functions for drop_id deletion
- `lib/minddrop/__tests__/deleteHelpers.test.ts` - Comprehensive test suite (15 tests)

### Modified Files
None - the repo layer and UI were already correctly implemented.

## Architecture

### Mind Drop Lifecycle with drop_id

```
1. User types in Mind Drop
   └─> Creates unsorted note with drop_id='abc-123'

2. Cortex classifies & converts
   └─> Creates todo with same drop_id='abc-123'
   └─> Unsorted note remains (not archived)

3. User deletes todo from Recent Drops
   └─> Finds drop_id='abc-123' on todo
   └─> Archives ALL items with drop_id='abc-123':
       - Todo (status='archived')
       - Unsorted note (archived=true)
   └─> No zombie unsorted note! ✅
```

### Database Operations

**Supabase Implementation:**
```sql
-- Archive todos
UPDATE todos 
SET status = 'archived', archived_reason = 'user_deleted_drop'
WHERE drop_id = ? AND owner_id = ?;

-- Archive habits
UPDATE habits
SET archived = true, archived_reason = 'user_deleted_drop'
WHERE drop_id = ? AND owner_id = ?;

-- Archive notes
UPDATE notes
SET archived = true, archived_reason = 'user_deleted_drop'
WHERE drop_id = ? AND owner_id = ?;
```

## Behavior Guarantees

### ✅ Fixes the Zombie Problem
- Deleting a converted todo/habit now also archives the original unsorted note
- User won't see the same Mind Drop reappear after deletion

### ✅ Idempotent
- Calling `deleteByDropId()` multiple times is safe
- Already-archived items remain archived

### ✅ Backward Compatible
- Entities without `drop_id` still use single-item delete
- Existing delete paths continue to work

### ✅ Multi-Conversion Support
- If a Mind Drop converts to both todo AND habit, deleting either archives all
- All entities sharing the same `drop_id` are treated as a group

## Testing

Run the test suite:
```bash
npm test -- lib/minddrop/__tests__/deleteHelpers.test.ts
```

**Results:** ✅ 15/15 tests passing

## Usage Examples

### Example 1: Delete with known drop_id
```typescript
import { deleteByDropId } from './lib/minddrop/deleteHelpers';

// Archive all items with this drop_id
await deleteByDropId(repo, 'abc-123-def-456');
```

### Example 2: Delete entity (auto-detects drop_id)
```typescript
import { deleteEntityOrDrop } from './lib/minddrop/deleteHelpers';

// Will fetch entity, check for drop_id, and archive all if present
await deleteEntityOrDrop(repo, 'todo_789', 'todo');
```

### Example 3: Delete with pre-fetched drop_id (more efficient)
```typescript
import { deleteEntityOrDrop } from './lib/minddrop/deleteHelpers';

const todo = await repo.getById('todo_789');
await deleteEntityOrDrop(repo, todo.id, 'todo', todo.drop_id);
```

## Next Steps (Phase 1B and beyond)

Phase 1A is complete. Future phases might include:
- **Phase 1B:** Prevent creating duplicate Mind Drops
- **Phase 1C:** Mind Drop deduplication on display
- **Phase 2:** Enhanced conversion logic
- **Phase 3:** Multi-space Mind Drop support

## Verification

To verify the fix works end-to-end:

1. Create a Mind Drop (e.g., "Buy groceries")
2. Wait for Cortex to convert it to a todo
3. Check Recent Drops - you'll see both unsorted note and todo
4. Delete the todo
5. ✅ Both items should disappear (no zombie unsorted note)

## Status

**Phase 1A: COMPLETE** ✅

- ✅ Helper module created
- ✅ Repo layer integration verified (already implemented)
- ✅ UI wiring verified (already implemented)
- ✅ Comprehensive test suite (15/15 passing)
- ✅ No conversion logic changes needed (per requirements)
