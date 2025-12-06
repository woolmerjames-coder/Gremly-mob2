# Sweep ↔ Today Page Audit Report

## Summary

This audit verified that the Sweep flow and Today/NOW page share consistent filtering logic and that items properly disappear from both views when completed or cleared.

## Findings

### ✅ Filter Alignment (RESOLVED)

Created shared filter logic in `lib/sweep/todoFilters.ts` that is used by both:
- `lib/sweep/engine.ts` - Server-side Sweep candidate fetching
- `lib/today/sweepSelectors.ts` - Client-side sweep eligibility checking

**Key shared predicates:**
- `isActiveTodo` - Checks todo is not archived, completed, or deferred
- `isDueToday` - Checks `due_day === today`
- `isOverdue` - Checks `due_day < today` (and active)
- `isCarryForward` - Checks todo was created before today (and active, no due date)
- `needsSweepAttention` - Combined: overdue OR carry-forward OR skipped
- `buildSweepTodoOrClause` - Generates Supabase OR clause for aligned queries

### ✅ Due-Today Todos in Sweep (RESOLVED)

Previously, Sweep only included **overdue** todos. Now includes **due-today** todos as well:
```typescript
// engine.ts now uses:
.or(`due_day.lte.${todayDay}`)  // Includes both overdue AND due-today
```

### ✅ Mind Drop Notes in Sweep (RESOLVED)

Previously, only notes with `subtype IN ('log', 'journal')` appeared in Sweep.
Now ALL note subtypes appear (except `catchall`):
```typescript
// engine.ts now uses:
.neq('subtype', 'catchall')  // Include all note subtypes
```

### ✅ Archived Field Handling (RESOLVED)

**Issue Found:** The sweep `clear` action sets `archived: true` without updating `status`. The `nowSelectors.ts` functions only checked `status === 'archived'`, potentially causing cleared items to still appear on the Today page.

**Fix Applied:** Updated `nowSelectors.ts` to check both fields:
```typescript
// Before (gap):
if (status === 'completed' || status === 'archived') continue;

// After (fixed):
const isArchived = (entity as any).archived === true;
if (status === 'completed' || status === 'archived' || isArchived) continue;
```

**Functions Fixed:**
- `getLockedItems()` - Locked items for Today page
- `getActiveTodayItems()` - Active items for Today page  
- `getFutureItems()` - Future items for Today page

## Test Coverage

| Component | Tests |
|-----------|-------|
| `lib/sweep/todoFilters.ts` | 40 tests |
| `lib/sweep/engine.ts` | 44 tests |
| `lib/sweep/engine.db.test.ts` | 17 tests |
| `tests/now/nowSelectors.test.ts` | 80 tests (6 new for archived boolean) |

## Data Flow Verification

### Completing a Todo
1. User completes todo → `status` set to `'completed'`, `completed_at` set
2. Today page: `getActiveTodayItems` filters out via `status === 'completed'` ✅
3. Sweep: `engine.ts` filters out via `.eq('status', 'active')` ✅

### Clearing an Item in Sweep
1. User clears item → `archived: true`, `archived_reason: 'swept'`, `archived_at: now`
2. Today page: `nowSelectors.ts` filters out via `archived === true` ✅ (after fix)
3. Sweep: `engine.ts` filters out via `.eq('archived', false)` ✅

### Mind Drop Capture Flow
1. User enters text in Mind Drop → Note created with `subtype` based on classification
2. First-time user: Notes created today appear in Sweep
3. Returning user: Notes created since last sweep appear in Sweep
4. Sweep: All subtypes included (except `catchall`) ✅

## Consistency Matrix

| Scenario | Today Page | Sweep | Notes |
|----------|-----------|-------|-------|
| Active todo due today | ✅ Shows | ✅ Shows | Aligned filters |
| Overdue todo | ❌ Hidden | ✅ Shows | Today = today only |
| Future todo | ❌ Hidden | ❌ Hidden | Both exclude future |
| Completed todo | ❌ Hidden | ❌ Hidden | Both check status |
| Archived via status | ❌ Hidden | ❌ Hidden | Both check status |
| Archived via boolean | ❌ Hidden | ❌ Hidden | Both now check boolean |
| Mind Drop note | N/A | ✅ Shows once | First/returning user logic |

## Files Modified

1. **`lib/sweep/todoFilters.ts`** (NEW)
   - Shared filter predicates for todos
   - 40 comprehensive unit tests

2. **`lib/sweep/engine.ts`**
   - Uses `buildSweepTodoOrClause` for aligned filtering
   - Includes due-today todos (not just overdue)
   - Includes all note subtypes (not just log/journal)

3. **`lib/now/nowSelectors.ts`**
   - Fixed `getLockedItems`, `getActiveTodayItems`, `getFutureItems`
   - Now checks both `status === 'archived'` AND `archived === true`

4. **`tests/now/nowSelectors.test.ts`**
   - Added 6 tests for `archived` boolean field handling

## Conclusion

The Sweep and Today page now share consistent filtering logic. All critical user flows have been verified:
- ✅ Items appear in both places with consistent criteria
- ✅ Completing an item removes it from both views
- ✅ Clearing via Sweep removes item from Today page
- ✅ Mind Drop captures appear in Sweep at least once
- ✅ 181 total tests covering sweep and today selectors
