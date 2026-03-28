import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { organizedToastContent } from '../lib/ui/toast/copy';
import { env } from '../lib/env';

// Force feature flag ON
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: mockNavigate,
      canGoBack: () => true,
      goBack: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    }),
  };
});

// Mock navigation elements (useHeaderHeight)
jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100, // Mock header height
}));

const mockDecideWithContext = jest.fn().mockResolvedValue({
  mode: 'auto',
  actions: [
    {
      type: 'create.todo',
      payload: { title: 'Book dentist appointment', due: null, spaceId: null },
    },
  ],
  confidence: 0.95,
  suggestions: [],
  explanation: 'On it 🎯',
});

jest.mock('../providers/CortexProvider', () => {
  const actual = jest.requireActual('../providers/CortexProvider');
  return {
    ...actual,
    useCortex: () => ({
      decideWithContext: mockDecideWithContext,
    }),
  };
});

// Mock Auth - userId undefined to prevent Supabase subscription code paths
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    // userId undefined prevents CatchAllNotepad subscription effects from running
  }),
}));

// Mock Cortex route to auto-create multiple items
jest.mock('../lib/cortex/router', () => ({
  cortexRoute: jest.fn(async () => ({
    mode: 'auto',
    actions: [
      { type: 'create.todo', payload: { title: 'Buy milk', due: null, spaceId: null } },
      { type: 'create.todo', payload: { title: 'Call mom', due: null, spaceId: null } },
      { type: 'create.note', payload: { text: 'Journal', subtype: 'note', spaceId: null } },
      { type: 'create.habit', payload: { name: 'Run', freq: 'daily', spaceId: null } },
    ],
    confidence: 0.99,
    suggestions: [],
    explanation: 'auto',
  })),
}));

// Mock Repo
const mockCreate = jest.fn();
const mockRemove = jest.fn();
const mockWriteEvent = jest.fn();
const mockGetById = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    remove: mockRemove,
    writeEvent: mockWriteEvent,
    getById: mockGetById,
    update: mockUpdate,
    getOrCreateList: jest.fn(async (key: string) => ({ id: key, name: key })),
    addListItem: jest.fn(),
    listByType: jest.fn(),
    listSpaces: jest.fn(),
    listTags: jest.fn(),
    listLinkedTags: jest.fn(),
    listPeople: jest.fn(),
    listLinkedPeople: jest.fn(),
    // Pipeline idempotency check methods
    findTodoByDropId: jest.fn().mockResolvedValue(null),
    findHabitByDropId: jest.fn().mockResolvedValue(null),
  }),
}));

// Mock Phase 4A conversion helpers
const mockConvertUnsortedToTodo = jest.fn();
const mockConvertUnsortedToHabit = jest.fn();
const mockConvertUnsortedToLog = jest.fn();
jest.mock('../lib/conversion', () => ({
  convertUnsortedToTodo: (repo: any, noteId: string, options?: any) =>
    mockConvertUnsortedToTodo(repo, noteId, options),
  convertUnsortedToHabit: (repo: any, noteId: string, options?: any) =>
    mockConvertUnsortedToHabit(repo, noteId, options),
  convertUnsortedToLog: (repo: any, noteId: string, options?: any) =>
    mockConvertUnsortedToLog(repo, noteId, options),
}));

// Component under test
import CatchAllNotepad from '../app/screens/CatchAllNotepad';

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  process.env.EXPO_PUBLIC_MINDDROP_TOASTS = 'on';

  // Configure createMock to return IDs based on the type and call count
  let todoCount = 0;
  mockCreate.mockImplementation(async (input: any) => {
    if (input.type === 'todo') {
      todoCount += 1;
      return { id: todoCount === 1 ? 't1' : 't2', type: 'todo' };
    }
    if (input.type === 'note') {
      return { id: 'n1', type: 'note' };
    }
    if (input.type === 'habit') {
      return { id: 'h1', type: 'habit' };
    }
    return { id: 'x', type: input.type };
  });

  // Phase 4A conversion helper mocks
  mockGetById.mockImplementation(async (id: string) => ({
    id,
    type: 'note',
    created_at: new Date().toISOString(),
    labels: [],
  }));

  mockUpdate.mockResolvedValue({});

  mockConvertUnsortedToTodo.mockImplementation(async (repo: any, noteId: string, options?: any) => {
    const note = await repo.getById(noteId);
    const todo = await repo.create({
      type: 'todo',
      title: options?.title || 'Converted todo',
      created_at: new Date().toISOString(),
    });
    await repo.update({
      id: noteId,
      patch: { labels: ['archived'] },
    });
    return { todo, updatedNote: { ...note, labels: ['archived'] } };
  });

  mockConvertUnsortedToLog.mockImplementation(async (repo: any, noteId: string, options?: any) => {
    const note = await repo.getById(noteId);
    const log = await repo.create({
      type: 'log',
      text: options?.text || 'Converted log',
      created_at: new Date().toISOString(),
    });
    await repo.update({
      id: noteId,
      patch: { labels: ['archived'] },
    });
    return { log, updatedNote: { ...note, labels: ['archived'] } };
  });

  mockConvertUnsortedToHabit.mockImplementation(
    async (repo: any, noteId: string, options?: any) => {
      const note = await repo.getById(noteId);
      const habit = await repo.create({
        type: 'habit',
        name: options?.name || 'Converted habit',
        created_at: new Date().toISOString(),
      });
      await repo.update({
        id: noteId,
        patch: { labels: ['archived'] },
      });
      return { habit, updatedNote: { ...note, labels: ['archived'] } };
    },
  );
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_MINDDROP_TOASTS;
});

