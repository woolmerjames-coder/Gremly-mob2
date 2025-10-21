# Phase 9 Step 3: A11y Labels, Near-Due Glow, Focused Unit Tests

**Completed**: October 2025  
**Status**: ✅ Complete

## Summary

Added accessibility labels and testIDs to all Today v2 components, implemented subtle near-due glow styling for urgent todos, and created comprehensive focused unit tests for the useTodayData hook and card components.

## Changes Made

### 1. Accessibility & TestIDs

**TodayHabitCard** (`components/today/TodayHabitCard.tsx`):
- Complete button:
  - `testID="habit-check-${id}"`
  - `accessibilityRole="button"`
  - `accessibilityLabel="Complete habit '${name}'"`
- Long-press surface:
  - `testID="habit-longpress-${id}"`
  - `accessibilityLabel="Options for habit '${name}'"`

**TodayTodoCard** (`components/today/TodayTodoCard.tsx`):
- Complete button:
  - `testID="todo-complete-${id}"`
  - `accessibilityRole="button"`
  - `accessibilityLabel="Complete to-do '${title}'"`
- Long-press surface:
  - `testID="todo-longpress-${id}"`
  - `accessibilityLabel="Options for to-do '${title}'"`
- Card container: `testID="todo-card-${id}"`

**TodaySection** (`components/today/TodaySection.tsx`):
- Already had proper accessibility:
  - Toggle button: `testID="today-section-toggle-${kebabCase(title)}"`
  - `accessibilityRole="button"`
  - `accessibilityLabel="${expanded ? 'Collapse' : 'Expand'} section '${title}'"`

### 2. Near-Due Glow Styling

**Implementation** (`TodayTodoCard.tsx`):
```typescript
const getNearDueGlow = () => {
  if (!nearDue) return {};
  return {
    borderWidth: 1,
    borderColor: t.colors.accentMint,
    shadowColor: t.colors.accentMint,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  };
};
```

