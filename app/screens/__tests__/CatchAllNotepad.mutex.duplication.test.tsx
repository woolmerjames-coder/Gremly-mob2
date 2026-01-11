/**
 * Phase 1B: Mind Drop Text-Hash-Based Mutex Test Suite
 *
 * Tests the submission mutex that prevents duplicate Mind Drop entries
 * when the user rapidly submits the same text multiple times.
 *
 * The mutex uses a hash of the trimmed text and blocks duplicate submissions
 * within a 2-second window.
 *
 * Note: Forces V2 (blocking) mode for predictable test behavior.
 * Mutex works in both V2 and V3 modes - see minddrop.v2v3.modes.test.tsx for V3 tests.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { useGlobalOverlay } from '../../../contexts/OverlayContext';

// Force V2 mode (blocking pipeline) for predictable mutex testing
process.env.EXPO_PUBLIC_MIND_DROP_V3_INSTANT = 'off';

// Mock Supabase
jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { supabase } = require('../../../lib/supabase/client');
const mockSupabaseRpc = supabase.rpc as jest.Mock;

let unsortedIdCounter = 0;

// Mock Zustand store methods (used by useMindDropSubmit)
const mockCreateTodo = jest.fn();
const mockCreateHabit = jest.fn();
const mockCreateNote = jest.fn();

// Mock store state for getState() calls
const mockStoreState = {
  todos: [],
  habits: [],
  notes: [],
  spaces: [],
  tags: [],
  habitProgress: [],
  createTodo: mockCreateTodo,
  createHabit: mockCreateHabit,
  createNote: mockCreateNote,
  gremlyAge: 5,
  totalSweepCount: 10,
  incrementSweepCount: () => Promise.resolve({ didAgeUp: false, newAge: 5 }),
};

const mockUseGremlyStore = (selector: any) => {
  return selector(mockStoreState);
};
mockUseGremlyStore.getState = () => mockStoreState;
mockUseGremlyStore.subscribe = () => () => {}; // Returns unsubscribe function

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: mockUseGremlyStore,
}));

const mockRepo = {
  getById: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  getAll: jest.fn(() => Promise.resolve([])),
  findNoteBySourceMessageId: jest.fn(() => Promise.resolve(null)),
  notes: {
    list: jest.fn(() => Promise.resolve([])),
  },
  todos: {
    list: jest.fn(() => Promise.resolve([])),
  },
  habits: {
    list: jest.fn(() => Promise.resolve([])),
  },
  remove: jest.fn(),
  archiveItemsByDropId: jest.fn(),
};

jest.mock('../../../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../../../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100,
}));

const createAskDecision = () => ({
  mode: 'ask' as const,
  confidence: 0.7,
  suggestions: [
    {
      type: 'create.todo',
      label: 'Add to To-Do List',
      payload: { title: 'Test Task' },
    },
  ],
  actions: [] as unknown[],
  meta: { intent: { kind: 'todo' } },
});

const mockDecideWithContext = jest.fn(async () => createAskDecision());

jest.mock('../../../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('../../../providers/ThemeProvider', () => ({
  useTheme: () => ({
    c: {
      text: '#000',
      mutedText: '#666',
      sageTint: '#E8F4E8',
      goldenPear: '#FFE5B4',
      mossGreen: '#3D5A3D',
      danger: '#DC2626',
    },
    mode: 'light',
  }),
}));

jest.mock('../../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn() }),
}));

const mockShowActionToast = jest.fn();
jest.mock('../../../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CatchAllNotepad = require('../CatchAllNotepad').default as React.ComponentType;

const resetRepoMocks = () => {
  unsortedIdCounter = 0;

  mockRepo.getById.mockReset();
  mockRepo.update.mockReset();
  mockRepo.create.mockReset();
  mockRepo.delete.mockReset();
  mockRepo.getAll.mockReset();
  mockRepo.findNoteBySourceMessageId.mockReset();
  mockRepo.notes.list.mockReset();
  mockRepo.todos.list.mockReset();
  mockRepo.habits.list.mockReset();
  mockRepo.remove.mockReset();
  mockRepo.archiveItemsByDropId.mockReset();

  mockRepo.getById.mockResolvedValue(null);
  mockRepo.update.mockResolvedValue(undefined);
  mockRepo.delete.mockResolvedValue(undefined);
  mockRepo.getAll.mockResolvedValue([]);
  mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  mockRepo.notes.list.mockResolvedValue([]);
  mockRepo.todos.list.mockResolvedValue([]);
  mockRepo.habits.list.mockResolvedValue([]);
  mockRepo.archiveItemsByDropId.mockResolvedValue(undefined);

  mockRepo.create.mockImplementation(async (input) => ({
    id: `unsorted-${++unsortedIdCounter}`,
    ...input,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Reset Zustand store mocks
  mockCreateTodo.mockReset();
  mockCreateHabit.mockReset();
  mockCreateNote.mockReset();

  // Default implementations for Zustand mocks - return full entity objects
  mockCreateTodo.mockImplementation(async (input) => ({
    id: `todo-${++unsortedIdCounter}`,
    type: 'todo',
    ...input,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  mockCreateHabit.mockImplementation(async (input) => ({
    id: `habit-${++unsortedIdCounter}`,
    type: 'habit',
    ...input,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  mockCreateNote.mockImplementation(async (input) => ({
    id: `note-${++unsortedIdCounter}`,
    type: 'note',
    ...input,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
};

const resetOtherMocks = () => {
  mockDecideWithContext.mockReset();
  mockDecideWithContext.mockImplementation(async () => createAskDecision());
  mockShowActionToast.mockReset();
};

/**
 * Helper to get the text from a create call.
 * Depending on entity type, text can be in `name`, `title`, or `body`.
 */
