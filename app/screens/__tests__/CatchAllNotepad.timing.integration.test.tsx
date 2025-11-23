/**
 * Integration tests for timing chips on high-confidence todo classification
 *
 * Note: These tests force V2 (blocking) mode to verify synchronous pipeline behavior.
 * For V3 (instant) mode tests, see minddrop.v2v3.modes.test.tsx
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import type { CortexResponse } from '../../../lib/cortex/cortexDecide';

// Force V2 mode (blocking pipeline) for these tests
process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';

// Mock dependencies before imports
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  getById: jest.fn(),
  remove: jest.fn(),
  findNoteBySourceMessageId: jest.fn(),
  findTodoByDropId: jest.fn(),
  findHabitByDropId: jest.fn(),
  getAll: jest.fn(),
  query: jest.fn(),
  notes: {
    list: jest.fn(() => Promise.resolve([])),
  },
  todos: {
    list: jest.fn(() => Promise.resolve([])),
  },
  habits: {
    list: jest.fn(() => Promise.resolve([])),
  },
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

const mockConvertUnsortedToTodo = jest.fn();
const mockConvertUnsortedToHabit = jest.fn();
const mockConvertUnsortedToLog = jest.fn();

jest.mock('../../../lib/conversion', () => {
  const actual = jest.requireActual('../../../lib/conversion');
  return {
    ...actual,
    convertUnsortedToTodo: (...args: any[]) => mockConvertUnsortedToTodo(...args),
    convertUnsortedToHabit: (...args: any[]) => mockConvertUnsortedToHabit(...args),
    convertUnsortedToLog: (...args: any[]) => mockConvertUnsortedToLog(...args),
    convertLogListToTodo: jest.fn(),
  };
});

import CatchAllNotepad from '../CatchAllNotepad';

// Advance fake timers and flush pending microtasks so UI effects can settle.
const advanceTimers = async (ms = 50) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
};

// Poll by advancing timers until assertion passes or attempts are exhausted.
const eventually = async (assertion: () => void, attempts = 20) => {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await advanceTimers();
    }
  }

  throw lastError ?? new Error('eventually assertion failed');
};

describe('Timing Chips Integration', () => {
  let createdRecords: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    createdRecords = [];

    // Setup conversion helper - auto mode creates note first, then converts to todo
    mockConvertUnsortedToTodo.mockImplementation(async (repo, noteId, options) => {
      const note = await repo.getById(noteId);
      const todoId = `todo-${noteId.replace('record-', '')}`;
      const createdTodo = {
        id: todoId,
        type: 'todo',
        name: note?.body || note?.title || 'Untitled',
        body: note?.body || note?.title,
        due_date: options?.due || null,
        undefined_due: !options?.due,
        labels: ['todo'],
        tags: note?.tags || [],
      };

      // Simulate the conversion: create todo and archive note
      const savedTodo = await repo.create(createdTodo);
      await repo.update({ id: noteId, patch: { labels: ['archived'] } });

      return { todo: savedTodo, updatedNote: { ...note, labels: ['archived'] } };
    });

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

    // Mock findTodoByDropId and findHabitByDropId for pipeline idempotency checks
    mockRepo.findTodoByDropId = jest.fn().mockImplementation((dropId: string) => {
      const todo = createdRecords.find((r: any) => r.type === 'todo' && r.drop_id === dropId);
      return Promise.resolve(todo || null);
    });

    mockRepo.findHabitByDropId = jest.fn().mockImplementation((dropId: string) => {
      const habit = createdRecords.find((r: any) => r.type === 'habit' && r.drop_id === dropId);
      return Promise.resolve(habit || null);
    });
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

    const { getByTestId, getByText, getAllByText } = render(<CatchAllNotepad />);
    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Type high-confidence todo text and wait for submit to enable
    fireEvent.changeText(input, 'Buy groceries');

    await eventually(() => {
      expect(submitButton.props.accessibilityState?.disabled).not.toBe(true);
    });

    fireEvent.press(submitButton);

    await eventually(() => {
      expect(mockDecideWithContext).toHaveBeenCalled();
    });

    // Wait for provisional note creation (Phase 4A behavior)
    await eventually(() => {
      expect(mockRepo.create).toHaveBeenCalled();
      expect(createdRecords.length).toBeGreaterThan(0);
    });

    // Wait for auto-conversion to todo
    await eventually(() => {
      expect(mockConvertUnsortedToTodo).toHaveBeenCalled();
    });

    // After conversion, should have both note and todo
    await eventually(() => {
      const todos = createdRecords.filter((r: any) => r.type === 'todo');
      expect(todos.length).toBeGreaterThan(0);
    });

    // Should show timing chips prompt
    await eventually(() => {
      expect(getByText('When do you want to do this?')).toBeTruthy();
    });

    // Should show context-appropriate options (Friday morning = Today/Tomorrow/Someday)
    expect(getAllByText('Today').length).toBeGreaterThan(0);
    expect(getAllByText('Tomorrow').length).toBeGreaterThan(0);
    expect(getAllByText('Someday').length).toBeGreaterThan(0);
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

    await eventually(() => {
      expect(submitButton.props.accessibilityState?.disabled).not.toBe(true);
    });

    fireEvent.press(submitButton);

    await eventually(() => {
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

    await eventually(() => {
      expect(submitButton.props.accessibilityState?.disabled).not.toBe(true);
    });

    fireEvent.press(submitButton);

    // Wait for provisional note creation
    await eventually(() => {
      expect(createdRecords.length).toBeGreaterThan(0);
    });

    // Wait for auto-conversion to todo
    await eventually(() => {
      expect(mockConvertUnsortedToTodo).toHaveBeenCalled();
    });

    // Wait for timing chips to appear
    await eventually(() => {
      expect(getByText('When do you want to do this?')).toBeTruthy();
    });

    // Get the todo ID (second record after note → todo conversion)
    const todos = createdRecords.filter((r: any) => r.type === 'todo');
    expect(todos.length).toBeGreaterThan(0);
    const todoId = todos[0].id;

    // Fast-forward 5 seconds
    await advanceTimers(5000);

    await eventually(() => {
      // Should update todo with null due_date (Someday)
      expect(mockRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: todoId,
          patch: expect.objectContaining({
            due_date: null,
            undefined_due: true,
          }),
        }),
      );
    });

    // Chips should be gone
    await eventually(() => {
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

    await eventually(() => {
      expect(submitButton.props.accessibilityState?.disabled).not.toBe(true);
    });

    fireEvent.press(submitButton);

    await eventually(() => {
      expect(createdRecords.length).toBeGreaterThan(0);
    });

    await eventually(() => {
      expect(getByText('When do you want to do this?')).toBeTruthy();
    });

    // Select "Someday" to clear chips
    fireEvent.press(getByText('Someday'));

    await eventually(() => {
      expect(queryByText('When do you want to do this?')).toBeNull();
    });

    // Second submission with same text should not show chips again
    fireEvent.changeText(input, 'Water plants');

    await eventually(() => {
      expect(submitButton.props.accessibilityState?.disabled).not.toBe(true);
    });

    fireEvent.press(submitButton);

    await eventually(() => {
      expect(queryByText('When do you want to do this?')).toBeNull();
    });
  });
});