**Features**:
- Uses mint accent color (#A5F3C1) from design tokens
- Subtle shadow with 25% opacity
- Gentle 6px radius for soft glow effect
- Platform-appropriate elevation for Android
- Applied only when `nearDue === true`
- Pure StyleSheet (no animations)
- Respects reduced motion (static styling)

**Visual Hierarchy**:
- **Overdue**: Left border (4px, red/danger)
- **Near due**: Full border + glow (1px + shadow, mint)
- **Normal**: Standard card appearance

### 3. Focused Unit Tests

**useTodayData Hook Tests** (`__tests__/useTodayData.test.ts`):

Created comprehensive tests for data hook heuristics:

**Test Coverage**:
1. **Habit Ordering**: Verifies habits with dueWindow first, then alphabetically by name
2. **Todo Ordering**: Confirms overdue → nearDue → dueTime → title sorting
3. **Capping Logic**: Tests max 5 visible items per section with correct hidden counts
4. **Suggestion Capping**: Validates suggestions capped at 3 items
5. **Real Stats**: Confirms countPlannedToday and countCompletedToday are called
6. **Event Bus Integration**: Tests auto-reload on ItemCompleted/ItemSaved/ItemUpdated events
7. **Space Enrichment**: Verifies space names fetched and attached to items
8. **Error Handling**: Tests graceful failure with error state
9. **Authentication**: Tests unauthenticated user state

**Key Test Patterns**:
- Mock repo with jest functions
- Use helper factories (`createHabit`, `createTodo`) for valid test data
- Mock Date for deterministic overdue/nearDue calculations
- Test event bus with `eventBus.emit()` and verify reload triggered
- Use `renderHook` and `waitFor` from @testing-library/react-native

**TodayCards Component Tests** (`__tests__/TodayCards.test.tsx`):

Created isolation tests for card components:

**TodayHabitCard Tests**:
- Renders habit name correctly
- Calls onComplete with correct id when check button pressed
- Calls onLongPress when long press area activated
- Verifies correct accessibility labels on all interactive elements
- Renders optional props: dueWindow, streakCount, spaceName, tags (max 2)

**TodayTodoCard Tests**:
- Renders todo title correctly
- Calls onComplete with correct id when complete button pressed
- Calls onLongPress when long press area activated
- Verifies correct accessibility labels
- Renders due time when provided
- Shows overdue indicator (⏰) when overdue
- Applies near-due glow styling when nearDue is true
- Renders optional props: spaceName, tags (max 2)

**Test Utilities**:
- Mock `useTokens` with complete token structure (colors, spacing, radius, typography)
- Mock `isReducedMotion` to return true for stable tests
- Use `@testing-library/react-native` for component rendering
- Verify testIDs and accessibilityLabels are present

### 4. Reduced Motion

Both card components already compute:
```typescript
const rm = typeof reducedMotion === 'boolean' ? reducedMotion : isReducedMotion();
```

This ensures:
- Prop-based override when passed explicitly
- Falls back to system accessibility setting
- Used to skip pop animations on completion
- Near-due glow remains static (no pulse/animation)

## Test Results

```bash
✅ TodayCards: 18 tests passed
✅ useTodayData: 11 tests passed
✅ Total: 29 new tests, 0 failures
✅ Lint: Only pre-existing warnings
✅ TypeCheck: No errors
```

## Files Modified

**Components** (3):
- `components/today/TodayHabitCard.tsx` - Added testIDs and accessibility labels
- `components/today/TodayTodoCard.tsx` - Added near-due glow, testIDs, accessibility labels
- `components/today/TodaySection.tsx` - Already had accessibility (no changes needed)

**Tests Created** (2):
- `__tests__/useTodayData.test.ts` - 11 focused hook tests
- `__tests__/TodayCards.test.tsx` - 18 component isolation tests

## Accessibility Compliance

All interactive elements now have:
- ✅ Unique testIDs for automated testing
- ✅ Descriptive accessibilityLabels with context
- ✅ Proper accessibilityRole declarations
- ✅ Screen reader friendly labels (quotes around names/titles)

**Example Labels**:
- `"Complete habit 'Morning Meditation'"` - Clear action + context
- `"Options for to-do 'Review PR'"` - Describes long-press affordance
- `"Collapse section 'Habits Today'"` - Dynamic state in label

## Visual Enhancements

**Near-Due Indicator**:
- Mint green glow distinguishes items due within 3 hours
- Subtle enough to not be distracting
- Clear enough to draw attention
- Complements existing overdue indicator (red left border)
- Uses existing design tokens (no new colors)

**Color Palette** (from `design/tokens.ts`):
- Mint accent: `#A5F3C1` - Near due glow
- Periwinkle: `#AEB8FF` - Near due left border
- Danger red: `#E25555` - Overdue indicator
- Success green: `#34C759` - Completion buttons

## Testing Strategy

**Unit Tests (Hook)**:
- Fast, isolated tests for heuristic logic
- Mock all external dependencies (repo, auth, date)
- Deterministic test data with factories
- Event bus integration verified

**Component Tests (Cards)**:
- Render in isolation with minimal mocks
- Test user interactions (press, long press)
- Verify accessibility attributes
- Check conditional rendering (dueWindow, streak, tags)

**No Full-Screen Integration Tests**:
- As requested, avoided heavy full-screen tests
- Focused on unit-level logic and component isolation
- Faster test execution (< 2 seconds combined)

## Commands Run

```bash
npm run lint      # ✅ Passed (only pre-existing warnings)
npm run typecheck # ✅ Passed (0 errors)
npm test -- TodayCards    # ✅ 18/18 passed
npm test -- useTodayData  # ✅ 11/11 passed
```

## Next Steps (Future Enhancements)

1. **Phase 12**: Replace completion buttons with swipe gestures (already noted as TODO)
2. **Streak Calculation**: Real habit completion history (Phase 10)
3. **Animation Variants**: Subtle pulse on near-due glow (optional, respecting reduced motion)
4. **Haptic Feedback**: Tactile response on completion (iOS/Android)
5. **Integration Tests**: Optional E2E tests for full Today flow

## User Experience Impact

**Before Step 3**:
- Completion buttons worked but no screen reader labels
- No visual distinction for near-due items beyond time text
- No automated test coverage for ordering/capping logic

**After Step 3**:
- ✅ Full accessibility for screen readers
- ✅ Clear visual cues for urgency (glow + border)
- ✅ Comprehensive test coverage (29 tests)
- ✅ Testable with automation frameworks (testIDs)
- ✅ Reduced motion respected throughout
- ✅ Professional polish for iOS/Android apps

## Technical Decisions

1. **Pure StyleSheet**: No animated components for glow (simpler, faster, respects reduced motion)
2. **Mint Accent Color**: Chosen from existing tokens to maintain design consistency
3. **Test File Naming**: Used `.test.ts(x)` to match jest config pattern
4. **Mock Completeness**: Full token structure in mocks to avoid missing property errors
5. **Factory Functions**: Created helpers for test data to reduce duplication
6. **Date Mocking**: Used jest.fn() approach for better test stability

## Validation Checklist

- ✅ All cards have testIDs
- ✅ All interactive elements have accessibilityLabels
- ✅ Near-due glow applied with subtle styling
- ✅ Reduced motion respected (no animations)
- ✅ 29 focused unit tests created and passing
- ✅ No full-screen integration tests (as requested)
- ✅ Lint passes (only pre-existing warnings)
- ✅ TypeScript passes (0 errors)
- ✅ StyleSheet-only approach (no new runtime deps)