const getTextFromCreateCall = (callArgs: Record<string, unknown>): string | undefined => {
  return (callArgs.name as string) ?? (callArgs.title as string) ?? (callArgs.body as string);
};

describe('Phase 1B: Mind Drop Submission Mutex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepoMocks();
    resetOtherMocks();
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValue({ data: 'todo-123', error: null });
    process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'on';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
  });

  it('blocks rapid double-tap submission of identical text', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Enter text
    fireEvent.changeText(input, 'buy groceries');

    // Rapid double-tap
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);

    // Wait for async operations - now uses Zustand mockCreateTodo
    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalled(), { timeout: 4000 });

    // Should only create ONE entity, not two
    expect(mockCreateTodo).toHaveBeenCalledTimes(1);
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[0][0])).toBe('buy groceries');
  });

  it('blocks triple-tap submission of identical text', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'call dentist');

    // Rapid triple-tap
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalled(), { timeout: 4000 });

    // Should only create ONE entity
    expect(mockCreateTodo).toHaveBeenCalledTimes(1);
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[0][0])).toBe('call dentist');
  });

  it('allows submission of different text immediately', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission
    fireEvent.changeText(input, 'buy milk');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(1), { timeout: 4000 });

    // Change text and submit again
    fireEvent.changeText(input, 'call mom');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(2), { timeout: 4000 });

    // Verify both were created
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[0][0])).toBe('buy milk');
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[1][0])).toBe('call mom');
  });

  it('treats text with different whitespace as identical (trimming)', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission with leading/trailing spaces - use clear todo text
    fireEvent.changeText(input, '  buy groceries  ');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(1), { timeout: 4000 });

    // Second submission without spaces (same trimmed text)
    fireEvent.changeText(input, 'buy groceries');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(1), { timeout: 4000 });

    // Should only create ONE entity (mutex blocked second submission)
    expect(mockCreateTodo).toHaveBeenCalledTimes(1);
  });

  it('mutex integrates with existing duplicate prevention', async () => {
    // This test verifies that the text-hash mutex works alongside
    // the existing time-based duplicate prevention (MIN_SUBMIT_INTERVAL_MS = 2000ms)
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission - use clear todo text
    fireEvent.changeText(input, 'call the doctor');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(1), { timeout: 4000 });

    // Immediate second attempt (within 2s) - blocked by both mutex AND time-based check
    fireEvent.changeText(input, 'call the doctor');
    fireEvent.press(submitButton);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    // Should still be 1 (blocked)
    expect(mockCreateTodo).toHaveBeenCalledTimes(1);

    // Different text should work immediately (only hash-based mutex applies)
    fireEvent.changeText(input, 'send email to boss');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(2), { timeout: 4000 });
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[1][0])).toBe('send email to boss');
  });

  it('handles network jitter scenario (3 rapid identical submits)', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    fireEvent.changeText(input, 'fix bug in app');

    // Simulate network jitter: 3 rapid taps within 100ms
    fireEvent.press(submitButton);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    fireEvent.press(submitButton);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalled(), { timeout: 4000 });

    // Should only create ONE entity despite 3 taps
    expect(mockCreateTodo).toHaveBeenCalledTimes(1);
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[0][0])).toBe('fix bug in app');
  });

  it('successfully blocks duplicate rapid submissions', async () => {
    // Verify the primary goal: rapid duplicate submissions are blocked
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Use clear todo text with imperative verb
    fireEvent.changeText(input, 'schedule meeting');

    // Rapid triple-tap to simulate network jitter or accidental multiple taps
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalled(), { timeout: 4000 });

    // Critical assertion: Only ONE entity created despite 3 rapid taps
    expect(mockCreateTodo).toHaveBeenCalledTimes(1);
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[0][0])).toBe('schedule meeting');
  });

  it('independent mutex per unique text hash', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Submit first text twice (second should be blocked) - use clear todo text
    fireEvent.changeText(input, 'buy task A items');
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(1), { timeout: 4000 });

    // Submit different text twice (second should be blocked) - use clear todo text
    fireEvent.changeText(input, 'call task B contact');
    fireEvent.press(submitButton);
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(2), { timeout: 4000 });

    // Verify both unique texts were created exactly once
    expect(mockCreateTodo).toHaveBeenCalledTimes(2);
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[0][0])).toBe('buy task A items');
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[1][0])).toBe('call task B contact');
  });

  it('mutex survives empty text submission attempts', async () => {
    const { getByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // Try to submit empty text (should be blocked by existing validation)
    fireEvent.changeText(input, '   ');
    fireEvent.press(submitButton);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Should not create anything
    expect(mockCreateTodo).not.toHaveBeenCalled();

    // Submit real text - use clear todo text
    fireEvent.changeText(input, 'buy real items');
    fireEvent.press(submitButton);

    await waitFor(() => expect(mockCreateTodo).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(getTextFromCreateCall(mockCreateTodo.mock.calls[0][0])).toBe('buy real items');
  });
});
