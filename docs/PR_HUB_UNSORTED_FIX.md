# Pull Request: Hub Unsorted Banner/Sheet Data Flow Fix

## Summary

Fixes the data mismatch between the Hub's "Unsorted Items" banner count and the review sheet's item list. The banner now correctly shows the count of items that will appear when opening the sheet.

## Problem

The Hub screen displayed a banner like "8 Unsorted items — Review" but when tapped, the "Unsorted Items" sheet opened showing "No unsorted items" or a different count than the banner.

**Root Cause**: Banner count used a global query (all types, all scopes) while the sheet used filtered items (current tab + scope + search filters).

## Solution

- Store global unsorted items separately in `globalUnsortedItems` state
- Banner and sheet now both use the same global data source
- Refetch data when opening sheet to ensure freshness
- In-page "Needs Sorting" section continues to respect current filters (intentional)

## Changes

### `app/tabs/HubScreen.tsx`
- Added `globalUnsortedItems` state to store all unsorted items
- Updated `load()` to populate `globalUnsortedItems` alongside count
- Modified `unsortedItems` memo to use global list instead of filtered view
- Added refetch call when banner is tapped
- Added diagnostic logging (guarded by `__DEV__`)

## Testing

✅ All existing tests pass (558 tests)  
✅ Specific test suite: `hub.scope-tabs-unsorted.test.tsx` - 17 passed  
✅ TypeScript compilation: Clean  
✅ ESLint: No new warnings  

### Test Coverage
- Banner shows correct global count
- Sheet opens with matching item count
- Count persists across tab/scope switches
- Real-time updates after confirming items

## Behavior Examples

### Before Fix ❌
```
Scenario: 8 unsorted items total (3 habits in Personal, 2 todos in Work, 3 notes)
- User on "Habits" tab, "Work" scope
- Banner: "8 Unsorted items" 
- Tap banner → Sheet: "No unsorted items" (no Work habits are unsorted)
```

### After Fix ✅
```
Same scenario:
- User on "Habits" tab, "Work" scope  
- Banner: "8 Unsorted items"
- Tap banner → Sheet: Shows all 8 items (across all tabs/scopes)
- Confirm one → Count updates to 7, item removed
```

## Design Rationale

**Global Count & List**:
- Unsorted items need attention regardless of current tab/scope
- Users shouldn't miss pending reviews due to filters
- Reduces navigation (see all unsorted in one place)

**Filtered In-Page Section**:
- "Needs Sorting" section in main list still respects filters
- Provides quick triage within current working context
- Visually part of the filtered list view

## Commits

1. `c257bfc` - Add diagnostics for unsorted count vs list queries
2. `1b72c3c` - Align unsorted banner count and sheet items using global list
3. `ca86e57` - Add comprehensive summary documentation

## Documentation

See `docs/hub-unsorted-fix-summary.md` for detailed architecture, examples, and technical details.

## Acceptance Criteria

✅ Banner count matches sheet item count  
✅ Sheet displays all items shown in count  
✅ Data refreshes when sheet opens  
✅ Real-time updates after user actions  
✅ No regressions to existing filters  
✅ All tests pass  
✅ Debug logs only in `__DEV__` mode  

## Related Issues

Resolves user-reported issue: "Unsorted banner shows count but sheet is empty"

## Screenshots/GIFs

*(Add screenshots showing before/after behavior when creating PR)*

---

## Checklist

- [x] Code follows project conventions
- [x] TypeScript compilation succeeds
- [x] All tests pass
- [x] No new ESLint errors
- [x] Diagnostic logging added (dev-only)
- [x] Documentation updated
- [x] Commit messages follow conventional format
- [x] Branch pushed to remote
