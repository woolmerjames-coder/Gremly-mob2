# Phase 7 Lists: Quick Start Guide

## ✅ What's Complete

1. **Database Schema** - `list_items_json` JSONB column added to todos, habits, notes
2. **TypeScript Types** - `has_list`, `list_items` fields on all entity types
3. **Repository Layer** - JSONB serialization/deserialization in Supabase repo
4. **Core Helpers** - Parsing, toggling, adding, removing list items (52 passing tests)
5. **Checklist Component** - Reusable UI component with interactive features
6. **Overlay Integration** - Full state management and UI wiring in UnifiedOverlayV2

## 🎯 How to Use

### Adding a Checklist to a Todo/Habit/Note

1. Open the overlay (create or edit mode)
2. Scroll to find the "+ Add checklist" button (between tags and Details section)
3. Click "+ Add checklist"
4. If your body text contains list-like content (bullets, numbers), it auto-parses into items
5. Otherwise, you get an empty checklist ready for input

### Managing Checklist Items

- **Check/Uncheck**: Tap the checkbox icon
- **Add Item**: Type in the "Add item..." input and press enter
- **Edit Item**: Tap the item text to edit inline
- **Remove Item**: Tap the X button next to an item
- **View Progress**: See "2/5 complete" at the bottom
- **Remove Checklist**: Tap "Remove checklist" button (shows confirmation alert)

### Saving

Just hit the Save button as usual! List data is automatically persisted to the database.

## 📝 Test File Migration

~45 test files need updating to include `has_list: false, list_items: null` in mock objects.

**See**: `PHASE7_LISTS_TEST_MIGRATION.md` for detailed instructions.

**Quick Fix Pattern**:
```typescript
// Before
const mockTodo = {
  id: 'todo-1',
  type: 'todo',
  name: 'Test todo',
  // ...
};

// After
const mockTodo = {
  id: 'todo-1',
  type: 'todo',
  name: 'Test todo',
  has_list: false,
  list_items: null,
  // ...
};
```

## 🧪 Manual Testing Checklist

- [ ] Create new todo with checklist
- [ ] Toggle checklist items
- [ ] Add/remove checklist items
- [ ] Edit checklist item text
- [ ] Save and reload - verify persistence
- [ ] Create checklist from auto-parsed text (paste bullet list)
- [ ] Remove checklist, verify alert
- [ ] Same flow for habits
- [ ] Same flow for notes/logs
- [ ] Edit existing entity with checklist
- [ ] Switch entity type (todo → habit) - verify list preserved

## 🔧 Development Commands

```bash
# Run list helper tests
npm test -- lib/lists/helpers.test.ts

# Type check entire project (expect test file errors)
npx tsc --noEmit

# Fix test files (batch update)
# See PHASE7_LISTS_TEST_MIGRATION.md for script

# Run overlay tests (after fixing test files)
npm test -- components/overlay/
```

## 📂 Key Files

**Implementation:**
- `lib/lists/types.ts` - ListItem interface
- `lib/lists/helpers.ts` - Core parsing and mutation functions
- `components/lists/Checklist.tsx` - Reusable checklist UI component
- `components/overlay/overlayV2.state.ts` - State management with list actions
- `components/overlay/UnifiedOverlayV2.tsx` - Overlay integration and save logic
- `lib/types.ts` - Extended Todo, Habit, Note with list fields
- `lib/schemas.ts` - Zod validation for list fields
- `lib/repo/supabase.ts` - JSONB serialization

**Database:**
- `supabase/migrations/20251124000000_phase7_lists_attributes.sql`

**Documentation:**
- `PHASE7_LISTS_TYPESCRIPT_INTEGRATION.md` - Type system integration
- `PHASE7_LISTS_HELPERS_COMPLETE.md` - Core helpers summary
- `PHASE7_LISTS_TEST_MIGRATION.md` - Test file migration guide
- `PHASE7_LISTS_OVERLAY_INTEGRATION_COMPLETE.md` - This phase summary

## 🐛 Known Issues

- Test files need `has_list`/`list_items` added (~45 files)
- Hub cards don't show checklist preview yet (future enhancement)
- No animations for item add/remove yet (future polish)

## 🚀 Future Enhancements

1. **Hub Display**: Show checklist preview in cards
2. **Bulk Operations**: Select multiple items, bulk check/uncheck
3. **Drag & Drop**: Reorder checklist items
4. **Templates**: Save/load checklist templates
5. **Analytics**: Track completion rates, popular list patterns
6. **Export**: Export checklists to clipboard/markdown
7. **Collaboration**: Share checklists between users
8. **Smart Suggestions**: AI-powered list item suggestions

## 💡 API Reference

### State Actions

```typescript
// Enable checklist (optionally auto-parse from text)
dispatch({ type: 'ENABLE_CHECKLIST', autoParseFrom: bodyText });

// Disable checklist
dispatch({ type: 'DISABLE_CHECKLIST' });

// Set list items directly
dispatch({ type: 'SET_LIST_ITEMS', items: [...] });

// Toggle item checked state
dispatch({ type: 'TOGGLE_CHECKLIST_ITEM', itemId: 'item-123' });

// Add new item
dispatch({ type: 'ADD_CHECKLIST_ITEM', text: 'New item' });

// Remove item
dispatch({ type: 'REMOVE_CHECKLIST_ITEM', itemId: 'item-123' });

// Update item text
dispatch({ type: 'UPDATE_CHECKLIST_ITEM', itemId: 'item-123', text: 'Updated text' });
```

### Helper Functions

```typescript
import {
  parseTextToListItems,
  hasListLikeStructure,
  toggleListItemChecked,
  addListItem,
  removeListItem,
  listItemsToText,
  getListStats,
} from 'lib/lists/helpers';

// Parse markdown/plain text into list items
const items = parseTextToListItems('- Item 1\n- Item 2\n[ ] Item 3');

// Check if text contains list-like structure (2+ items)
const hasLists = hasListLikeStructure('- Item 1\n- Item 2');

// Toggle checked state
const updated = toggleListItemChecked(items, 'item-id');

// Add new item (appends to end)
const withNew = addListItem(items, 'New item text');

// Remove item by ID
const filtered = removeListItem(items, 'item-id');

// Convert items back to markdown
const markdown = listItemsToText(items);

// Get stats
const { total, checked, unchecked } = getListStats(items);
```

## 📞 Support

Questions? See:
- Implementation docs in `PHASE7_LISTS_*` files
- Test examples in `__tests__/lists.helpers.test.ts`
- Component usage in `components/lists/Checklist.tsx`
