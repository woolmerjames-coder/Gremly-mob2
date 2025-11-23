/**
 * Test: Mind Drop prevents creating duplicate unsorted notes for the same drop_id
 *
 * Scenario: When performSave is called multiple times with the same drop_id
 * (e.g., user double-clicks submit, or retry logic runs), we should reuse
 * the existing unsorted note instead of creating a duplicate.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

type MockDecision = {
  mode: 'auto' | 'ask';
  confidence?: number;
  actions: Array<{ type: string; payload: Record<string, unknown> }>;
  suggestions: Array<Record<string, unknown>>;
  explanation?: string;
  meta?: Record<string, unknown>;
};

const mockRepo = {
  getById: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  getAll: jest.fn(() => Promise.resolve([])),
  findNoteBySourceMessageId: jest.fn(() => Promise.resolve(null)),
  notes: {
    list: jest.fn(() => Promise.resolve([])),
    create: jest.fn(),
  },
  todos: {
    list: jest.fn(() => Promise.resolve([])),
  },
  habits: {
    list: jest.fn(() => Promise.resolve([])),
  },
  remove: jest.fn(),
  query: jest.fn(() => Promise.resolve([])),
  addUnsorted: jest.fn(),
};

const createAskDecision = (overrides: Partial<MockDecision> = {}): MockDecision => ({
  mode: 'ask',
  confidence: 0.6,
  actions: [],
  suggestions: [
    {
      type: 'create.todo',
      label: 'Add to To-Do List',
      payload: { title: 'Book dentist appointment' },
    },
    {
      type: 'create.log',
      label: 'Just Save It',
      payload: { title: 'Just Save It' },
    },
  ],
  explanation: 'Low confidence, ask user',
  meta: { intent: { kind: 'todo' } },
  ...overrides,
});

const createNoDecision = (): MockDecision | null => null;

const mockDecideWithContext = jest.fn(async () => createAskDecision());
const mockShowActionToast = jest.fn();

jest.mock('../lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => mockRepo,
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'test-user' } }),
}));

jest.mock('../providers/CortexProvider', () => ({
  useCortex: () => ({ decideWithContext: mockDecideWithContext }),
}));

jest.mock('@react-navigation/native', () => ({
  __esModule: true,
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/elements', () => ({
  __esModule: true,
  useHeaderHeight: () => 100,
}));

jest.mock('../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({ close: jest.fn(), openEdit: jest.fn() }),
}));

jest.mock('../contexts/OverlayContext', () => ({
  useGlobalOverlay: () => ({ close: jest.fn(), openEdit: jest.fn() }),
}));

jest.mock('../src/hooks/useActionToast', () => ({
  useActionToast: () => ({
    showToast: mockShowActionToast,
    Toast: () => null,
  }),
}));

jest.mock('../lib/diagnostics/catchallDebug', () => ({
  startCatchallTrace: () => ({ id: 'test-trace-id' }),
  step: jest.fn(),
  end: jest.fn(),
}));

const resetRepo = () => {
  mockRepo.getById.mockReset();
  mockRepo.update.mockReset();
  mockRepo.create.mockReset();
  mockRepo.delete.mockReset();
  mockRepo.getAll.mockReset();
  mockRepo.findNoteBySourceMessageId.mockReset();
  mockRepo.remove.mockReset();
  mockRepo.query.mockReset();
  mockRepo.notes.list.mockReset();
  mockRepo.notes.create.mockReset();
  mockRepo.todos.list.mockReset();
  mockRepo.habits.list.mockReset();
  mockRepo.addUnsorted.mockReset();

  mockRepo.getById.mockResolvedValue(null);
  mockRepo.update.mockResolvedValue(undefined);
  mockRepo.delete.mockResolvedValue(undefined);
  mockRepo.getAll.mockResolvedValue([]);
  mockRepo.findNoteBySourceMessageId.mockResolvedValue(null);
  mockRepo.remove.mockResolvedValue(undefined);
  mockRepo.query.mockResolvedValue([]);
  mockRepo.notes.list.mockResolvedValue([]);
  mockRepo.todos.list.mockResolvedValue([]);
  mockRepo.habits.list.mockResolvedValue([]);

  let createCounter = 0;

  // Mock create to return unique IDs
  mockRepo.create.mockImplementation(async (payload: Record<string, unknown>) => {
    const id = `note-${++createCounter}`;
    const dropId = typeof payload?.dropId === 'string' ? payload.dropId : `drop-${createCounter}`;
    return {
      id,
      ...payload,
      dropId,
      drop_id: dropId,
      type: payload.type || 'note',
    };
  });

  // Mock notes.create (preferred method in saveToUnsortedTray)
  mockRepo.notes.create.mockImplementation(async (payload: Record<string, unknown>) => {
    const id = `note-${++createCounter}`;
    const dropId = typeof payload?.dropId === 'string' ? payload.dropId : `drop-${createCounter}`;
    return {
      id,
      ...payload,
      dropId,
      drop_id: dropId,
      type: 'note',
    };
  });
};

let CatchAllNotepad: React.ComponentType;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CatchAllNotepad = require('../app/screens/CatchAllNotepad').default as React.ComponentType;
});

describe('Mind Drop drop_id duplicate prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRepo();
    mockDecideWithContext.mockReset();
    mockDecideWithContext.mockImplementation(async () => createAskDecision());
    mockShowActionToast.mockReset();
    process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'off'; // Disable toasts for cleaner tests
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
  });

  it('creates only ONE unsorted note when ask-chips decision comes back with no actions', async () => {
    // Decision with ask mode and suggestions (triggers chip display)
    mockDecideWithContext.mockResolvedValue(createAskDecision());

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission
    fireEvent.changeText(input, 'Book dentist appointment');
    fireEvent.press(submitButton);

    // Wait for category chips to appear
    await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    // Verify that only ONE unsorted note was created
    // Check both notes.create and repo.create (either could be used)
    const notesCreateCalls = mockRepo.notes.create.mock.calls.length;
    const repoCreateCalls = mockRepo.create.mock.calls.filter(
      (call: any[]) => call[0]?.type === 'note',
    ).length;

    const totalUnsortedCreates = notesCreateCalls + repoCreateCalls;

    expect(totalUnsortedCreates).toBe(1);
  });

  it('prevents duplicate unsorted note when performSave is called again after chips are shown', async () => {
    // Decision with ask mode
    mockDecideWithContext.mockResolvedValue(createAskDecision());

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission
    fireEvent.changeText(input, 'Book dentist appointment');
    fireEvent.press(submitButton);

    // Wait for chips
    await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    // Clear the input (to avoid duplicate prevention based on text)
    fireEvent.changeText(input, '');

    // Second submission with same intent (simulates retry or double-click)
    // This should reuse the same drop_id
    fireEvent.changeText(input, 'Book dentist appointment');

    // Wait a bit to allow state to settle
    await waitFor(() => {
      // Just wait for input to be ready
      expect(input).toBeDefined();
    });

    // Submit again
    fireEvent.press(submitButton);

    // Wait for chips again
    await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    // Verify that still only ONE unsorted note was created (reused the existing one)
    const notesCreateCalls = mockRepo.notes.create.mock.calls.length;
    const repoCreateCalls = mockRepo.create.mock.calls.filter(
      (call: any[]) => call[0]?.type === 'note',
    ).length;

    const totalUnsortedCreates = notesCreateCalls + repoCreateCalls;

    // Should still be 1 (from first submission), not 2
    expect(totalUnsortedCreates).toBe(1);
  });

  it('prevents duplicate when decision is null (no-decision-or-actions path)', async () => {
    // First call: null decision
    mockDecideWithContext.mockResolvedValueOnce(null as any);
    // Second call: also null
    mockDecideWithContext.mockResolvedValueOnce(null as any);

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission
    fireEvent.changeText(input, 'Random text');
    fireEvent.press(submitButton);

    // Wait for chips (no-decision fallback shows chips)
    await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    const firstCreateCount =
      mockRepo.notes.create.mock.calls.length +
      mockRepo.create.mock.calls.filter((call: any[]) => call[0]?.type === 'note').length;

    // Clear and submit again
    fireEvent.changeText(input, '');
    fireEvent.changeText(input, 'Random text');

    await waitFor(() => {
      expect(input).toBeDefined();
    });

    fireEvent.press(submitButton);

    await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    // Count again
    const secondCreateCount =
      mockRepo.notes.create.mock.calls.length +
      mockRepo.create.mock.calls.filter((call: any[]) => call[0]?.type === 'note').length;

    // Should still be same count (reused existing note)
    expect(secondCreateCount).toBe(firstCreateCount);
    expect(firstCreateCount).toBe(1); // Sanity check
  });

  it('allows creating new unsorted note after resetState clears the tracking', async () => {
    mockDecideWithContext.mockResolvedValue(createAskDecision());

    const { getByTestId, findByTestId } = render(<CatchAllNotepad />);

    const input = getByTestId('minddrop-input');
    const submitButton = getByTestId('minddrop-submit-button');

    // First submission
    fireEvent.changeText(input, 'First task');
    fireEvent.press(submitButton);

    await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    const firstCreateCount =
      mockRepo.notes.create.mock.calls.length +
      mockRepo.create.mock.calls.filter((call: any[]) => call[0]?.type === 'note').length;

    expect(firstCreateCount).toBe(1);

    // Clear input completely (triggers resetState)
    fireEvent.changeText(input, '');

    // Wait for reset to happen
    await waitFor(() => {
      expect(input.props.value).toBe('');
    });

    // New submission with different text
    fireEvent.changeText(input, 'Second task');
    fireEvent.press(submitButton);

    await findByTestId('minddrop-category-todo', {}, { timeout: 3000 });

    const secondCreateCount =
      mockRepo.notes.create.mock.calls.length +
      mockRepo.create.mock.calls.filter((call: any[]) => call[0]?.type === 'note').length;

    // Should now have 2 notes (different drop_ids)
    expect(secondCreateCount).toBe(2);
  });
});
