/**
 * Integration tests for timing chips on high-confidence todo classification
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { CortexResponse } from '../../../lib/cortex/cortexDecide';

// Mock dependencies before imports
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => ({ repo: mockRepo }),
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user-123' } }),
}));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ setOptions: jest.fn() }),
  };
});

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const mockDecideWithContext = jest.fn();
jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

const mockShowToast = jest.fn();
jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowToast,
  }),
}));

jest.mock('../../../lib/conversion', () => ({
  ...jest.requireActual('../../../lib/conversion'),
  convertLogListToTodo: jest.fn(),
}));

import CatchAllNotepad from '../CatchAllNotepad';

describe('Timing Chips Integration', () => {
  let createdRecords: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    createdRecords = [];

    mockRepo.create.mockImplementation((input) => {
      const record = {
        id: `record-${Date.now()}-${Math.random()}`,
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      createdRecords.push(record);
      return Promise.resolve(record);
    });

    mockRepo.update.mockImplementation(({ id, patch }) => {
      const record = createdRecords.find((r: any) => r.id === id);
      if (!record) {
        throw new Error(`Record ${id} not found`);
      }
      Object.assign(record, patch);
      return Promise.resolve(record);
    });

    mockRepo.getById.mockImplementation((id) => {
      const record = createdRecords.find((r: any) => r.id === id);
      if (!record) {
        return Promise.reject(new Error(`Record ${id} not found`));
      }
      return Promise.resolve(record);
    });

    mockRepo.remove.mockResolvedValue(undefined);
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows timing chips for high-confidence todo (≥0.8) without urgent markers', async () => {
    // Set to Friday morning to get specific timing options
    jest.setSystemTime(new Date('2025-11-07T10:00:00'));

    const highConfidenceResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.85,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Buy groceries' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(highConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Type high-confidence todo text
    fireEvent.changeText(input, 'Buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(createdRecords.length).toBeGreaterThan(0);
      expect(createdRecords[0].type).toBe('todo');
    });

    // Should show timing chips prompt
    await waitFor(() => {
      expect(getByText('When do you want to do this?')).toBeTruthy();
    });

    // Should show context-appropriate options (Friday morning = Today/Tomorrow/Someday)
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('Tomorrow')).toBeTruthy();
    expect(getByText('Someday')).toBeTruthy();
  });

  it('does not show timing chips when text contains urgent markers', async () => {
    jest.setSystemTime(new Date('2025-11-07T10:00:00'));

    const urgentTodoResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.9,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Fix urgent bug asap' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(urgentTodoResponse);

    const { getByTestId, queryByText } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Fix urgent bug asap');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(createdRecords.length).toBeGreaterThan(0);
    });

    // Should NOT show timing chips due to urgent marker
    expect(queryByText('When do you want to do this?')).toBeNull();
  });

  it('auto-dismisses timing chips after 5s and assigns "Someday"', async () => {
    jest.setSystemTime(new Date('2025-11-07T10:00:00'));

    const highConfidenceResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.85,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Call dentist' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(highConfidenceResponse);

    const { getByTestId, getByText, queryByText } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Call dentist');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('When do you want to do this?')).toBeTruthy();
    });

    const todoId = createdRecords[0].id;

    // Fast-forward 5 seconds
    jest.advanceTimersByTime(5000);

    await waitFor(() => {
      // Should update todo with null due_date (Someday)
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: todoId,
          patch: expect.objectContaining({
            due_date: null,
            undefined_due: false,
          }),
        }),
      );
    });

    await waitFor(() => {
      // Should show toast
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Added to list'),
        }),
      );
    });

    // Chips should be gone
    await waitFor(() => {
      expect(queryByText('When do you want to do this?')).toBeNull();
    });
  });

  it('does not show timing chips twice for same submission', async () => {
    jest.setSystemTime(new Date('2025-11-07T10:00:00'));

    const highConfidenceResponse: CortexResponse = {
      mode: 'auto',
      confidence: 0.85,
      actions: [
        {
          type: 'create.todo',
          payload: { title: 'Water plants' },
        },
      ],
      suggestions: [],
    };

    mockDecideWithContext.mockResolvedValue(highConfidenceResponse);

    const { getByTestId, getByText, queryByText } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission
    fireEvent.changeText(input, 'Water plants');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('When do you want to do this?')).toBeTruthy();
    });

    // Dismiss chips
    jest.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(queryByText('When do you want to do this?')).toBeNull();
    });

    // Try to submit again (same text)
    fireEvent.press(submitButton);

    // Should NOT show timing chips again (timingAskedRef prevents it)
    await waitFor(() => {
      expect(queryByText('When do you want to do this?')).toBeNull();
    });
  });
});
