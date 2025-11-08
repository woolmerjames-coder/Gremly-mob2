/**
 * Test suite for low-confidence classification category chips
 * Verifies that category chip selection updates existing record instead of creating duplicates
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { CortexResponse } from '../../../lib/cortex/cortexDecide';

type ButtonNode = { props: { accessibilityState?: { disabled?: boolean } } };

// Mock dependencies before imports
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
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
  useCortex: () => ({
    decideWithContext: mockDecideWithContext,
  }),
}));

const mockShowActionToast = jest.fn();
jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    close: jest.fn(),
  }),
}));

import CatchAllNotepad from '../CatchAllNotepad';

describe('CatchAllNotepad - Category Chips', () => {
  let createdRecords: any[];

  beforeEach(() => {
    jest.clearAllMocks();
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
      const record = createdRecords.find((r) => r.id === id);
      if (!record) {
        throw new Error(`Record ${id} not found`);
      }
      Object.assign(record, patch);
      return Promise.resolve(record);
    });

    mockRepo.getById.mockImplementation((id) => {
      const record = createdRecords.find((r) => r.id === id);
      if (!record) {
        return Promise.reject(new Error(`Record ${id} not found`));
      }
      return Promise.resolve(record);
    });

    mockRepo.remove.mockResolvedValue(undefined);
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  });

  const waitForSubmitEnabled = async (button: ButtonNode) => {
    await waitFor(() => {
      expect(button.props.accessibilityState?.disabled).not.toBe(true);
    });
  };

  it('shows category chips when confidence < 0.8', async () => {
    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.65,
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add as task',
          payload: { name: 'Low confidence item', undefined_due: true },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Maybe do this thing');

    await waitForSubmitEnabled(submitButton);

    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('Add to To-Do List')).toBeTruthy();
      expect(getByText('Just Save It')).toBeTruthy();
    });

    // Verify only one record created (the unsorted note)
    expect(createdRecords.length).toBe(1);
    expect(createdRecords[0].type).toBe('note');
  });

  it('converts to todo without creating duplicate when "Add to To-Do List" is selected', async () => {
    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.7,
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add as task',
          payload: { name: 'Low confidence item', undefined_due: true },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Maybe schedule meeting');

    await waitForSubmitEnabled(submitButton);

    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('Add to To-Do List')).toBeTruthy();
    });

    const todoChip = getByText('Add to To-Do List');
    fireEvent.press(todoChip);

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: createdRecords[0].id,
          patch: expect.objectContaining({
            type: 'todo',
            ai_placed: true,
          }),
        }),
      );
    });

    expect(createdRecords.length).toBe(1);
    expect(createdRecords[0].type).toBe('todo');
    expect(createdRecords[0].ai_placed).toBe(true);
  });

  it('confirms as log without creating duplicate when "Just Save It" is selected', async () => {
    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.6,
      suggestions: [
        {
          type: 'create.note',
          label: 'Save as note',
          payload: { title: 'Low confidence item', body: '', subtype: 'idea' },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Random thought about something');

    await waitForSubmitEnabled(submitButton);

    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('Just Save It')).toBeTruthy();
    });

    const logChip = getByText('Just Save It');
    fireEvent.press(logChip);

    await waitFor(() => {
      // Should have created only the unsorted note and updated it
      expect(createdRecords.length).toBe(1);
      expect(createdRecords[0].type).toBe('note');
      expect(createdRecords[0].archived).toBe(false);
      expect(createdRecords[0].why_string).toContain('Confirmed as log via category chip');

      // Verify no duplicate
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });
  });

  it('does not show category chips when confidence >= 0.8', async () => {
    const highConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.85,
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add as task',
          payload: { name: 'High confidence item', undefined_due: true },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(highConfidenceResponse);

    const { getByTestId, queryByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Buy milk tomorrow');

    await waitForSubmitEnabled(submitButton);

    fireEvent.press(submitButton);

    await waitFor(() => {
      // Should show regular suggestion chips, not category chips
      expect(queryByText('Add to To-Do List')).toBeNull();
      expect(queryByText('Just Save It')).toBeNull();
    });
  });
});
