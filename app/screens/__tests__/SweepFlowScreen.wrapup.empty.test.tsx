/**
 * SweepFlowScreen Wrap-Up Step Empty State Tests
 *
 * Tests the empty state of the wrap-up step (step 3) when there are no items.
 * New flow: Intro (0) → Decision (1) → Mood (2) → Wrap-up (3) → Summary (4)
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

// Mock useTodayEntries with EMPTY data for empty state testing
jest.mock('../../../lib/today/hooks/useTodayEntries', () => ({
  __esModule: true,
  useTodayEntries: () => ({
    items: [], // No items
    doneItems: [{ id: 'done-1', name: 'Already done task' }], // Some completed items
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
  };
});

import SweepFlowScreen from '../SweepFlowScreen';

/**
 * Helper to navigate to wrap-up step (step 3)
 * Flow: Intro (0) → Decision (1) → Mood (2) → Wrap-up (3)
 */
async function navigateToWrapUpStep(result: ReturnType<typeof render>) {
  // Step 0: Intro - tap "Start Sweeping" to go to Decision
  await waitFor(() => {
    expect(result.getByText('Time to Sweep your day')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Start Sweeping'));

  // Step 1: Decision - empty state, tap "Done" to go to Mood
  await waitFor(() => {
    expect(result.getByText("Nothing to Sweep right now — you're all clear.")).toBeTruthy();
  });
  fireEvent.press(result.getByText('Done'));

  // Step 2: Mood - skip to go to Wrap-up
  await waitFor(() => {
    expect(result.getByText('How did today feel?')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Skip for now'));

  // Step 3: Wrap-up - wait for it to appear
  await waitFor(() => {
    expect(result.getByText('Wrap up today')).toBeTruthy();
  });
}

describe('SweepFlowScreen - Wrap Up Step (Empty State)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state message when there are no items to wrap up', async () => {
    const result = render(<SweepFlowScreen />);

    await navigateToWrapUpStep(result);

    // Should show empty state message
    expect(result.getByText(/Nothing to wrap up/)).toBeTruthy();
    expect(result.getByText(/you're all set/)).toBeTruthy();
  });

  it('shows completed count in empty state when items were completed', async () => {
    const result = render(<SweepFlowScreen />);

    await navigateToWrapUpStep(result);

    // Should show completed count (1 item from doneItems mock)
    expect(result.getByText(/You completed 1 item today/)).toBeTruthy();
  });

  it('still renders Start Sweep button in empty state', async () => {
    const result = render(<SweepFlowScreen />);

    await navigateToWrapUpStep(result);

    // Start Sweep button should still be visible
    expect(result.getByText('Start Sweep')).toBeTruthy();
  });
});
