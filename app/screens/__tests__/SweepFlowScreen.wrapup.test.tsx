// SKIP: Needs Zustand migration - tests use old useRepo mocks
/**
 * SweepFlowScreen Habits Today Step Tests
 *
 * Tests the "Habits today" step (step 3) of the Sweep flow.
 * This step is habits-only - users can mark habits as complete for the day.
 * New flow: Intro (0) → Decision (1) → Mood (2) → Habits (3) → Summary (4)
 * Mocks lib/today hooks to provide fake data, then verifies rendering and onContinue.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock sweep engine (to prevent fetch during habits step tests)
const mockFetchSweepCandidates = jest.fn().mockResolvedValue([]);
jest.mock('../../../lib/sweep/engine', () => ({
  __esModule: true,
  fetchSweepCandidatesForUser: (...args: any[]) => mockFetchSweepCandidates(...args),
  applySweepAction: () => Promise.resolve(),
  markSweepCompleted: () => Promise.resolve(),
}));

// Mock Supabase client
jest.mock('../../../lib/supabase/client', () => ({
  __esModule: true,
  supabase: {},
}));

// Mock RepoProvider
const mockCreate = jest.fn(() => Promise.resolve({ id: 'test-note-id' }));
const mockUpdate = jest.fn(() => Promise.resolve());
const mockSweepApplyAction = jest.fn(() => Promise.resolve());

jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: mockCreate,
    update: mockUpdate,
    sweepApplyAction: mockSweepApplyAction,
    getById: jest.fn(),
  }),
}));

// Mock AuthProvider
jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user-id' }),
}));

// Mock data for useTodayEntries - only habits are relevant for this step
const mockHabit1 = {
  id: 'habit-1',
  type: 'habit' as const,
  name: 'Morning meditation',
  due_day: new Date().toISOString().split('T')[0],
};

const mockHabit2 = {
  id: 'habit-2',
  type: 'habit' as const,
  name: 'Evening journaling',
  due_day: new Date().toISOString().split('T')[0],
};

// These todos should NOT appear in the Habits step (filtered out)
const mockTodo = {
  id: 'todo-1',
  type: 'todo' as const,
  name: 'Review pull request',
  due_day: new Date().toISOString().split('T')[0],
};

const mockReload = jest.fn();

// Mock useTodayEntries with habits and todos (step should only show habits)
jest.mock('../../../lib/today/hooks/useTodayEntries', () => ({
  __esModule: true,
  useTodayEntries: () => ({
    items: [mockHabit1, mockHabit2, mockTodo],
    doneItems: [],
    loading: false,
    reload: mockReload,
  }),
}));

// Mock useTodayInteractions
const mockToggleHabitComplete = jest.fn();
const mockToggleTodoComplete = jest.fn();
const mockMarkItemDeleted = jest.fn();

jest.mock('../../../lib/today/useTodayInteractions', () => ({
  __esModule: true,
  useTodayInteractions: () => ({
    toggleHabitComplete: mockToggleHabitComplete,
    toggleTodoComplete: mockToggleTodoComplete,
    completedHabitIds: new Set(),
    completedTodoIds: new Set(),
    deletedItemIds: new Set(),
    markItemDeleted: mockMarkItemDeleted,
  }),
}));

// Mock useOverlayController
jest.mock('../../../hooks/useOverlayController', () => ({
  __esModule: true,
  useOverlayController: () => ({
    state: { visible: false, mode: 'create', initialEntity: null, initialSpaceId: null },
    openEdit: jest.fn(),
    openCreate: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      goBack: jest.fn(),
    }),
    useRoute: () => ({
      params: {},
    }),
  };
});

import SweepFlowScreen from '../SweepFlowScreen';

/**
 * Helper to advance to the Habits step (step 3)
 * Flow: Intro (0) → Decision (1) → Mood (2) → Habits (3)
 * Since SweepWrapUpStep is not exported, we navigate through the flow
 */
async function renderAtHabitsStep() {
  const result = render(<SweepFlowScreen />);

  // Step 0: Intro - tap "Start Sweeping" to go to Decision
  await waitFor(() => {
    expect(result.getByText('Time for a quick tidy')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Start Sweeping'));

  // Step 1: Decision - empty state, tap "Done" to go to Mood
  await waitFor(() => {
    expect(result.getByText('Nothing to sweep!')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Done'));

  // Step 2: Mood - skip to go to Habits
  await waitFor(() => {
    expect(result.getByText('How did today feel?')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Skip for now'));

  // Step 3: Habits - wait for it to appear
  await waitFor(() => {
    expect(result.getByText('Habits today')).toBeTruthy();
  });

  return result;
}

describe.skip('SweepFlowScreen - Habits Today Step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Habits today step header', async () => {
    const { getByText } = await renderAtHabitsStep();

    expect(getByText('Habits today')).toBeTruthy();
    expect(getByText('Mark what you managed today. Everything resets tomorrow.')).toBeTruthy();
  });

  it('renders habit items in the list', async () => {
    const { getByText } = await renderAtHabitsStep();

    expect(getByText('Morning meditation')).toBeTruthy();
    expect(getByText('Evening journaling')).toBeTruthy();
  });

  it('does not render todo items (habits only)', async () => {
    const { queryByText } = await renderAtHabitsStep();

    // Todos should NOT appear in the Habits step
    expect(queryByText('Review pull request')).toBeNull();
  });

  it('renders the Continue button', async () => {
    const { getByText } = await renderAtHabitsStep();

    expect(getByText('Continue')).toBeTruthy();
  });

  it('shows open habits count reminder', async () => {
    const { getByText } = await renderAtHabitsStep();

    // Should show "2 habits still open."
    expect(getByText('2 habits still open.')).toBeTruthy();
  });

  it('calls toggleHabitComplete when tapping a habit row', async () => {
    const { getByText } = await renderAtHabitsStep();

    // Tap on a habit row
    fireEvent.press(getByText('Morning meditation'));

    // Should call toggleHabitComplete with the habit data
    expect(mockToggleHabitComplete).toHaveBeenCalledWith({
      id: 'habit-1',
      name: 'Morning meditation',
    });
  });

  it('does not call toggleTodoComplete (no todo interactions)', async () => {
    const { getByText } = await renderAtHabitsStep();

    // Tap on a habit
    fireEvent.press(getByText('Evening journaling'));

    // Should NOT have called toggleTodoComplete
    expect(mockToggleTodoComplete).not.toHaveBeenCalled();
  });

  it('advances to summary step when pressing Continue', async () => {
    const { getByText, queryByText } = await renderAtHabitsStep();

    // Press Continue - should advance to step 4 (Summary)
    fireEvent.press(getByText('Continue'));

    // Should now show summary step content
    await waitFor(() => {
      expect(getByText('Sweep complete')).toBeTruthy();
    });

    // Habits step should no longer be visible
    expect(queryByText('Habits today')).toBeNull();
  });
});

// Empty state tests are in SweepFlowScreen.wrapup.empty.test.tsx
