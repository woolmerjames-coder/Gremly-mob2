/**
 * SweepFlowScreen Mood Step Tests
 *
 * Tests the mood check-in step (step 0) of the Sweep flow.
 * Focuses on rendering and basic interaction, not repo persistence.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock RepoProvider
const mockCreate = jest.fn(() => Promise.resolve({ id: 'test-note-id' }));
jest.mock('../../../providers/RepoProvider', () => ({
  __esModule: true,
  useRepo: () => ({
    create: mockCreate,
  }),
}));

// Mock AuthProvider
jest.mock('../../../providers/AuthProvider', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

// Mock useTodayEntries (used by WrapUpStep, but we stay on step 0)
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

describe('SweepFlowScreen - Mood Step', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the mood step title', () => {
    const { getByText } = render(<SweepFlowScreen />);

    expect(getByText('How are you feeling?')).toBeTruthy();
  });

  it('renders the Continue button', () => {
    const { getByText } = render(<SweepFlowScreen />);

    expect(getByText('Continue')).toBeTruthy();
  });

  it('renders the Skip for now button', () => {
    const { getByText } = render(<SweepFlowScreen />);

    expect(getByText('Skip for now')).toBeTruthy();
  });

  it('renders all mood options', () => {
    const { getByText } = render(<SweepFlowScreen />);

    // Check all mood labels are present
    expect(getByText('Great')).toBeTruthy();
    expect(getByText('Good')).toBeTruthy();
    expect(getByText('Okay')).toBeTruthy();
    expect(getByText('Low')).toBeTruthy();
    expect(getByText('Tired')).toBeTruthy();
    expect(getByText('Rough')).toBeTruthy();
  });

  it('advances to wrap up step when pressing Continue with mood selected', async () => {
    const { getByText, queryByText } = render(<SweepFlowScreen />);

    // Select a mood
    fireEvent.press(getByText('Good'));

    // Press Continue
    fireEvent.press(getByText('Continue'));

    // Should advance to step 1 (wrap up)
    await waitFor(() => {
      expect(getByText('Wrap up today')).toBeTruthy();
    });

    // Mood step title should no longer be visible
    expect(queryByText('How are you feeling?')).toBeNull();
  });

  it('advances to wrap up step when pressing Skip for now with no input', async () => {
    const { getByText, queryByText } = render(<SweepFlowScreen />);

    // Press Skip without selecting anything
    fireEvent.press(getByText('Skip for now'));

    // Should advance to step 1 (wrap up)
    await waitFor(() => {
      expect(getByText('Wrap up today')).toBeTruthy();
    });

    // Mood step title should no longer be visible
    expect(queryByText('How are you feeling?')).toBeNull();
  });

  it('advances to wrap up step when pressing Continue with text entered', async () => {
    const { getByText, getByPlaceholderText, queryByText } = render(<SweepFlowScreen />);

    // Enter some text in the journal input
    const input = getByPlaceholderText('Today felt like…');
    fireEvent.changeText(input, 'Had a productive day!');

    // Press Continue
    fireEvent.press(getByText('Continue'));

    // Should advance to step 1 (wrap up)
    await waitFor(() => {
      expect(getByText('Wrap up today')).toBeTruthy();
    });

    // Mood step title should no longer be visible
    expect(queryByText('How are you feeling?')).toBeNull();
  });

  it('renders the journal input placeholder', () => {
    const { getByPlaceholderText } = render(<SweepFlowScreen />);

    expect(getByPlaceholderText('Today felt like…')).toBeTruthy();
  });

  it('does not crash when selecting mood and entering text', () => {
    const { getByText, getByPlaceholderText } = render(<SweepFlowScreen />);

    // Select a mood
    fireEvent.press(getByText('Tired'));

    // Enter text
    const input = getByPlaceholderText('Today felt like…');
    fireEvent.changeText(input, 'Long day at work');

    // Should not crash - component still renders
    expect(getByText('Continue')).toBeTruthy();
  });

  it('calls repo.create and advances when Continue is pressed with mood selected', async () => {
    const { getByText } = render(<SweepFlowScreen />);

    // Select a mood
    fireEvent.press(getByText('Good'));

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
        mood: 'happy', // 'Good' maps to 'happy'
      }),
    );

    // Should have advanced to wrap up step
    expect(getByText('Wrap up today')).toBeTruthy();
  });

  it('calls repo.create and advances when Continue is pressed with text entered', async () => {
    const { getByText, getByPlaceholderText } = render(<SweepFlowScreen />);

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
    expect(getByText('Wrap up today')).toBeTruthy();
  });
});
