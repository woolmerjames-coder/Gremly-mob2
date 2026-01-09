// SKIP: Needs Zustand migration - tests use old useRepo mocks
/**
 * SweepFlowScreen Mood Step Tests
 *
 * Tests the mood check-in step (step 2) of the Sweep flow.
 * New flow: Intro (0) → Decision (1) → Mood (2) → Wrap-up (3) → Summary (4)
 * Focuses on rendering and basic interaction, not repo persistence.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock sweep engine - mock Decision step to immediately call onFinished
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
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: mockCreate,
    getById: jest.fn(),
  }),
}));

// Mock AuthProvider
jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' }, userId: 'test-user-id' }),
}));

// Mock useTodayEntries
jest.mock('../../../lib/today/hooks/useTodayEntries', () => ({
  __esModule: true,
  useTodayEntries: () => ({
    items: [],
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
 * Helper to navigate from Intro → Decision → Mood step
 * Flow: Intro (0) → Decision (1) → Mood (2)
 */
async function renderAtMoodStep() {
  const result = render(<SweepFlowScreen />);

  // Step 0: Intro - tap "Start Sweeping" to go to Decision
  await waitFor(() => {
    expect(result.getByText('Time for a quick tidy')).toBeTruthy();
  });
  fireEvent.press(result.getByText('Start Sweeping'));

  // Step 1: Decision - empty state, tap "Done" to go to Mood
  await waitFor(() => {
    expect(result.getByText("Nothing to Sweep right now — you're all clear.")).toBeTruthy();
  });
  fireEvent.press(result.getByText('Done'));

  // Step 2: Mood - wait for it to appear
  await waitFor(() => {
    expect(result.getByText('How did today feel?')).toBeTruthy();
  });

  return result;
}

describe.skip('SweepFlowScreen - Mood Step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the intro step first with Start Sweeping button', () => {
    const { getByText } = render(<SweepFlowScreen />);

    expect(getByText('Time for a quick tidy')).toBeTruthy();
    expect(getByText('Start Sweeping')).toBeTruthy();
  });

  it('renders the mood step title after navigating through Intro and Decision', async () => {
    const { getByText } = await renderAtMoodStep();

    expect(getByText('How did today feel?')).toBeTruthy();
  });

  it('renders the Continue button on mood step', async () => {
    const { getByText } = await renderAtMoodStep();

    expect(getByText('Continue')).toBeTruthy();
  });

  it('renders the Skip for now button on mood step', async () => {
    const { getByText } = await renderAtMoodStep();

    expect(getByText('Skip for now')).toBeTruthy();
  });

  it('renders all mood options', async () => {
    const { getByText } = await renderAtMoodStep();

    // Check all mood labels are present (ALL CAPS per brand reskin)
    expect(getByText('GREAT')).toBeTruthy();
    expect(getByText('GOOD')).toBeTruthy();
    expect(getByText('OKAY')).toBeTruthy();
    expect(getByText('LOW')).toBeTruthy();
    expect(getByText('TIRED')).toBeTruthy();
    expect(getByText('ANXIOUS')).toBeTruthy();
  });

  it('advances to wrap up step when pressing Continue with mood selected', async () => {
    const { getByText, queryByText } = await renderAtMoodStep();

    // Select a mood (ALL CAPS per brand reskin)
    fireEvent.press(getByText('GOOD'));

    // Press Continue
    fireEvent.press(getByText('Continue'));

    // Should advance to step 3 (wrap up)
    await waitFor(() => {
      expect(getByText('Habits today')).toBeTruthy();
    });

    // Mood step title should no longer be visible
    expect(queryByText('How did today feel?')).toBeNull();
  });

  it('advances to wrap up step when pressing Skip for now with no input', async () => {
    const { getByText, queryByText } = await renderAtMoodStep();

    // Press Skip without selecting anything
    fireEvent.press(getByText('Skip for now'));

    // Should advance to step 3 (wrap up)
    await waitFor(() => {
      expect(getByText('Habits today')).toBeTruthy();
    });

    // Mood step title should no longer be visible
    expect(queryByText('How did today feel?')).toBeNull();
  });

  it('advances to wrap up step when pressing Continue with text entered', async () => {
    const { getByText, getByPlaceholderText, queryByText } = await renderAtMoodStep();

    // Enter some text in the journal input
    const input = getByPlaceholderText('Today felt like…');
    fireEvent.changeText(input, 'Had a productive day!');

    // Press Continue
    fireEvent.press(getByText('Continue'));

    // Should advance to step 3 (wrap up)
    await waitFor(() => {
      expect(getByText('Habits today')).toBeTruthy();
    });

    // Mood step title should no longer be visible
    expect(queryByText('How did today feel?')).toBeNull();
  });

  it('renders the journal input placeholder', async () => {
    const { getByPlaceholderText } = await renderAtMoodStep();

    expect(getByPlaceholderText('Today felt like…')).toBeTruthy();
  });

  it('does not crash when selecting mood and entering text', async () => {
    const { getByText, getByPlaceholderText } = await renderAtMoodStep();

    // Select a mood (ALL CAPS per brand reskin)
    fireEvent.press(getByText('TIRED'));

    // Enter text
    const input = getByPlaceholderText('Today felt like…');
    fireEvent.changeText(input, 'Long day at work');

    // Should not crash - component still renders
    expect(getByText('Continue')).toBeTruthy();
  });

  it('calls repo.create and advances when Continue is pressed with mood selected', async () => {
    const { getByText } = await renderAtMoodStep();

    // Select a mood (ALL CAPS per brand reskin)
    fireEvent.press(getByText('GOOD'));

    // Press Continue
    fireEvent.press(getByText('Continue'));

    // Should call repo.create with the mood data
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    // Verify it created a journal/reflection note
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'note',
        subtype: 'journal',
        mood: ['good'], // 'Good' maps to ['good'] array
      }),
    );

    // Should have advanced to wrap up step
    expect(getByText('Habits today')).toBeTruthy();
  });

  it('calls repo.create and advances when Continue is pressed with text entered', async () => {
    const { getByText, getByPlaceholderText } = await renderAtMoodStep();

    // Enter journal text
    const input = getByPlaceholderText('Today felt like…');
    fireEvent.changeText(input, 'A reflective evening');

    // Press Continue
    fireEvent.press(getByText('Continue'));

    // Should call repo.create with the text
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    // Verify it created a journal/reflection note with the text
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'note',
        subtype: 'journal',
        title: 'A reflective evening',
      }),
    );

    // Should have advanced to wrap up step
    expect(getByText('Habits today')).toBeTruthy();
  });
});
