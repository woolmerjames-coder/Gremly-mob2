# Tests & TestIDs Implementation

**Phase 7 Hub: Test Coverage for Scope/Tabs/Unsorted**  
**Date:** 2025-01-23  
**Commit:** 882332e

## Overview

Added comprehensive test coverage for Phase 7 Hub features to prevent regressions in future phases (8-10). Implemented consistent testID naming conventions and created a focused test suite with 18 passing tests.

## TestID Naming Conventions

### Established Patterns

```typescript
// Kebab-case convention throughout
testID="component-name"
testID="component-name-action"
testID="component-name-item-{id}"
```

### Component TestIDs

#### ScopeSelector
```typescript
// Main button
testID="scope-selector"

// Dropdown options
testID="scope-option-everywhere"
testID="scope-option-unassigned"
testID={`scope-option-space-${spaceId}`}
```

#### SegmentedTabs
```typescript
// Tab buttons
testID={`tab-${tabName.toLowerCase()}`}
// Generates: "tab-habits", "tab-to-dos", "tab-journal", "tab-notes", "tab-people"
```

#### Notes Subfilter Pills
```typescript
testID="notes-filter-all"
testID="notes-filter-idea"
testID="notes-filter-list"
testID="notes-filter-reference"
```

#### Unsorted Banner & Review
```typescript
// Banner
testID="unsorted-banner"
testID="unsorted-banner-dismiss"

// Review Sheet
testID="unsorted-review-sheet"
testID={`unsorted-item-${itemId}`}
testID={`confirm-${itemId}`}
testID="unsorted-close"
```

#### PeopleList
```typescript
testID="people-list"
testID={`person-${personId}`}
```

#### HubScreen
```typescript
testID="hub-screen"
testID="hub-search"
testID="add-more-btn"
```

## Test Suite Structure

### File: `__tests__/hub.scope-tabs-unsorted.test.tsx`

**Coverage:** 18 tests, 6 test suites

#### 1. Scope Selector (4 tests)
- ✅ Renders scope selector with testID
- ✅ Opens scope dropdown and shows options
- ✅ Switches to Unassigned scope and filters items
- ✅ Switches to Work space and filters items

#### 2. Tab Switching (5 tests)
- ✅ Renders all tab buttons with testIDs
- ✅ Switches to To-Dos tab
- ✅ Switches to Journal tab
- ✅ Switches to Notes tab and shows subfilter pills
- ✅ Switches to People tab

#### 3. Notes Subfilter Pills (5 tests)
- ✅ Filters to Ideas when Ideas pill clicked
- ✅ Filters to Lists when Lists pill clicked
- ✅ Filters to Reference when Reference pill clicked
- ✅ Shows all notes when All pill clicked
- ✅ Resets subfilter to All when switching tabs

#### 4. Unsorted Banner and Review (2 tests)
- ✅ Shows unsorted banner with count
- ✅ Opens review sheet when banner clicked

#### 5. Integration (2 tests)
- ✅ Shows correct items when switching scope and tab
- ✅ Unsorted banner persists across tab switches

## Test Infrastructure

### Mock Structure

```typescript
// Mock data store with controlled state
const mockDataStore = {
  spaces: [...],
  habits: [...],
  todos: [...],
  notes: [...],
  people: [],
  tags: [],
};

// Reset in beforeEach to ensure test isolation
beforeEach(() => {
  jest.clearAllMocks();
  // Set ai_placed flags for specific unsorted items
  mockDataStore.habits[1].ai_placed = true;
  mockDataStore.todos[1].ai_placed = true;
  mockDataStore.notes[1].ai_placed = true;
});
```

### Mock Providers

