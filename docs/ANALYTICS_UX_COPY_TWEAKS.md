# Analytics & UX Copy Tweaks - Phase 10

**Date**: 2025-10-20
**Branch**: `phase-10/cortex-on`
**File**: `components/overlay/UnifiedCreateOverlay.tsx`

## Summary

Added brand-aligned UX copy and analytics logging to the optimistic "Thinking…" flow for future analytics integration.

## Changes

### 1. UX Copy Improvements

#### Toast Messages (Brand Tone)
- **Fast path (AI < 1s)**: `"Added to Hub"` ✅
- **Slow path (AI ≥ 1s)**: `"Delivered to Hub — sorting in background"` ℹ️
- **AI disabled**: `"Added to Hub"` ✅
- **Background success**: (no toast - silent update)
- **Background failure**: (no toast - silent update with note for future EventBus integration)

#### Brand Tone Rationale
- "Added to Hub" - Simple, confident, complete
- "Delivered to Hub — sorting in background" - Reassuring, transparent, non-blocking
- Future: "Added to Hub — needs review" (for failed classifications when EventBus wired)

### 2. Analytics Logging

All analytics logs use `[UX]` prefix for easy filtering and future integration with analytics service.

#### Log Points

**capture_submitted** - User initiates save
```typescript
console.log('[UX] capture_submitted', { mode: 'ai' });
```
- Triggered: At start of AI freeform save
- Payload: `{ mode: 'ai' }`
- Future: Add `{ mode: 'structured', type: 'todo' | 'habit' | etc }`

**capture_saved** - Item saved to database
```typescript
// Fast path
console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'classified' });

// Slow path (optimistic)
console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'pending' });

// Background success
console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'classified' });

// Background failure/timeout
console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'failed' });

// AI disabled
console.log('[UX] capture_saved', { path: 'catchall', aiStatus: 'disabled' });
```
- Triggered: After successful repo.create() or repo.update()
- Payload:
  - `path`: 'catchall' (future: 'habit', 'todo', 'journal', 'note', 'person')
  - `aiStatus`: 'classified' | 'pending' | 'failed' | 'disabled'

**capture_closed** - Overlay dismissed
```typescript
console.log('[UX] capture_closed');
```
- Triggered: In `handleClose()` before resetForm()
- Payload: None (could add `{ saved: boolean, type: string }` in future)

### 3. Code Locations

#### Analytics Logs Added
- Line ~481: `capture_closed` in `handleClose()`
- Line ~533: `capture_submitted` at AI freeform start
- Line ~553: `capture_saved` (AI disabled path)
- Line ~604: `capture_saved` (fast path - classified)
- Line ~645: `capture_saved` (slow path - pending)
- Line ~703: `capture_saved` (background success - classified)
- Line ~710: `capture_saved` (background failure - failed)
- Line ~720: `capture_saved` (background timeout - failed)

#### Toast Messages Updated
- Line ~554: AI disabled → "Added to Hub"
- Line ~605: Fast path → "Added to Hub"
- Line ~646: Slow path → "Delivered to Hub — sorting in background"
- Background paths: No toast (silent updates)

### 4. Future EventBus Integration

Added comments for future toast notifications on background failures:
```typescript
// Note: We could emit EventBus event here for UI toast
// EventBus.emit('cortex:failed', { itemId: newItem.id, error: 'classification failed' });
```

This would trigger a toast in HubScreen like:
```typescript
// In HubScreen or global listener
EventBus.on('cortex:failed', ({ itemId, error }) => {
  showToast('Added to Hub — needs review');
});
```

## Analytics Flow Examples

### Example 1: Fast AI (User perspective)
1. User types "buy milk"
2. Clicks "Save to Hub"
3. Button shows "Thinking…" for ~800ms
4. AI completes
5. Toast: "Added to Hub"
6. Overlay closes

**Console logs:**
```
[UX] capture_submitted { mode: 'ai' }
[Overlay] ai ms 847
[UX] capture_saved { path: 'catchall', aiStatus: 'classified' }
[UX] capture_closed
```

