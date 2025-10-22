# Hub Unsorted Banner/Sheet Fix - Summary

**Date**: January 2025  
**Branch**: `fix/hub-unsorted-empty`  
**Status**: ✅ **FIXED** - All tests passing

---

## Problem Description

The Hub screen showed a banner like "8 Unsorted items — Review" but when tapping it, the "Unsorted Items" sheet opened with an empty list ("No unsorted items").

### Root Cause

**Data Flow Mismatch**:
1. **Banner count** (line 179): Calculated using ALL items from ALL types and ALL scopes
   - Fetched: `repo.listByType('habit', {})`, `repo.listByType('todo', {})`, `repo.listByType('note', {})`
   - Applied selector: `selectUnsortedForReview(allItemsForUnsorted)`
   - Result: Global count across entire Hub

2. **Sheet items** (line 405): Used items from the CURRENT filtered view
   - Source: `items` state (filtered by current tab + scope + search + tags)
   - Applied selector: `selectUnsortedForReview(items)`
   - Result: Only unsorted items matching current filters

**Example Scenario**:
- User on "Habits" tab with "Work" space selected
- 8 total unsorted items exist (3 habits in Personal, 2 todos in Work, 3 notes in Personal)
- Banner shows: "8 Unsorted items" ✅
- Sheet would show: 0 items (no habits in Work space that are unsorted) ❌

---

## Solution Implemented

### 1. Added Diagnostic Logging (Commit: `c257bfc`)

Added `__DEV__` guarded logging at 3 key points:
- **Global count calculation** (when loading all items)
- **In-page needs sorting** (filtered view for "Needs Sorting" section)
- **Sheet open event** (when user taps banner)

Example logs:
```typescript
[HubUnsorted] Global count calculation: {
  totalItems: 145,
  unsortedCount: 8,
  byType: { habits: 52, todos: 48, notes: 45 },
  scope: 'all',
  filters: 'none (global count)'
}

[HubUnsorted] Opening sheet: {
  bannerCount: 8,
  sheetItemsAvailable: 8,
  currentTab: 'Habits',
  currentScope: 'everywhere'
}
```

### 2. Unified Data Source (Commit: `1b72c3c`)

**Key Changes**:

**Added global state** for unsorted items:
```typescript
const [globalUnsortedItems, setGlobalUnsortedItems] = useState<AppRecord[]>([]);
```

**Store global unsorted** when loading (line 195):
```typescript
const globalUnsorted = selectUnsortedForReview(allItemsForUnsorted);
setUnsortedCount(globalUnsorted.length);
setGlobalUnsortedItems(globalUnsorted); // NEW: Store for sheet
```

**Use global items for sheet** (line 446):
```typescript
// For the review sheet, use global unsorted items (all types, all scopes)
const unsortedItems = useMemo(() => {
  return globalUnsortedItems.map(toUnsortedItem);
}, [globalUnsortedItems, toUnsortedItem]);
```

**Refetch on sheet open** (line 627):
```typescript
onPress={() => {
  load(); // Refetch to ensure latest data
  setReviewSheetVisible(true);
}}
```

---

## Unsorted Item Detection Logic

The `selectUnsortedForReview` function identifies items needing review:

```typescript
export function selectUnsortedForReview(items: AppRecord[]): AppRecord[] {
  return items.filter((item) => {
    // AI-placed items awaiting confirmation
    if (item.ai_placed === true) return true;

    // Items from catchall that haven't been moved
    if (item.origin === 'catchall' && item.ai_placed === false && !item.space_id) 
      return true;

    return false;
  });
}
```

**Two categories**:
1. **AI-placed items**: `ai_placed === true` (Gremly AI classified and placed the item)
2. **Catchall limbo**: `origin === 'catchall'` + `ai_placed === false` + no space assigned

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        HubScreen                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  load() function:                                            │
│  ├─ Fetch ALL habits, todos, notes (no filters)             │
│  ├─ Apply selectUnsortedForReview() → globalUnsorted        │
│  ├─ setUnsortedCount(globalUnsorted.length) ────────────┐   │
│  └─ setGlobalUnsortedItems(globalUnsorted) ────────┐    │   │
│                                                     │    │   │
│  Banner:                                            │    │   │
│  └─ Shows: unsortedCount ◄──────────────────────────────┘   │
│     Tap → load() + setReviewSheetVisible(true)      │        │
│                                                     │        │
│  Sheet (UnsortedReviewSheet):                       │        │
│  └─ Receives: unsortedItems ◄───────────────────────┘        │
│     (mapped from globalUnsortedItems)                        │
│                                                              │
│  In-page "Needs Sorting" section:                            │
│  └─ Uses: selectUnsortedForReview(items)                     │
│     (filtered by current tab/scope - respects user filters)  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Changed