```typescript
// AuthProvider mock
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    userId: 'test-user-id',
    loading: false,
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
  }),
}));

// RepoProvider mock with listByType, countUnsorted, etc.
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    listSpaces: jest.fn(async () => mockDataStore.spaces),
    countUnsorted: jest.fn(async () => /* count ai_placed items */),
    listByType: jest.fn(async (type, opts) => /* filter by type/scope */),
    // ... other repo methods
  }),
}));

// SheetManager mock
jest.mock('react-native-actions-sheet', () => ({
  SheetManager: {
    show: jest.fn(),
    hide: jest.fn(),
  },
}));
```

### Test Utilities

```typescript
import { renderWithProviders, screen, waitFor, fireEvent } from './utils/renderWithProviders';

// Custom render that wraps with all providers
renderWithProviders(<HubScreen />);

// Query by testID
screen.getByTestId('scope-selector');

// Query by text
screen.getByText('Morning Workout');

// Wait for async operations
await waitFor(() => {
  expect(screen.getByTestId('tab-habits')).toBeTruthy();
});

// Simulate user interactions
fireEvent.press(screen.getByTestId('tab-notes'));
```

## Running Tests

### Run Hub tests only
```bash
npm test -- --testPathPattern="hub.scope-tabs-unsorted"
```

### Run all tests
```bash
npm test
```

### Run with coverage
```bash
npm test -- --coverage
```

### Watch mode (for development)
```bash
npm test -- --watch --testPathPattern="hub"
```

## Test Data Setup

### Sample Mock Data

```typescript
// Habits (1 assigned, 1 unassigned+unsorted)
{ id: 'habit-1', title: 'Morning Workout', space_id: 'space-work', ai_placed: false },
{ id: 'habit-2', title: 'Evening Reading', space_id: null, ai_placed: true },

// To-Dos (1 assigned, 1 unassigned+unsorted)
{ id: 'todo-1', title: 'Submit report', space_id: 'space-work', ai_placed: false },
{ id: 'todo-2', title: 'Buy groceries', space_id: null, ai_placed: true },

// Notes (journal/idea/list/reference with varied assignments)
{ id: 'note-journal-1', body: '...', subtype: 'journal', space_id: 'space-personal' },
{ id: 'note-idea-1', body: '...', subtype: 'idea', space_id: null, ai_placed: true },
{ id: 'note-list-1', title: 'Shopping List', subtype: 'list', space_id: null },
{ id: 'note-reference-1', body: '...', subtype: 'reference', space_id: 'space-work' },

// Spaces
{ id: 'space-work', name: 'Work', icon: '💼' },
{ id: 'space-personal', name: 'Personal', icon: '🏠' },
```

## Key Testing Patterns

### 1. Component Rendering
```typescript
it('renders scope selector with testID', async () => {
  renderWithProviders(<HubScreen />);
  
  await waitFor(() => {
    expect(screen.getByTestId('scope-selector')).toBeTruthy();
  });
});
```

### 2. User Interactions
```typescript
it('switches to Notes tab', async () => {
  renderWithProviders(<HubScreen />);
  
  fireEvent.press(screen.getByTestId('tab-notes'));
  
  await waitFor(() => {
    expect(screen.getByTestId('notes-filter-all')).toBeTruthy();
  });
});
```

### 3. State Verification
```typescript
it('shows unsorted banner with count', async () => {
  renderWithProviders(<HubScreen />);
  
  await waitFor(() => {
    expect(screen.getByTestId('unsorted-banner')).toBeTruthy();
    expect(screen.getByText(/3 Unsorted items/i)).toBeTruthy();
  });
});
```

### 4. Integration Testing
```typescript
it('shows correct items when switching scope and tab', async () => {
  renderWithProviders(<HubScreen />);
  
  // Start on Habits, Everywhere scope
  await waitFor(() => {
    expect(screen.getByText('Morning Workout')).toBeTruthy();
  });
  
  // Switch to Work space
  fireEvent.press(screen.getByTestId('scope-selector'));
  fireEvent.press(screen.getByTestId('scope-option-space-space-work'));
  
  // Verify filtering
  await waitFor(() => {
    expect(screen.getByText('Morning Workout')).toBeTruthy();
    expect(screen.queryByText('Evening Reading')).toBeNull();
  });
  
  // Switch to To-Dos tab
  fireEvent.press(screen.getByTestId('tab-to-dos'));
  
  // Verify Work todos shown
  await waitFor(() => {
    expect(screen.getByText('Submit report')).toBeTruthy();
    expect(screen.queryByText('Buy groceries')).toBeNull();
  });
});
```

