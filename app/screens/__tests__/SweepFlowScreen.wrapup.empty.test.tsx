/**
 * SweepFlowScreen Habits Today Step Empty State Tests
 *
 * Tests the empty state of the "Habits today" step (step 2) when there are no habits.
 * Flow: Intro (0) → Decision (1) → Habits (2) → Mood (3) → Summary (4)
 * Separate file due to Jest module caching constraints.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock sweep engine
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
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: jest.fn(() => Promise.resolve({ id: 'test-note-id' })),
    update: jest.fn(() => Promise.resolve()),
    sweepApplyAction: jest.fn(() => Promise.resolve()),
    getById: jest.fn(),
  }),
}));

// Mock AuthProvider
jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user-id' }),
}));

// Mock useTodayEntries with NO HABITS for empty state testing
// Include a todo to verify it doesn't appear (habits-only step)
const mockTodo = {
  id: 'todo-1',
  type: 'todo' as const,
  name: 'Some todo that should not appear',
  due_day: new Date().toISOString().split('T')[0],
};

jest.mock('../../../lib/today/hooks/useTodayEntries', () => ({
  __esModule: true,
  useTodayEntries: () => ({
    items: [mockTodo], // Only a todo, no habits
    doneItems: [],
    loading: false,
    reload: jest.fn(),
  }),
}));

// Mock useTodayInteractions
jest.mock('../../../lib/today/useTodayInteractions', () => ({
  __esModule: true,
  useTodayInteractions: () => ({
    toggleHabitComplete: jest.fn(),
    toggleTodoComplete: jest.fn(),
    completedHabitIds: new Set(),
    completedTodoIds: new Set(),
    deletedItemIds: new Set(),
    markItemDeleted: jest.fn(),
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
 * Helper to navigate to Habits step (step 2)
 * Flow: Intro (0) → Decision (1) → Habits (2)
 */
async function navigateToHabitsStep(result: ReturnType<typeof render>) {
  // Step 0: Intro - tap "Start Sweeping" to go to Decision
  await waitFor(() => {
    expect(result.getByText('Time for a quick tidy')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Start Sweeping'));

  // Step 1: Decision - empty state, tap "Done" to go to Habits
  await waitFor(() => {
    expect(result.getByText("Nothing to Sweep right now — you're all clear.")).toBeTruthy();
  });
  fireEvent.press(result.getByText('Done'));

  // Step 2: Habits - wait for it to appear
  await waitFor(() => {
    expect(result.getByText('Habits today')).toBeTruthy();
  });
}

describe('SweepFlowScreen - Habits Today Step (Empty State)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state message when there are no habits', async () => {
    const result = render(<SweepFlowScreen />);

    await navigateToHabitsStep(result);

    // Should show empty state message for habits
    expect(result.getByText(/No habits to check off/)).toBeTruthy();
    expect(result.getByText(/you're all set/)).toBeTruthy();
  });

  it('does not show todos in the habits step (habits only)', async () => {
    const result = render(<SweepFlowScreen />);

    await navigateToHabitsStep(result);

    // The todo should NOT appear - this is a habits-only step
    expect(result.queryByText('Some todo that should not appear')).toBeNull();
  });

  it('still renders Continue button in empty state', async () => {
    const result = render(<SweepFlowScreen />);

    await navigateToHabitsStep(result);

    // Continue button should still be visible
    expect(result.getByText('Continue')).toBeTruthy();
  });

  it('advances to mood step when pressing Continue in empty state', async () => {
    const result = render(<SweepFlowScreen />);

    await navigateToHabitsStep(result);

    // Press Continue
    fireEvent.press(result.getByText('Continue'));

    // Should advance to Mood step (step 3)
    await waitFor(() => {
      expect(result.getByText('How was your day?')).toBeTruthy();
    });
  });
});
