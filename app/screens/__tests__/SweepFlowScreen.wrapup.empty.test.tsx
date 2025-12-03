/**
 * SweepFlowScreen Wrap-Up Step Empty State Tests
 *
 * Tests the empty state of the wrap-up step when there are no items.
 * Separate file due to Jest module caching constraints.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock RepoProvider
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: jest.fn(() => Promise.resolve({ id: 'test-note-id' })),
    update: jest.fn(() => Promise.resolve()),
    sweepApplyAction: jest.fn(() => Promise.resolve()),
  }),
}));

// Mock AuthProvider
jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' } }),
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

describe('SweepFlowScreen - Wrap Up Step (Empty State)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state message when there are no items to wrap up', async () => {
    const { getByText } = render(<SweepFlowScreen />);

    // Skip mood step to get to wrap up
    fireEvent.press(getByText('Skip for now'));

    // Wait for wrap up step to render
    await waitFor(() => {
      expect(getByText('Wrap up today')).toBeTruthy();
    });

    // Should show empty state message
    expect(getByText(/Nothing to wrap up/)).toBeTruthy();
    expect(getByText(/you're all set/)).toBeTruthy();
  });

  it('shows completed count in empty state when items were completed', async () => {
    const { getByText } = render(<SweepFlowScreen />);

    // Skip mood step to get to wrap up
    fireEvent.press(getByText('Skip for now'));

    // Wait for wrap up step to render
    await waitFor(() => {
      expect(getByText('Wrap up today')).toBeTruthy();
    });

    // Should show completed count (1 item from doneItems mock)
    expect(getByText(/You completed 1 item today/)).toBeTruthy();
  });

  it('still renders Start Sweep button in empty state', async () => {
    const { getByText } = render(<SweepFlowScreen />);

    // Skip mood step to get to wrap up
    fireEvent.press(getByText('Skip for now'));

    // Wait for wrap up step to render
    await waitFor(() => {
      expect(getByText('Wrap up today')).toBeTruthy();
    });

    // Start Sweep button should still be visible
    expect(getByText('Start Sweep')).toBeTruthy();
  });
});
