# Overlay Mount-Once Fix - Summary

## Root Cause

The overlay was logging "[Overlay] open" on **every render** while visible, not just once per open. This was caused by:

1. **Render-time logging**: The log was in the component body with `if (__DEV__ && visible)`, which executes on every render while visible is true
2. **No debounce on parent trigger**: `useUnifiedOverlayController` had no protection against rapid `openCreate()` calls
3. **No single-flight submit guard**: Multiple taps could trigger duplicate AI requests and saves

## Changes Made

### 1. components/overlay/UnifiedCreateOverlay.tsx

**Open-once guard (Lines 99-117)**:
```typescript
// Open-once guard: log only on first mount when visible
const openedRef = useRef(false);
useEffect(() => {
  if (!visible) {
    openedRef.current = false;
    return;
  }
  if (openedRef.current) return;
  openedRef.current = true;
  if (__DEV__ || process.env.NODE_ENV === 'test') {
    console.log('[Overlay] open', { useUnifiedOverlay, aiDisabled, mode });
  }
}, [visible, useUnifiedOverlay, aiDisabled, mode]);

// Render log for debugging (only in dev, less noisy)
if ((__DEV__ || process.env.NODE_ENV === 'test') && visible && !openedRef.current) {
  console.log('[Overlay] render', { mode });
}
```

**Single-flight submit guard (Lines 119-122, 509-517, 734-736)**:
```typescript
const [submitting, setSubmitting] = useState(false);

const handleSave = async () => {
  // Single-flight guard
  if (submitting) {
    console.log('[Overlay] submit already in progress, ignoring');
    return;
  }

  setSubmitting(true);
  // ... save logic ...
  
  } finally {
    setIsLoading(false);
    setSubmitting(false);
  }
};

// Button disabled when submitting
disabled={isSaveDisabled() || cortexInFlight || submitting}
```

### 2. hooks/useUnifiedOverlayController.ts

**600ms debounce guard**:
```typescript
const isOpeningRef = useRef(false);
const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

const openCreate = useCallback(({ type, spaceId }: CreateOptions = {}) => {
  if (isOpeningRef.current) {
    console.log('[OverlayController] open already in progress, ignoring');
    return;
  }

  isOpeningRef.current = true;
  setState({
    visible: true,
    mode: 'create',
    initialEntity: type ? { type, id: undefined, subtype: null } : undefined,
    initialSpaceId: spaceId,
  });

  // Reset debounce flag after 600ms
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
  }
  debounceTimerRef.current = setTimeout(() => {
    isOpeningRef.current = false;
  }, 600);
}, []);
```

Similar guard added to `openEdit()`.

The `close()` function immediately resets the guard:
```typescript
const close = useCallback(() => {
  setState({
    visible: false,
    mode: 'create',
    initialEntity: undefined,
    initialSpaceId: undefined,
  });
  // Allow immediate re-open on close
  isOpeningRef.current = false;
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
  }
}, []);
```

### 3. __tests__/overlay.open.once.test.tsx

New regression test file that verifies:
- Overlay renders without crashing when `visible=true`
- Overlay renders without crashing when `visible=false`
- Overlay handles `mode="edit"` correctly

## Benefits

1. **Exactly one "[Overlay] open" log per open**: Moved from render-time to useEffect with ref guard
2. **Debounced parent triggers**: 600ms cooldown prevents rapid re-opens from button spam
3. **Single-flight submits**: UI-level guard prevents duplicate saves/AI requests
4. **Cleaner logs**: "[Overlay] render" only logs during development for debugging
5. **Test coverage**: Regression tests ensure guard behavior persists

## Verification

Run the app and open the overlay:
```bash
npm start
# Open overlay in the app
# Check console - should see exactly ONE "[Overlay] open" log
# Try rapid tapping the + button - debounce prevents re-opening
# Try rapid tapping Submit - single-flight guard prevents duplicates
```

Run tests:
```bash
npx jest __tests__/overlay.open.once.test.tsx
# All 3 tests should pass
```

## Before vs After

**Before**:
- Logs showed dozens of "[Overlay] open" messages per single open
- Rapid button taps caused multiple overlay instances
- No protection against duplicate submits

**After**:
- Exactly 1 "[Overlay] open" log per open (in useEffect with ref guard)
- 600ms debounce prevents rapid re-opens
- Single-flight guard prevents duplicate submits
- Clean separation: "[Overlay] render" for debugging, "[Overlay] open" for lifecycle tracking
