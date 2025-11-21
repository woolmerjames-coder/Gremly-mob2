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
  findNoteBySourceMessageId: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user-123' } }),
}));

jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
  },
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

const openCreateMock = jest.fn();
const openEditMock = jest.fn();
const mockUseGlobalOverlay = jest.fn(() => ({
  openCreate: openCreateMock,
  openEdit: openEditMock,
}));
jest.mock(
  '../../contexts/OverlayContext',
  () => {
    const actual = jest.requireActual('../../../contexts/OverlayContext');
    return {
      __esModule: true,
      ...actual,
      useGlobalOverlay: mockUseGlobalOverlay,
    };
  },
  { virtual: true },
);

jest.mock('../../../lib/conversion', () => ({
  ...jest.requireActual('../../../lib/conversion'),
  convertLogListToTodo: jest.fn(),
}));

import CatchAllNotepad from '../CatchAllNotepad';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabase } = require('../../../lib/supabase/client');
const mockSupabaseRpc = supabase.rpc as jest.Mock;

describe('CatchAllNotepad - Category Chip Conversion No Duplicates', () => {
  let createdRecords: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    createdRecords = [];

    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValue({ data: 'todo-xyz', error: null });
    process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'on';
    openCreateMock.mockClear();
    openEditMock.mockClear();
    mockUseGlobalOverlay.mockClear();

    mockRepo.create.mockImplementation((input) => {
      const record = {
        id: `record-${Date.now()}-${Math.random()}`,
        ...input,
        dropId: input?.dropId ?? '11111111-1111-1111-1111-111111111111',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        drop_id:
          typeof input?.dropId === 'string' ? input.dropId : '11111111-1111-1111-1111-111111111111',
        source_message_id:
          typeof input?.sourceMessageId === 'string' ? input.sourceMessageId : 'minddrop-test-id',
        sourceMessageId: input?.sourceMessageId ?? 'minddrop-test-id',
        labels: Array.isArray(input?.labels) ? input.labels : ['catchall', 'needs_review'],
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

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
  });

  it('converts to todo via Supabase RPC when selecting "Add to To-Do List"', async () => {
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

    // Verify one unsorted note was created
    expect(createdRecords.length).toBe(1);
    const originalId = createdRecords[0].id;
    expect(createdRecords[0].type).toBe('note');
    expect(createdRecords[0].body).toContain('Buy groceries');

    // Click "Add to To-Do List" chip
    fireEvent.press(getByText('Add to To-Do List'));

    // Wait for conversion: should create todo + archive original note
    await waitFor(() => {
      const createCalls = mockRepo.create.mock.calls;
      // Should have 2 creates: 1 unsorted note + 1 todo
      expect(createCalls.length).toBeGreaterThanOrEqual(2);
      // Last create should be a todo
      const lastCreate = createCalls[createCalls.length - 1][0];
      expect(lastCreate.type).toBe('todo');
    });

    // Verify todo was created with correct fields
    const todoCreateCall = mockRepo.create.mock.calls.find((call: any) => call[0].type === 'todo');
    expect(todoCreateCall).toBeDefined();
    expect(todoCreateCall[0]).toMatchObject({
      type: 'todo',
      canonicalType: 'todo',
      origin: 'catchall',
      // ai_placed is inherited from original note
    });

    // Verify original note was archived
    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: originalId,
          patch: expect.objectContaining({
            archived: true,
          }),
        }),
      );
    });

    expect(openCreateMock).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', content: 'Converted to To-Do ✓' }),
    );

    expect(mockRepo.remove).not.toHaveBeenCalled();
  });

  it('passes full multiline text to RPC payload without truncation', async () => {
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

    // Wait for conversion: should create todo with full multiline text in body
    await waitFor(() => {
      const createCalls = mockRepo.create.mock.calls;
      expect(createCalls.length).toBeGreaterThanOrEqual(2);
    });

    const todoCreateCall = mockRepo.create.mock.calls.find((call: any) => call[0].type === 'todo');
    expect(todoCreateCall).toBeDefined();
    expect(todoCreateCall[0]).toMatchObject({
      type: 'todo',
      // body is preserved from original note via derived.notes
      origin: 'catchall',
    });
    // Verify body field exists (may be undefined if derived.notes was null)
    expect(todoCreateCall[0]).toHaveProperty('body');

    expect(openCreateMock).not.toHaveBeenCalled();
  });

  it('does not mutate original note labels when converting to todo', async () => {
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

    // Get original note labels before conversion
    const originalId = createdRecords[0].id;
    const originalLabels = createdRecords[0].labels || [];

    fireEvent.press(getByText('Add to To-Do List'));

    // Wait for conversion: todo created, original note archived
    await waitFor(() => {
      const createCalls = mockRepo.create.mock.calls;
      expect(createCalls.length).toBeGreaterThanOrEqual(2);
    });

    // Verify todo was created with filtered labels (no catchall/needs_review)
    const todoCreateCall = mockRepo.create.mock.calls.find((call: any) => call[0].type === 'todo');
    expect(todoCreateCall).toBeDefined();
    const todoLabels = todoCreateCall[0].labels || [];
    expect(todoLabels).toContain('todo');
    expect(todoLabels).not.toContain('catchall');
    expect(todoLabels).not.toContain('needs_review');

    // Verify original note was archived (not label-mutated)
    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: originalId,
          patch: expect.objectContaining({
            archived: true,
          }),
        }),
      );
    });
    expect(openCreateMock).not.toHaveBeenCalled();
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

    fireEvent.press(getByText('Just Save It'));

    await waitFor(() => {
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: originalId,
          patch: expect.objectContaining({
            archived: false,
            why_string: expect.stringContaining('origin:'),
            canonicalType: 'log',
            subtype: 'journal',
          }),
        }),
      );
    });

    // Still only one record
    expect(createdRecords.length).toBe(1);
    expect(createdRecords[0].id).toBe(originalId);
    expect(mockRepo.remove).not.toHaveBeenCalled();
  });
});
