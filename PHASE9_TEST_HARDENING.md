# Phase 9: Today v2 - Test Hardening Summary

## Objective
Fix Jest segmentation faults and memory issues in Phase 9 Today v2 tests by:
1. Adding proper Jest setup with stable mocks
2. Implementing reduced-motion defaults  
3. Cleaning up animation timers
4. Preventing infinite render loops

## Changes Made

### 1. Jest Configuration (`jest.config.js`)
**Added:**
- `resetMocks: true`
- `restoreMocks: true`
- `clearMocks: true`

These ensure mocks are properly reset between tests.

### 2. Jest Setup (`jest-setup.ts`)
**Enhanced with:**
- `process.env.JEST_REDUCED_MOTION = '1'` - Forces all animations off in tests
- `ResizeObserver` stub for JSDOM compatibility
- Synchronous `requestAnimationFrame` / `cancelAnimationFrame` for tests
- `jest.useRealTimers()` by default

### 3. New Mocks

#### `__mocks__/lottie-react-native.tsx`
Simple View stub to avoid requiring native Lottie in Jest:
```tsx
export default function LottieView(props: any) {
  return <View testID={props.testID || 'mock-lottie'} />;
}
```

#### `__mocks__/react-native-gesture-handler.tsx`
Minimal pass-through mocks for gesture components:
```tsx
export const Swipeable = ({ children }: any) => children;
export const RectButton = ({ children }: any) => children;
// etc.
```

### 4. Reduced Motion Utility (`lib/a11y/reducedMotion.ts`)
New utility function that:
- Respects `JEST_REDUCED_MOTION=1` in tests
- Returns `false` (animations enabled) in production
- Can be enhanced to check OS accessibility settings in Phase 10

**Usage:**
```ts
const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();
```

### 5. Component Updates

#### All Phase 9 Components
- **TodayHabitCard.tsx**: Now uses `isReducedMotion()` helper
- **TodayTodoCard.tsx**: Now uses `isReducedMotion()` helper
- **TodaySuggestionCard.tsx**: Now uses `isReducedMotion()` + proper animation cleanup
- **TodaySection.tsx**: Now uses `isReducedMotion()` helper

**Pattern:**
```tsx
import { isReducedMotion } from '../../lib/a11y/reducedMotion';

const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();
```

This allows:
- Tests to force `reducedMotion=true` via env var
- Props to override when needed
- Components to respect OS settings in production (future)

#### `lib/today/motion.ts`
**Fixed `pulse()` function:**
- Now returns `Animated.CompositeAnimation | null`
- Allows caller to `.stop()` animation on cleanup
- Prevents lingering animation loops in tests

**Before:**
```ts
export function pulse(animatedValue: Animated.Value, reducedMotion: boolean = false): void {
  // ...
  Animated.loop(...).start();
}
```

**After:**
```ts
export function pulse(...): Animated.CompositeAnimation | null {
  const animation = Animated.loop(...);
  animation.start();
  return animation;
}
```

#### `components/today/TodaySuggestionCard.tsx`
**Added proper cleanup:**
```tsx
const animationRef = useRef<Animated.CompositeAnimation | null>(null);

useEffect(() => {
  if (!rm) {
    animationRef.current = pulse(scale, rm);
  }
  return () => {
    if (animationRef.current) {
      animationRef.current.stop();
    }
    scale.stopAnimation();
  };
}, [rm, scale]);
```

### 6. Fixed Infinite Loop in `lib/today/useTodayData.ts`

**Problem:**
`load()` callback had `reducedMotion` in dependency array. Since `reducedMotion` comes from `useReducedMotion()` hook (which uses Reanimated), it was changing on every render, causing infinite loops.

**Solution:**
```ts
// Removed reducedMotion from load() dependencies
const load = useCallback(async () => {
  // ...
}, [repo, user]); // ← Removed reducedMotion

// Return current reducedMotion from hook, not from state
return {
  ...data,
  reducedMotion, // ← Live value from useReducedMotion()
  reload: load,
};
```

### 7. Test File Updates (`__tests__/today.ds.test.tsx`)

**Added mocks:**
```tsx
// Force reduced motion in tests
process.env.JEST_REDUCED_MOTION = '1';

// Mock CortexProvider to avoid heuristic engine complexity
jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({
    suggestCategoryAndPriority: jest.fn(...),
    detectContextTags: jest.fn(() => []),
  }),
  CortexProvider: ({ children }: any) => children,
}));
```