describe('Mind Drop submit -> toast + actions', () => {
  it.skip('Undo path: disables CTA while submitting, shows spinner label, restores after; double-press debounced; Undo deletes created ids', async () => {
    render(<CatchAllNotepad />);

    // Type text
    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'buy milk; start running again');

    // Submit
    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    // While submitting, label should be "✓ Organizing..."
    expect(screen.getByText('✓ Organizing...')).toBeTruthy();

    // Second press immediately to ensure the debounce path is exercised
    fireEvent.press(submit);
    // Wait for label to restore and toast to appear
    await waitFor(() => {
      expect(screen.getByText('Drop to Gremly →')).toBeTruthy();
    });

    const expectedToast = organizedToastContent('note', 1);
    const toastSummary = await screen.findByText(expectedToast);
    expect(toastSummary).toBeTruthy();

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
    const createdTypes = mockCreate.mock.calls
      .map((call) => call[0]?.type)
      .filter((type): type is string => typeof type === 'string');
    expect(createdTypes).toEqual(['note']);

    // Press Undo -> should call remove for all created ids
    const undoBtn = screen.getByText('↩️ Undo');
    fireEvent.press(undoBtn);

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
    const removedIds = mockRemove.mock.calls.map((c) => c[0]).sort();
    expect(removedIds).toEqual(['n1']);

    // Debounce: ensure create total calls reflect a single submit per press cluster
    // One cluster (double press): 1 create
    expect(mockCreate.mock.calls.length).toBe(1);
  });

  it.skip('View Details path: shows success toast with actions and navigates on View Details', async () => {
    render(<CatchAllNotepad />);

    const input = screen.getByTestId('minddrop-input');
    fireEvent.changeText(input, 'check out details');

    const submit = screen.getByTestId('minddrop-submit-button');
    fireEvent.press(submit);

    await waitFor(() => {
      expect(screen.getByText('Drop to Gremly →')).toBeTruthy();
    });
    const expectedToast = organizedToastContent('note', 1);
    await screen.findByText(expectedToast);
    const viewBtn = screen.getByText('🔎 View Details');
    fireEvent.press(viewBtn);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
    const navArgs = mockNavigate.mock.calls[0];
    expect(navArgs[0]).toBe('Tabs');
    expect(navArgs[1]).toEqual(
      expect.objectContaining({ screen: 'Search', params: { filter: 'recent' } }),
    );
  });

  it.skip('Surfaces canonical labels in toast copy when canonical types flag enabled', async () => {
    const originalCanonical = env.feature.canonicalTypes;

    try {
      (env.feature as any).canonicalTypes = true;
      mockDecideWithContext.mockResolvedValueOnce({
        mode: 'auto',
        actions: [
          {
            type: 'create.note',
            payload: { text: 'Reflective entry', subtype: 'journal', spaceId: null },
          },
        ],
        confidence: 0.9,
        suggestions: [],
        explanation: 'journal',
      });

      render(<CatchAllNotepad />);

      const input = screen.getByTestId('minddrop-input');
      fireEvent.changeText(input, 'write about my day');

      const submit = screen.getByTestId('minddrop-submit-button');
      fireEvent.press(submit);

      await waitFor(() => {
        expect(screen.getByText('Drop to Gremly →')).toBeTruthy();
      });

      const expectedToast = organizedToastContent('log', 1);
      await screen.findByText(expectedToast);
    } finally {
      (env.feature as any).canonicalTypes = originalCanonical;
    }
  });
});