### Example 2: Slow AI (User perspective)
1. User types "organize files by next week"
2. Clicks "Save to Hub"
3. Button shows "Thinking…" for exactly 1s
4. Toast: "Delivered to Hub — sorting in background"
5. Overlay closes
6. (5 seconds later, background classification completes)

**Console logs:**
```
[UX] capture_submitted { mode: 'ai' }
[Overlay] ai ms (optimistic) 1003
[UX] capture_saved { path: 'catchall', aiStatus: 'pending' }
[UX] capture_closed
... (4 seconds later)
[Overlay] bg classification success <item-id>
[UX] capture_saved { path: 'catchall', aiStatus: 'classified' }
```

### Example 3: AI Disabled
1. User types "call mom"
2. Clicks "Save to Hub"
3. Toast: "Added to Hub" (immediate)
4. Overlay closes

**Console logs:**
```
[UX] capture_submitted { mode: 'ai' }
[UX] capture_saved { path: 'catchall', aiStatus: 'disabled' }
[UX] capture_closed
```

### Example 4: Background Timeout
1. User types "plan vacation"
2. Slow AI (>1s)
3. Optimistic save → closes
4. Background AI times out after 5s

**Console logs:**
```
[UX] capture_submitted { mode: 'ai' }
[Overlay] ai ms (optimistic) 1012
[UX] capture_saved { path: 'catchall', aiStatus: 'pending' }
[UX] capture_closed
... (5 seconds later)
[Overlay] bg classification timeout <item-id> Error: bg-timeout
[UX] capture_saved { path: 'catchall', aiStatus: 'failed' }
```

## Testing

### Manual Test Cases
- [x] Fast AI (<1s) shows "Added to Hub"
- [x] Slow AI (≥1s) shows "Delivered to Hub — sorting in background"
- [x] AI disabled shows "Added to Hub"
- [x] All analytics logs fire correctly
- [x] Console logs have correct payloads

### Automated Tests (Future)
```typescript
// __tests__/overlay.analytics.test.tsx
it('logs capture_submitted when AI mode save starts', async () => {
  const spy = jest.spyOn(console, 'log');
  // ... render overlay, enter text, click save
  expect(spy).toHaveBeenCalledWith('[UX] capture_submitted', { mode: 'ai' });
});

it('logs capture_saved with aiStatus:classified on fast path', async () => {
  // ... mock fast AI response
  expect(spy).toHaveBeenCalledWith('[UX] capture_saved', { 
    path: 'catchall', 
    aiStatus: 'classified' 
  });
});

it('logs capture_closed when overlay dismissed', async () => {
  // ... close overlay
  expect(spy).toHaveBeenCalledWith('[UX] capture_closed');
});
```

## Next Steps

1. **Analytics Service Integration**: Replace console.log with analytics service
   ```typescript
   // Future: lib/analytics.ts
   export const trackEvent = (event: string, props?: object) => {
     // Send to analytics service (Amplitude, Mixpanel, etc.)
     console.log('[Analytics]', event, props);
   };
   
   // Then update logs:
   trackEvent('capture_submitted', { mode: 'ai' });
   trackEvent('capture_saved', { path: 'catchall', aiStatus: 'classified' });
   trackEvent('capture_closed');
   ```

2. **EventBus Toasts**: Wire EventBus events for background failure toasts
   ```typescript
   // In HubScreen or App.tsx
   useEffect(() => {
     const unsubFailed = EventBus.on('cortex:failed', ({ itemId, error }) => {
       showToast('Added to Hub — needs review');
     });
     
     const unsubClassified = EventBus.on('cortex:classified', ({ itemId }) => {
       // Optional: Show subtle success indicator
     });
     
     return () => {
       unsubFailed();
       unsubClassified();
     };
   }, []);
   ```

3. **Analytics Dashboard**: Track metrics
   - Fast vs slow path usage
   - Background classification success rate
   - Average AI response time
   - User behavior after optimistic save

---

**Status**: ✅ Complete
**Phase**: 10 - Cortex Optimistic UX
**Related**: `docs/OPTIMISTIC_THINKING_UX.md`
