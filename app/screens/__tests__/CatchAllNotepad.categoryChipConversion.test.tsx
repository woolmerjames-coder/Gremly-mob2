/**
 * Test suite for category chip conversion ensuring no duplicates
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { CortexResponse } from '../../../lib/cortex/cortexDecide';

// Mock dependencies before imports
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findBySourceMessageId: jest.fn(),
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

describe('CatchAllNotepad - Category Chip Conversion No Duplicates', () => {
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
      // Apply patch to existing record
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

    mockRepo.remove.mockImplementation((id) => {
      const index = createdRecords.findIndex((r) => r.id === id);
      if (index !== -1) {
        createdRecords.splice(index, 1);
      }
      return Promise.resolve(undefined);
    });

    mockRepo.findBySourceMessageId.mockResolvedValue(null);
    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  });

  const { useGlobalOverlay } = require('../../../contexts/OverlayContext');
  const overlayController = useGlobalOverlay();
  const openCreateMock = overlayController.openCreate as jest.Mock;

  it('converts unsorted note to todo when selecting "Add to To-Do List"', async () => {
    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.65,
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add as task',
          payload: { name: 'Buy groceries', undefined_due: true },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Buy groceries for the week');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    // Wait for category chips to appear
    await waitFor(
      () => {
        expect(mockDecideWithContext).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    const decision = await mockDecideWithContext.mock.results[0].value;
    expect(decision).toEqual(expect.objectContaining({ mode: 'ask' }));
    expect(Array.isArray(decision.suggestions) && decision.suggestions.length).toBeGreaterThan(0);
    expect(mockDecideWithContext).toHaveBeenCalledTimes(1);

    await waitFor(
      () => {
        expect(mockRepo.create).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(getByText('Add to To-Do List')).toBeTruthy();
      },
      { timeout: 3000 },
    );

    expect(createdRecords.length).toBe(1);
    const originalId = createdRecords[0].id;
    expect(createdRecords[0].type).toBe('note');
    expect(createdRecords[0].body).toContain('Buy groceries');

    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: originalId,
        patch: expect.objectContaining({
          canonicalType: 'todo',
          ai_placed: true,
          labels: ['catchall'],
          why_string: expect.stringContaining('Confirmed as to-do via category chip'),
        }),
      });
    });

    expect(openCreateMock).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(createdRecords).toHaveLength(1);

    const todoRecord = createdRecords[0];
    expect(todoRecord.type).toBe('note');
    expect(todoRecord.canonicalType).toBe('todo');
    expect(todoRecord.title).toBe('Buy groceries for the week');
    expect(todoRecord.body).toBe('Buy groceries for the week');
    expect(todoRecord.labels).toEqual(['catchall']);
    expect(todoRecord.ai_placed).toBe(true);
    expect(todoRecord.why_string).toContain('Confirmed as to-do via category chip');
  });

  it('preserves full multiline text when converting to todo', async () => {
    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.7,
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add as task',
          payload: { name: 'Long task', undefined_due: true },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Multi-line text with very long first line
    const longText =
      'This is a very long first line that exceeds eighty characters and should be truncated properly when converted to todo\nSecond line should be ignored';
    fireEvent.changeText(input, longText);
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(
      () => {
        expect(mockDecideWithContext).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(mockRepo.create).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(getByText('Add to To-Do List')).toBeTruthy();
      },
      { timeout: 3000 },
    );

    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: expect.any(String),
        patch: expect.objectContaining({
          canonicalType: 'todo',
          title: longText,
          body: longText,
        }),
      });
    });

    expect(openCreateMock).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).not.toHaveBeenCalled();

    const todoRecord = createdRecords[0];
    expect(todoRecord.type).toBe('note');
    expect(todoRecord.canonicalType).toBe('todo');
    expect(todoRecord.body).toBe(longText);
    expect(todoRecord.title).toBe(longText);
  });

  it('drops needs_review label when promoting to todo', async () => {
    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.6,
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add as task',
          payload: { name: 'Task', undefined_due: true },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Call dentist');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(
      () => {
        expect(mockDecideWithContext).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(mockRepo.create).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(getByText('Add to To-Do List')).toBeTruthy();
      },
      { timeout: 3000 },
    );

    createdRecords[0].labels = ['needs_review', 'catchall'];

    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: expect.any(String),
        patch: expect.objectContaining({
          canonicalType: 'todo',
          labels: ['catchall'],
        }),
      });
    });

    const todoRecord = createdRecords[0];
    expect(todoRecord.type).toBe('note');
    expect(todoRecord.labels).toEqual(['catchall']);
    expect(openCreateMock).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.remove).not.toHaveBeenCalled();
  });

  it('confirms log in place without creating duplicate', async () => {
    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.7,
      suggestions: [
        {
          type: 'create.note',
          label: 'Save as note',
          payload: { title: 'Note', body: 'Note text', subtype: 'journal' },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Had a great day today');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    await waitFor(
      () => {
        expect(mockDecideWithContext).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(mockRepo.create).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(getByText('Just Save It')).toBeTruthy();
      },
      { timeout: 3000 },
    );

    expect(createdRecords.length).toBe(1);
    const originalId = createdRecords[0].id;

    createdRecords[0].tags = ['#day', '#great', '#had'];

    fireEvent.press(getByText('Just Save It'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith({
        id: originalId,
        patch: expect.objectContaining({
          ai_placed: true,
          canonicalType: 'log',
          labels: ['catchall'],
          subtype: 'idea',
          tags: ['#day', '#great', '#had'],
          views: { alsoShowIn: ['Hub:Catch-All'] },
          why_string: expect.stringContaining('Confirmed as note via category chip'),
        }),
      });
    });

    expect(createdRecords.length).toBe(1);
    expect(createdRecords[0].id).toBe(originalId);
    expect(createdRecords[0].labels).toEqual(['catchall']);
    expect(createdRecords[0].why_string).toContain('Confirmed as note via category chip');
    expect(createdRecords[0].tags).toEqual(['#day', '#great', '#had']);
    expect(createdRecords[0].canonicalType).toBe('log');
    expect(mockRepo.remove).not.toHaveBeenCalled();
    expect(openCreateMock).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });
});
