# Phase 7 Lists: Test Migration Guide

## Summary

All `Habit`, `Todo`, and `Note` types now include list support fields:
- `has_list: boolean` - Whether this record has a list attached
- `list_items: ListItem[] | null` - Array of list items (or null if no list)
- `body_legacy?: string | null` - Legacy body text (optional, only populated during migration)

## Required Changes in Tests

When creating mock `Habit`, `Todo`, or `Note` objects in tests, you must now include:

```typescript
{
  // ... other fields ...
  has_list: false,
  list_items: null,
}
```

## Quick Fix Pattern

For test mocks missing these fields, add them after the last field:

**Before:**
```typescript
const mockHabit: Habit = {
  id: 'h1',
  type: 'habit',
  name: 'Exercise',
  frequency: 'daily',
  // ... other fields ...
  owner_id: 'user1',
};
```

**After:**
```typescript
const mockHabit: Habit = {
  id: 'h1',
  type: 'habit',
  name: 'Exercise',
  frequency: 'daily',
  // ... other fields ...
  owner_id: 'user1',
  has_list: false,
  list_items: null,
};
```

## Testing List Features

To test list functionality:

```typescript
import { ListItem } from '../../lib/types';

const listItems: ListItem[] = [
  { id: '1', text: 'First item', checked: false },
  { id: '2', text: 'Second item', checked: true },
];

const mockTodoWithList: Todo = {
  // ... other required fields ...
  has_list: true,
  list_items: listItems,
  body_legacy: 'Original body text before list conversion',
};
```

## Common Test Files Affected

- `__tests__/**/*.test.ts(x)` - Component and unit tests
- `lib/repo/memory.ts` - In-memory repo seed data
- Test fixtures and mock data generators

## Migration Status

Run `npm run typecheck` to see remaining test files that need updates.