| File | Changes | Purpose |
|------|---------|---------|
| `app/tabs/HubScreen.tsx` | Added `globalUnsortedItems` state<br/>Store global unsorted on load<br/>Use global for sheet items<br/>Refetch on sheet open<br/>Add diagnostic logging | Main fix |
| `lib/selectors/spaceSelectors.ts` | *(No changes)* | Selector logic already correct |
| `components/UnsortedReviewSheet.tsx` | *(No changes)* | Sheet component works correctly |

**Diff Stats**: 1 file changed, 36 insertions(+), 10 deletions(-)

---

## Test Results

✅ **All existing tests pass**:
- `hub.scope-tabs-unsorted.test.tsx`: 17 passed, 1 skipped
- Shows unsorted banner with count ✅
- Opens review sheet when banner clicked ✅
- Unsorted banner persists across tab switches ✅

✅ **TypeScript compilation**: Clean  
✅ **ESLint**: Only pre-existing warnings (no new issues)

---

## Behavior After Fix

### Scenario 1: Multiple unsorted items across tabs
- **Setup**: 3 unsorted habits (Personal), 2 unsorted todos (Work), 3 unsorted notes (Personal)
- **On Habits tab**: Banner shows "8 Unsorted items"
- **Tap banner**: Sheet opens and shows ALL 8 items (habits + todos + notes)
- **Confirm one item**: Count updates to 7, item disappears from sheet

### Scenario 2: Tab switching doesn't affect count
- **Setup**: Same as above, on Habits tab
- **Switch to To-Dos tab**: Banner still shows "8 Unsorted items"
- **Tap banner**: Sheet shows all 8 items (not just todos)

### Scenario 3: Scope filter doesn't affect count
- **Setup**: Same as above, switch scope to "Work"
- **Visible items change**: Now only showing Work items in main list
- **Banner unchanged**: Still shows "8 Unsorted items" (global count)
- **Tap banner**: Sheet shows all 8 unsorted items from all scopes

### Scenario 4: Real-time updates
- **Setup**: 8 unsorted items, sheet open
- **Confirm one item**: 
  - `handleConfirmUnsorted()` sets `ai_placed=false`
  - Calls `load()` → refetches and recalculates
  - Count updates to 7
  - Sheet refreshes (closes if ≤1 item remaining)

---

## Design Decisions

### Why Global Count?
The banner intentionally shows a **global count** across all tabs and scopes because:
1. Unsorted items need attention regardless of which tab you're viewing
2. User shouldn't miss unsorted items just because they're on the wrong tab
3. Acts as a persistent reminder to review AI-placed items

### Why Not Filter Sheet by Current Tab/Scope?
Showing all unsorted items in the sheet:
1. Reduces clicks (user doesn't need to switch tabs to review different types)
2. Provides complete context (see all pending reviews in one place)
3. Matches user expectation from the count (banner says "8", sheet shows 8)

### In-Page "Needs Sorting" Section
This section DOES respect filters because:
1. It's part of the main list flow (same visual context as regular items)
2. Users expect it to match the current view
3. It's for quick triage within the current working context

---

## Commits

1. **`c257bfc`**: "chore(hub): add diagnostics for unsorted count vs list queries"
   - Added `__DEV__` logging at key points
   - No functional changes
   
2. **`1b72c3c`**: "fix(hub): align unsorted banner count and sheet items using global list"
   - Store `globalUnsortedItems` separately
   - Sheet uses global list (banner and sheet now aligned)
   - Refetch on sheet open
   - In-page section still uses filtered view

---

## Future Enhancements (Out of Scope)

1. **Advanced filtering in sheet**: Add type/scope filters within the sheet itself
2. **Batch operations**: "Confirm All" button in sheet
3. **Sorting options**: Sort by type, date, space
4. **Preview mode**: Show item details before confirming
5. **Undo**: Revert confirmation within a short time window

---

## Acceptance Criteria

✅ Tapping "X Unsorted items — Review" banner opens sheet showing X items  
✅ Count and list both use identical data source (global unsorted items)  
✅ Sheet refreshes when opened (calls `load()`)  
✅ Count and list update in real-time after confirming items  
✅ No regressions to tab/scope/search/tag filters  
✅ Production logging minimal (all debug logs guarded by `__DEV__`)  
✅ All existing tests pass  

---

**Status**: ✅ **READY FOR PR**