## Common Testing Pitfalls & Solutions

### Issue: Tests time out waiting for elements
**Solution:** Ensure mock data is set up correctly in beforeEach. Check that component actually renders the element.

### Issue: Can't find text that should be there
**Solution:** Check if text is truncated, ellipsized, or split across multiple Text components. Use regex for flexibility: `/text/i`

### Issue: fireEvent.press doesn't work on nested buttons
**Solution:** Use testID on the pressable component, not a wrapper View.

### Issue: Tests fail with "stopPropagation" error
**Solution:** React Native Testing Library doesn't provide full SyntheticEvent. Avoid testing complex event handling; test outcomes instead.

### Issue: State doesn't update after fireEvent
**Solution:** Wrap expectations in `await waitFor()` to allow async state updates to complete.

## Best Practices

### 1. Test IDs are for Testing Only
- Never use testIDs for app logic
- Keep testID names descriptive and consistent
- Use kebab-case: `"component-action"` not `"ComponentAction"`

### 2. Test Behavior, Not Implementation
- Focus on what users see and do
- Don't test internal state or implementation details
- Verify outcomes, not intermediate steps

### 3. Keep Tests Focused
- One logical assertion per test
- Use descriptive test names that explain the scenario
- Group related tests in `describe` blocks

### 4. Mock at the Right Level
- Mock external dependencies (providers, navigation)
- Use real components for the code under test
- Control mock data to create specific test scenarios

### 5. Test Isolation
- Reset mocks in `beforeEach`
- Don't rely on test execution order
- Each test should pass individually

## CI/CD Integration

### GitHub Actions (or similar)

```yaml
- name: Run tests
  run: npm test -- --ci --coverage --maxWorkers=2
  
- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

### Pre-commit Hook

```bash
# .husky/pre-commit
npm test -- --bail --findRelatedTests
```

## Future Test Coverage

### Phase 8-10 Priorities
- [ ] Tag filtering interaction tests
- [ ] People-linked item navigation
- [ ] Space picker in ManualAddOverlay
- [ ] Bulk operations (multi-select, move)
- [ ] Search functionality
- [ ] Performance tests (large datasets)

### Accessibility Testing
- [ ] Screen reader labels (accessibilityLabel)
- [ ] Keyboard navigation
- [ ] Focus management
- [ ] Color contrast (visual regression)

## Debugging Tests

### View rendered output
```typescript
import { debug } from '@testing-library/react-native';

renderWithProviders(<HubScreen />);
debug(); // Prints entire component tree
```

### Check what testIDs exist
```typescript
const { UNSAFE_getAllByType } = render(<HubScreen />);
// Inspect in debugger
```

### Run single test
```bash
npm test -- --testNamePattern="switches to Notes tab"
```

### Increase timeout for slow tests
```typescript
jest.setTimeout(10000); // 10 seconds
```

## Resources

- [React Native Testing Library Docs](https://callstack.github.io/react-native-testing-library/)
- [Jest API Reference](https://jestjs.io/docs/api)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- Project test utils: `__tests__/utils/renderWithProviders.tsx`

## Summary

✅ **18 tests passing** covering critical Phase 7 Hub functionality  
✅ **Consistent testID naming** across all components  
✅ **Comprehensive mock infrastructure** for isolated testing  
✅ **Integration tests** verify cross-feature interactions  
✅ **CI-ready** test suite prevents regressions  

**Next steps:**  
- Add visual regression tests for Phase 8  
- Expand coverage to tag/people features  
- Set up continuous test coverage monitoring
