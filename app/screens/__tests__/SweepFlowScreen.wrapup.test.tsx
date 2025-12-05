/**
 * SweepFlowScreen Wrap-Up Step Tests
 *
 * Tests the wrap-up step (step 3) of the Sweep flow.
 * New flow: Intro (0) → Decision (1) → Mood (2) → Wrap-up (3) → Summary (4)
 * Mocks lib/today hooks to provide fake data, then verifies rendering and onContinue.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock sweep engine (to prevent fetch during wrapup tests)
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

// Mock data for useTodayEntries
const mockHabit = {
  id: 'habit-1',
  type: 'habit' as const,
  name: 'Morning meditation',
  due_day: new Date().toISOString().split('T')[0],
};

const mockTodo = {
  id: 'todo-1',
  type: 'todo' as const,
  name: 'Review pull request',
  due_day: new Date().toISOString().split('T')[0],
};

// Overdue todo (yesterday)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const mockOverdueTodo = {
  id: 'todo-overdue-1',
  type: 'todo' as const,
  name: 'Submit expense report',
  due_day: yesterday.toISOString().split('T')[0],
  overdue: true,
};

const mockReload = jest.fn();

// Mock useTodayEntries with items
jest.mock('../../../lib/today/hooks/useTodayEntries', () => ({
  __esModule: true,
  useTodayEntries: () => ({
    items: [mockHabit, mockTodo, mockOverdueTodo],
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
  };
});

import SweepFlowScreen from '../SweepFlowScreen';

/**
 * Helper to advance to the wrap-up step (step 3)
 * Flow: Intro (0) → Decision (1) → Mood (2) → Wrap-up (3)
 * Since SweepWrapUpStep is not exported, we navigate through the flow
 */
async function renderAtWrapUpStep() {
  const result = render(<SweepFlowScreen />);

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

  return result;
}

describe('SweepFlowScreen - Wrap Up Step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the wrap up step header', async () => {
    const { getByText } = await renderAtWrapUpStep();

    expect(getByText('Wrap up today')).toBeTruthy();
    expect(getByText("Let's close out what you planned for today before we Sweep.")).toBeTruthy();
  });

  it("renders the Today's habits section with items", async () => {
    const { getByText } = await renderAtWrapUpStep();

    expect(getByText("Today's Habits")).toBeTruthy();
    expect(getByText('Morning meditation')).toBeTruthy();
  });

  it("renders the Today's to-dos section with items", async () => {
    const { getByText } = await renderAtWrapUpStep();

    expect(getByText("Today's To-Dos")).toBeTruthy();
    expect(getByText('Review pull request')).toBeTruthy();
  });

  it('renders the Still Waiting section with overdue items', async () => {
    const { getByText } = await renderAtWrapUpStep();

    expect(getByText('Still Waiting')).toBeTruthy();
    expect(getByText('Submit expense report')).toBeTruthy();
  });

  it('renders the Start Sweep button', async () => {
    const { getByText } = await renderAtWrapUpStep();

    expect(getByText('Start Sweep')).toBeTruthy();
  });

  it('renders overdue action buttons (Today, Tomorrow, Clear)', async () => {
    const { getByText, getAllByText } = await renderAtWrapUpStep();

    // These buttons appear for each overdue item
    expect(getAllByText('Today').length).toBeGreaterThan(0);
    expect(getAllByText('Tomorrow').length).toBeGreaterThan(0);
    expect(getAllByText('Clear').length).toBeGreaterThan(0);
  });

  it('advances to summary step when pressing Start Sweep', async () => {
    const { getByText, queryByText } = await renderAtWrapUpStep();

    // Press Start Sweep - should advance to step 4 (Summary)
    fireEvent.press(getByText('Start Sweep'));

    // Should now show summary step content
    await waitFor(() => {
      expect(getByText('Sweep complete')).toBeTruthy();
    });

    // Wrap up step should no longer be visible
    expect(queryByText('Wrap up today')).toBeNull();
  });
});

// Empty state tests are in SweepFlowScreen.wrapup.empty.test.tsx
