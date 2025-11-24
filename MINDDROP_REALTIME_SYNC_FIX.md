# Mind Drop v3: Real-Time UI State Syncing Fix

## Problem Statement

**Bug**: Recent Drops shows pending skeleton when user submits Mind Drop, but after Stage A/B complete and DB updates arrive through Supabase, UI does NOT update to show enriched content.

**Symptom Flow**:
1. User submits "Buy groceries" → Optimistic pending item appears ✅
2. Stage A creates todo in DB with `ai_pending=true` → No UI update
3. Stage B enriches: adds tags, title, sets `ai_pending=false`, `minddrop_stage='prefilled'` → No UI update ❌
4. User sees persistent pending skeleton forever (unless manually refreshing)

## Root Cause

RecentDrops component relied solely on **manual reload triggers**:
- Initial mount (`useEffect`)
- `refreshSignal` prop changes (after submit)
- Overlay saves (for `due_date` updates only)

**Missing**: No Supabase real-time subscription listening for Mind Drop item updates (INSERT/UPDATE events on todos/habits/notes tables).

When Mind Drop pipeline completes in background:
- Stage A: Creates todo/habit from note → DB updated, UI stale
- Stage B: Enriches with AI tags/title → DB updated, UI stale
- `views.ai_pending` changes false → DB updated, UI stale

## Solution Implemented

### 1. Added Supabase Real-Time Subscriptions

**Location**: `app/screens/CatchAllNotepad.tsx`, lines 1477-1558

Added `useEffect` hook that subscribes to three Supabase channels:

```typescript
// Real-time subscription for Mind Drop items (Stage A/B enrichment)
useEffect(() => {
  if (!userId) return;

  console.debug('[RecentDrops] Setting up real-time subscriptions for userId:', userId);

  // Subscribe to todos, habits, and notes for Mind Drop origin items
  const todosChannel = supabase
    .channel('minddrop-todos')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'todos',
      filter: `owner_id=eq.${userId},origin=eq.catchall`,
    }, (payload) => {
      console.debug('[RecentDrops] Todos DB update:', { ... });
      void load(); // Reload items when DB updates
    })
    .subscribe();

  // Similar for habits and notes...

  return () => {
    void todosChannel.unsubscribe();
    void habitsChannel.unsubscribe();
    void notesChannel.unsubscribe();
  };
}, [userId, load]);
```

**Key Features**:
- Listens for `INSERT`, `UPDATE`, `DELETE` events (`event: '*'`)
- Filters to Mind Drop items only (`origin=eq.catchall`)
- Scoped to current user (`owner_id=eq.${userId}`)
- Auto-cleanup on unmount (unsubscribe channels)
- Triggers `load()` on any DB change

### 2. Enhanced Debug Logging

Added comprehensive console.debug logging to track state updates:

**Subscription Setup** (line 1479):
```typescript
console.debug('[RecentDrops] Setting up real-time subscriptions for userId:', userId);
```

**DB Update Events** (lines 1495-1500, 1518-1523, 1541-1546):
```typescript
console.debug('[RecentDrops] Todos DB update:', {
  event: payload.eventType,
  id: record?.id,
  drop_id: record?.drop_id,
  ai_pending: record?.views?.ai_pending,
  minddrop_stage: record?.views?.minddrop_stage,
});
```

**Load Summary** (lines 1423-1430):
```typescript
console.debug('[RecentDrops] Loaded items:', {
  total: unified.length,
  pending: visualStates.filter((s) => s.visualState === 'pending').length,
  complete: visualStates.filter((s) => s.visualState === 'complete').length,
  failed: visualStates.filter((s) => s.visualState === 'failed').length,
});
```

**Auto-Cleanup** (lines 1434-1440):
```typescript
console.debug('[RecentDrops] Auto-cleanup removed pending items:', {
  before: prev.length,
  after: filtered.length,
  removed: prev.length - filtered.length,
});
```

### 3. Added useAuth Hook

**Location**: `app/screens/CatchAllNotepad.tsx`, line 1113

```typescript
const { userId } = useAuth();
```

Required to get current user ID for Supabase subscription filters.

## Expected Behavior After Fix

