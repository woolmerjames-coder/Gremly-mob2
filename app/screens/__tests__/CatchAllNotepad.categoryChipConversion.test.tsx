/**
 * Test suite for category chip conversion ensuring no duplicates
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

    mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  });

  it('converts note to todo without creating duplicate using repo.update', async () => {
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
    fireEvent.press(submitButton);

    // Wait for category chips to appear
    await waitFor(() => {
      expect(getByText('Add to To-Do List')).toBeTruthy();
    });

    // Verify one unsorted note was created
    expect(createdRecords.length).toBe(1);
    const originalId = createdRecords[0].id;
    expect(createdRecords[0].type).toBe('note');
    expect(createdRecords[0].body).toContain('Buy groceries');

    // Click "Add to To-Do List" chip
    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      // repo.update should have been called
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: originalId,
          patch: expect.objectContaining({
            type: 'todo',
            name: expect.any(String),
          }),
        }),
      );
    });

    // Verify still only ONE record exists (no duplicate)
    expect(createdRecords.length).toBe(1);

    // Verify the record was updated in place
    expect(createdRecords[0].id).toBe(originalId);
    expect(createdRecords[0].type).toBe('todo');
    expect(createdRecords[0].name).toBe('Buy groceries for the week');

    // Verify repo.remove was NOT called (no deletion)
    expect(mockRepo.remove).not.toHaveBeenCalled();
  });

  it('extracts first line and truncates to 80 chars for todo name', async () => {
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
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('Add to To-Do List')).toBeTruthy();
    });

    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalled();
    });

    // Verify name is first line truncated to 80 chars
    const updatedRecord = createdRecords[0];
    expect(updatedRecord.name.length).toBeLessThanOrEqual(80);
    expect(updatedRecord.name).toBe(longText.split('\n')[0].substring(0, 80));
    expect(updatedRecord.name).not.toContain('Second line');
  });

  it('removes needs_review label when converting to todo', async () => {
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
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('Add to To-Do List')).toBeTruthy();
    });

    // Manually add needs_review label to simulate initial state
    createdRecords[0].labels = ['needs_review', 'catchall'];

    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          patch: expect.objectContaining({
            labels: expect.not.arrayContaining(['needs_review']),
          }),
        }),
      );
    });

    // Verify labels were filtered
    const updatedRecord = createdRecords[0];
    expect(updatedRecord.labels).not.toContain('needs_review');
  });

  it('confirms log without creating duplicate', async () => {
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
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('Just Save It')).toBeTruthy();
    });

    expect(createdRecords.length).toBe(1);
    const originalId = createdRecords[0].id;

    fireEvent.press(getByText('Just Save It'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: originalId,
          patch: expect.objectContaining({
            archived: false,
            why_string: 'Confirmed as log via category chip',
          }),
        }),
      );
    });

    // Still only one record
    expect(createdRecords.length).toBe(1);
    expect(createdRecords[0].id).toBe(originalId);
    expect(mockRepo.remove).not.toHaveBeenCalled();
  });

  it('uses fallback if repo.update fails', async () => {
    const { convertLogListToTodo } = require('../../../lib/conversion');
    convertLogListToTodo.mockResolvedValue({
      todo: { id: 'new-todo-123', name: 'Test', type: 'todo' },
    });

    const lowConfidenceResponse: CortexResponse = {
      mode: 'ask',
      confidence: 0.65,
      suggestions: [
        {
          type: 'create.todo',
          label: 'Add as task',
          payload: { name: 'Test', undefined_due: true },
        },
      ],
      actions: [],
    };

    mockDecideWithContext.mockResolvedValue(lowConfidenceResponse);

    // Make repo.update fail
    mockRepo.update.mockRejectedValueOnce(new Error('Update failed'));

    const { getByTestId, getByText } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'Test task');
    fireEvent.press(submitButton);

    await waitFor(() => {
      expect(getByText('Add to To-Do List')).toBeTruthy();
    });

    const originalId = createdRecords[0].id;

    fireEvent.press(getByText('Add to To-Do List'));

    await waitFor(() => {
      // Should fall back to convertLogListToTodo
      expect(convertLogListToTodo).toHaveBeenCalledWith(
        expect.anything(),
        originalId,
        expect.objectContaining({ preserveState: true }),
      );
    });
  });
});
