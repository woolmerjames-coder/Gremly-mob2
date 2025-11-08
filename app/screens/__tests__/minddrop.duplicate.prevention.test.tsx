/**
 * Mind Drop Duplicate Prevention Test
 *
 * Verifies that submitting the same text multiple times in quick succession
 * doesn't create duplicate unsorted notes.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CatchAllNotepad from '../CatchAllNotepad';

// Mock providers
jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({
    getById: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    getAll: jest.fn(() => Promise.resolve([])),
  }),
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    userId: 'test-user',
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  useRoute: () => ({
    params: {},
  }),
}));

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({
    decide: jest.fn(async () => ({
      mode: 'ask',
      confidence: 0.7,
      suggestions: [{ type: 'todo', label: 'Add to To-Do List' }],
      actions: [],
    })),
  }),
}));

// Mock saveToUnsortedTray
let saveToUnsortedTrayCalls: Array<{ text: string }> = [];
jest.mock('../../lib/unsorted/saveToUnsortedTray', () => ({
  saveToUnsortedTray: jest.fn(async (_repo: any, text: string) => {
    saveToUnsortedTrayCalls.push({ text });
    return `unsorted-${saveToUnsortedTrayCalls.length}`;
  }),
}));

describe('Mind Drop - Duplicate Prevention', () => {
  beforeEach(() => {
    saveToUnsortedTrayCalls = [];
    jest.clearAllMocks();
  });

  it('prevents duplicate unsorted notes when same text submitted twice quickly', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit');

    // First submission
    fireEvent.changeText(input, 'buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(saveToUnsortedTrayCalls.length).toBe(1);
      expect(saveToUnsortedTrayCalls[0].text).toBe('buy groceries');
    });

    // Second submission of same text (after state reset)
    // Should NOT create a new unsorted note
    fireEvent.changeText(input, 'buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => {
      // Still only 1 call to saveToUnsortedTray
      expect(saveToUnsortedTrayCalls.length).toBe(1);
    });
  });

  it('allows new unsorted note when text is different', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit');

    // First submission
    fireEvent.changeText(input, 'buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(saveToUnsortedTrayCalls.length).toBe(1);
    });

    // Second submission with DIFFERENT text
    fireEvent.changeText(input, 'call mom');
    fireEvent.press(submitButton);

    await waitFor(() => {
      // Should create a second unsorted note
      expect(saveToUnsortedTrayCalls.length).toBe(2);
      expect(saveToUnsortedTrayCalls[1].text).toBe('call mom');
    });
  });

  it('shows category chips for duplicate submission without creating new record', async () => {
    const { getByTestId, queryByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit');

    // First submission
    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(saveToUnsortedTrayCalls.length).toBe(1);
    });

    // Wait for category chips to appear
    await waitFor(() => {
      expect(queryByText('Add to To-Do List')).toBeTruthy();
    });

    // Second submission of same text
    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => {
      // Still only 1 unsorted note created
      expect(saveToUnsortedTrayCalls.length).toBe(1);
      // But category chips should still be visible
      expect(queryByText('Add to To-Do List')).toBeTruthy();
    });
  });

  it('clears duplicate tracking after category chip action', async () => {
    const mockUpdate = jest.fn();
    const { useRepo } = require('../../../providers/RepoProvider');
    useRepo.mockReturnValue({
      getById: jest.fn(async () => ({ id: 'unsorted-1', body: 'exercise daily' })),
      update: mockUpdate,
      create: jest.fn(),
      delete: jest.fn(),
      getAll: jest.fn(() => Promise.resolve([])),
    });

    const { getByTestId, queryByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit');

    // First submission
    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(saveToUnsortedTrayCalls.length).toBe(1);
    });

    // Click category chip (e.g., "Add to To-Do List")
    const todoChip = queryByTestId('minddrop-category-todo');
    if (todoChip) {
      fireEvent.press(todoChip);
    }

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });

    // Now submit same text again - should create NEW unsorted note
    // because tracking was cleared after category action
    fireEvent.changeText(input, 'exercise daily');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(saveToUnsortedTrayCalls.length).toBe(2);
    });
  });
});
