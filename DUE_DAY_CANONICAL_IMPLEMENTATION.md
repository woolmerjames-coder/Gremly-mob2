# DUE_DAY Canonical Implementation

## Summary

This change makes `due_day` (YYYY-MM-DD format) the **canonical source of truth** for all todo due dates. This eliminates the "today jumps to yesterday" timezone bug that occurred when using UTC timestamps.

## Problem

Previously, todos used `due_at` (ISO timestamp like `2025-05-28T00:00:00.000Z`) as the source of truth. This caused issues:

1. **UTC Midnight Drift**: Setting a date to "May 28" would store `2025-05-28T00:00:00.000Z` (midnight UTC). For users in timezones behind UTC (e.g., America/Los_Angeles, UTC-7), this would display as "May 27" when parsed locally.

2. **Inconsistent Display**: The same todo could show different dates in MindDrop vs. the Now page if they used different parsing logic.

## Solution: OPTION A - `due_day` as Canonical Field

All todo dates are now stored as **local day-only strings** in `due_day` format (YYYY-MM-DD):

- `due_day: "2025-05-28"` - The canonical field
- `due_date: "2025-05-28"` - Mirrors `due_day` for backwards compatibility
- `due_at: null` - Explicitly NOT used for todos
- `undefined_due: true|false` - Set based on whether a due date exists

## Files Changed

### 1. `lib/date/computeDueDay.ts`
Added central date helpers:
```typescript
export function getTodayDayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function toDayString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
```

### 2. `components/overlay/UnifiedOverlayV2.tsx`
- `handleTodoDueChange(date: Date | null)` - Computes `due_day` using `toDayString()`, NOT `due_at`
- `buildDraftPayloadFromEntity()` - Sets `due_at: null`, reads `due_day` from entity
- Create payload - Returns `due_day`, `due_date`, `undefined_due`, NOT `due_at`
- Added `formatDueDay()` helper for display

### 3. `components/overlay/overlayV2.mapping.ts`
- `toCreateOrUpdateInput()` - Returns `due_at: null`, `due_day`, `due_date`, `undefined_due`

### 4. `lib/now/nowSelectors.ts`
- Imports `getTodayDayString` from central helpers
- `isTodoDueToday()` uses `due_day === todayStr` comparison
- All selector outputs prefer `due_day` over `due_date`

### 5. `lib/now/useNowData.ts`
- Added `eventBus` listener for `OverlaySaved` to auto-reload Now data

### 6. `selectors/today/index.ts`
- Updated `mergeTodayData()` to prefer `due_day` over `due_at`

## How It Works

### Saving a Todo Due Date
1. User selects date (e.g., May 28, 2025) in date picker
2. `handleTodoDueChange(new Date(2025, 4, 28))` is called
3. `toDayString()` computes `"2025-05-28"` using LOCAL timezone (no UTC conversion)
4. State is updated: `{ due_day: "2025-05-28", due_at: null }`
5. On save, mapping sends: `{ due_day: "2025-05-28", due_date: "2025-05-28", due_at: null, undefined_due: false }`

### Reading a Todo Due Date
1. Entity has `due_day: "2025-05-28"`
2. Hydration reads `due_day` directly (not `due_at`)
3. Display uses `formatDueDay("2025-05-28")` → "May 28"
4. Today filtering: `todo.due_day === getTodayDayString()` → boolean

### Today Lane Filtering
1. `getTodayDayString()` returns today as `"2025-05-28"` (local)
2. `isTodoDueToday(todo)` checks: `todo.due_day === "2025-05-28"`
3. No timezone conversion = no drift

## Migration Notes

- Existing todos with only `due_at` will continue to work via fallback logic
- New/updated todos will use `due_day` as canonical
- The `computeDueDay()` function still exists for legacy data

## Testing

1. Create a todo with "due today" - it should appear in Today lane
2. Change due date to "tomorrow" - it should disappear from Today lane  
3. Remove due date - it should disappear from Today lane
4. Close and reopen the app - date should remain consistent
5. Test across timezone boundaries (especially around midnight)

## Key Principle

> **NEVER convert local dates through UTC. Store what the user sees.**

The user selects "May 28" - we store `"2025-05-28"`. No timestamp, no timezone, no drift.