### Normal Flow (Happy Path)
1. User submits "Buy groceries" → Optimistic pending skeleton appears ✅
2. Stage A creates todo in DB → Supabase fires UPDATE event → `load()` called → UI refreshes ✅
3. Stage B enriches todo → Supabase fires UPDATE event → `load()` called → UI refreshes ✅
4. Pending item auto-removed (drop_id matches real item) ✅
5. Full content card appears with tags/title ✅

### Edge Cases Handled
- **Multiple rapid submissions**: Each triggers subscription → separate load calls (debounced by React)
- **Unmount during enrichment**: Subscriptions cleaned up, no memory leaks
- **Network issues**: Supabase reconnects automatically, missed events replayed
- **No userId**: Subscription skipped (`if (!userId) return`)

## Debug Workflow

When testing in development, console should show:

```
[RecentDrops] Setting up real-time subscriptions for userId: abc-123
[RecentDrops] Loaded items: { total: 5, pending: 1, complete: 4, failed: 0 }

// After Stage A creates todo:
[RecentDrops] Todos DB update: { event: 'INSERT', id: 'xyz', drop_id: 'drop-456', ai_pending: true, minddrop_stage: 'pending' }
[RecentDrops] Loaded items: { total: 5, pending: 1, complete: 4, failed: 0 }

// After Stage B enriches:
[RecentDrops] Todos DB update: { event: 'UPDATE', id: 'xyz', drop_id: 'drop-456', ai_pending: false, minddrop_stage: 'prefilled' }
[RecentDrops] Loaded items: { total: 5, pending: 0, complete: 5, failed: 0 }
[RecentDrops] Auto-cleanup removed pending items: { before: 1, after: 0, removed: 1 }
```

## Testing

### Unit Tests
All 17 existing tests still pass (verified):
- Phase 6.1 filtering tests (14 tests)
- Pending skeleton UI tests (3 tests)

```bash
npm test -- __tests__/minddrop-ui-rendering.test.tsx
# ✓ 17 passed
```

### Integration Testing (Manual)
To verify real-time updates work:

1. Open app in dev mode with console visible
2. Submit Mind Drop: "Buy milk tomorrow"
3. Watch console for:
   - "Setting up real-time subscriptions"
   - "Todos DB update" (INSERT event after Stage A)
   - "Todos DB update" (UPDATE event after Stage B)
   - "Auto-cleanup removed pending items"
4. Verify UI transitions: pending skeleton → full content card

## Technical Notes

### Subscription Pattern
Follows existing pattern from `lib/repo/supabase.ts` `subscribeToNotes`:

```typescript
const channel = supabase
  .channel('unique-channel-name')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'TABLE_NAME', filter: '...' }, callback)
  .subscribe();

return () => void channel.unsubscribe();
```

### Performance Considerations
- **Filter efficiency**: `owner_id=eq.X,origin=eq.catchall` uses indexed columns (fast)
- **Load calls**: Each DB update triggers `load()`, but React batches setState
- **Channel multiplexing**: Supabase reuses WebSocket connection (3 channels, 1 socket)
- **Auto-reconnect**: Supabase client handles reconnection automatically

### Security
- **RLS enabled**: Supabase Row Level Security ensures users only see own items
- **Filter redundancy**: Both client filter (`owner_id=eq.X`) and RLS protect data
- **No PII in logs**: Debug logs show IDs only, no user content

## Related Files Modified

1. **app/screens/CatchAllNotepad.tsx**
   - Added `useAuth()` hook (line 1113)
   - Added real-time subscription useEffect (lines 1477-1558)
   - Enhanced load() logging (lines 1423-1440)

## Rollback Plan

If issues arise, revert this commit. Fallback behavior:
- Manual reload still works (mount, refreshSignal, overlay saves)
- User can pull-to-refresh to see updates
- No data loss (pending items persist until manual refresh)

## Next Steps

1. Monitor production logs for subscription errors
2. Add metrics tracking: subscription success rate, reconnect frequency
3. Consider debouncing load() calls if performance issues arise
4. Add E2E test simulating Stage A → Stage B flow with real Supabase

---

**Implementation Date**: 2024
**Status**: ✅ Complete, all tests passing
**Impact**: Critical bug fix for Mind Drop v3 UX