**Updated mock data structure** to match Phase 9 requirements:
- Habits with `due_window`, `streakCount`
- Todos with `overdue`, `near_due` flags
- Suggestions from `undefinedDueData`
- Space lookups via `spacesData` object

## Validation

✅ **Lint**: 0 errors, 71 warnings (all pre-existing)
✅ **TypeCheck**: 0 errors  
⚠️ **Tests**: Phase 9 Today tests still have memory issues (requires further investigation)

**Note:** Basic tests (`sanity.test.ts`) pass successfully. The memory issue is specific to the Today screen integration test, likely due to:
1. Complex provider tree (Auth + Repo + Cortex + Theme)
2. Async data fetching in `useTodayData` hook
3. Multiple re-renders during data enrichment

## Next Steps (Phase 9 Step 2)

1. **Simplify Today test approach:**
   - Test individual components in isolation
   - Mock `useTodayData` hook entirely
   - Avoid full screen integration tests until provider tree is optimized

2. **Wire repo persistence:**
   - Implement actual `onComplete` / `onAccept` handlers
   - Add analytics events
   - Test with fake timers for debouncing

3. **Optimize data fetching:**
   - Consider batching space lookups
   - Add request deduplication
   - Implement proper loading states

## Commit

```bash
git commit -m "test: Jest setup hardening with stable mocks and reduced-motion defaults

- Updated jest.config.js: added resetMocks, restoreMocks, clearMocks flags
- Enhanced jest-setup.ts with JEST_REDUCED_MOTION env var and ResizeObserver stub
- Added __mocks__/lottie-react-native.tsx (simple View stub)
- Added __mocks__/react-native-gesture-handler.tsx (minimal pass-through mocks)
- Created lib/a11y/reducedMotion.ts utility (respects JEST_REDUCED_MOTION in tests)
- Updated all Phase 9 components to use isReducedMotion() helper
- Fixed TodaySuggestionCard: pulse animation cleanup with animation.stop()
- Fixed lib/today/motion.ts: pulse() now returns animation object for cleanup
- Fixed lib/today/useTodayData.ts: removed reducedMotion from load() dependencies (infinite loop fix)
- Updated __tests__/today.ds.test.tsx: added CortexProvider mock, updated mock data structure
- All components now default to reduced motion when prop is undefined

Prevents animation timers and infinite re-renders in tests."
```

## Files Changed

### Created
- `__mocks__/lottie-react-native.tsx` - Lottie mock
- `__mocks__/react-native-gesture-handler.tsx` - Gesture handler mock
- `lib/a11y/reducedMotion.ts` - Reduced motion utility

### Modified
- `jest.config.js` - Added reset/restore/clear flags
- `jest-setup.ts` - Added JEST_REDUCED_MOTION, ResizeObserver, RAF stubs
- `components/today/TodayHabitCard.tsx` - Use isReducedMotion() helper
- `components/today/TodayTodoCard.tsx` - Use isReducedMotion() helper
- `components/today/TodaySuggestionCard.tsx` - Use isReducedMotion() + animation cleanup
- `components/today/TodaySection.tsx` - Use isReducedMotion() helper
- `lib/today/motion.ts` - pulse() returns animation object
- `lib/today/useTodayData.ts` - Fixed infinite loop (removed reducedMotion from deps)
- `__tests__/today.ds.test.tsx` - Added CortexProvider mock, updated mock data

## Technical Patterns Established

### 1. Reduced Motion Pattern
```tsx
import { isReducedMotion } from '../../lib/a11y/reducedMotion';

const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();
// Use `rm` instead of `reducedMotion` throughout
```

### 2. Animation Cleanup Pattern
```tsx
const animationRef = useRef<Animated.CompositeAnimation | null>(null);

useEffect(() => {
  if (!rm) {
    animationRef.current = someAnimation(...);
  }
  return () => {
    if (animationRef.current) {
      animationRef.current.stop();
    }
    animatedValue.stopAnimation();
  };
}, [rm, animatedValue]);
```

### 3. Avoiding Infinite Loops in Hooks
- Don't include hook return values (like `useReducedMotion()`) in `useCallback` dependencies
- Store stable values in state only once
- Return live values directly from custom hooks

