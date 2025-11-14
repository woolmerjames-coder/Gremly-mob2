import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react-native';
import { act } from 'react-test-renderer';
import { env } from '../lib/env';
import { useGlobalOverlay } from '../contexts/OverlayContext';

// Feature flag for Mind Drop v2 path (currently renders legacy UI content)
jest.mock('@/src/config/featureFlags', () => ({ MIND_DROP_V2: true }));

// Mock navigation to avoid actual navigation usage in tests
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      setOptions: jest.fn(),
      navigate: jest.fn(),
      canGoBack: () => true,
      goBack: jest.fn(),
    }),
  };
});

// Mock navigation elements (useHeaderHeight)
jest.mock('@react-navigation/elements', () => ({
  useHeaderHeight: () => 100, // Mock header height
}));

// Mock Auth
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}));

// Repo mocks
const mockNotesList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async (_opts?: any) => []);
const mockNotesDelete: jest.Mock<Promise<void>, [string]> = jest.fn(
  async (_id: string) => undefined as unknown as void,
);
const mockCreate: jest.Mock<Promise<any>, [any]> = jest.fn(async (_input: any) => ({
  id: 'n-new',
  type: 'note',
  created_at: new Date().toISOString(),
}));
const mockTodosList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async (_opts?: any) => []);
const mockHabitsList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async (_opts?: any) => []);

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    notes: { list: mockNotesList, delete: mockNotesDelete },
    // Ensure remove is undefined so RecentDrops falls back to notes.delete
    remove: undefined,
    todos: { list: mockTodosList },
    habits: { list: mockHabitsList },
  }),
}));

import CatchAllNotepad from '../app/screens/CatchAllNotepad';

function makeNote(
  id: string,
  body: string,
  createdAt: Date,
  unsorted = false,
  subtype: string = 'catchall',
) {
  const labels = unsorted ? ['catchall', 'needs_review'] : ['catchall'];
  return {
    id,
    type: 'note',
    subtype,
    title: body,
    body,
    created_at: createdAt.toISOString(),
    labels,
    origin: 'catchall',
  } as any;
}

function makeTodo(id: string, name: string, createdAt: Date) {
  return {
    id,
    type: 'todo',
    name,
    created_at: createdAt.toISOString(),
    origin: 'catchall',
    tags: [],
  } as any;
}

function makeHabit(id: string, name: string, createdAt: Date) {
  return {
    id,
    type: 'habit',
    name,
    created_at: createdAt.toISOString(),
    origin: 'catchall',
  } as any;
}

describe('RecentDrops in Mind Drop', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);
    (useGlobalOverlay().openCreate as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Starts open, toggle hides then reopens the list container', async () => {
    render(<CatchAllNotepad />);
    const list = await screen.findByTestId('minddrop-recent-list');
    expect(list).toBeTruthy();

    const toggle = screen.getByTestId('minddrop-recent-toggle');
    fireEvent.press(toggle);
    await waitFor(() => expect(screen.queryByTestId('minddrop-recent-list')).toBeNull());

    fireEvent.press(toggle);
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-list')).toBeTruthy());
  });

  test('Shows unified recent drops across notes, todos, and habits', async () => {
    const now = new Date();
    const notes = [
      makeNote('n1', 'note one', new Date(now.getTime() - 0), true),
      makeNote('n2', 'note two', new Date(now.getTime() - 1200)),
      makeNote('n3', 'note three', new Date(now.getTime() - 2400)),
      makeNote('n4', 'note four', new Date(now.getTime() - 48 * 60 * 60 * 1000)), // older than today
    ];
    mockNotesList.mockResolvedValue(notes);
    mockTodosList.mockResolvedValue([
      makeTodo('t1', 'todo from drop', new Date(now.getTime() - 800)),
    ]);
    mockHabitsList.mockResolvedValue([
      makeHabit('h1', 'habit from drop', new Date(now.getTime() - 1600)),
    ]);

    render(<CatchAllNotepad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n1')).toBeTruthy(), {
      timeout: 3000,
    });

    expect(screen.getByTestId('minddrop-recent-note-n1')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-note-n2')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-note-n3')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-todo-t1')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-habit-h1')).toBeTruthy();
    expect(screen.queryByTestId('minddrop-recent-note-n4')).toBeNull();

    // Toggle to show older items (re-fetch should include the older note)
    fireEvent.press(screen.getByTestId('minddrop-recent-range-action'));
    await waitFor(() => expect(mockNotesList.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n4')).toBeTruthy());

    // Badge labels should be present for each kind
    expect(screen.getAllByText('note').length).toBeGreaterThan(0);
    expect(screen.getByText('todo')).toBeTruthy();
    expect(screen.getByText('habit')).toBeTruthy();
    expect(screen.getByText('Unsorted')).toBeTruthy();
  });

  test('Recent drop badges surface canonical labels when canonical types are enabled', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'catch-all idea', new Date(now.getTime() - 500), true, 'catchall'),
      makeNote('n2', 'journal entry', new Date(now.getTime() - 400), false, 'journal'),
    ]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);

    const originalCanonical = env.feature.canonicalTypes;

    try {
      (env.feature as any).canonicalTypes = true;

      render(<CatchAllNotepad />);

      await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n1')).toBeTruthy());

      const unsortedCard = screen.getByTestId('minddrop-recent-note-n1');
      expect(within(unsortedCard).getByText('unsorted')).toBeTruthy();
      expect(within(unsortedCard).queryByText('Unsorted')).toBeNull();

      const journalCard = screen.getByTestId('minddrop-recent-note-n2');
      expect(within(journalCard).getByText('log')).toBeTruthy();
    } finally {
      (env.feature as any).canonicalTypes = originalCanonical;
    }
  });

  test('Explicit "Add to To-Dos" button opens a todo overlay and flips the lane label', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([makeNote('n1', 'convert me', now, true)]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);

    render(<CatchAllNotepad />);

    const card = await screen.findByTestId('minddrop-recent-note-n1');
    expect(within(card).getByText('note')).toBeTruthy();
    expect(within(card).getByText('Unsorted')).toBeTruthy();
    // This is an explicit button press from Recent Drops, not an auto chip.
    const convertButton = within(card).getByText('Add to To-Dos');
    fireEvent.press(convertButton);

    const overlay = useGlobalOverlay();
    expect(overlay.openCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEntity: expect.objectContaining({ type: 'todo' }),
        initialText: 'convert me',
      }),
    );

    await waitFor(() => expect(within(card).getByText('todo')).toBeTruthy());
  });

  test('Recent drop badges fall back to legacy note labels when canonical types are disabled', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'catch-all idea', new Date(now.getTime() - 500), true, 'catchall'),
      makeNote('n2', 'journal entry', new Date(now.getTime() - 400), false, 'journal'),
    ]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);

    const originalCanonical = env.feature.canonicalTypes;

    try {
      (env.feature as any).canonicalTypes = false;

      render(<CatchAllNotepad />);

      await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n1')).toBeTruthy());

      const unsortedCard = screen.getByTestId('minddrop-recent-note-n1');
      expect(within(unsortedCard).getByText('note')).toBeTruthy();
      expect(within(unsortedCard).getByText('Unsorted')).toBeTruthy();

      const journalCard = screen.getByTestId('minddrop-recent-note-n2');
      expect(within(journalCard).getByText('note')).toBeTruthy();
    } finally {
      (env.feature as any).canonicalTypes = originalCanonical;
    }
  });

  test('Todo due badge surfaces due_at consistently', async () => {
    const now = new Date();
    const dueIso = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([
      {
        id: 'todo-due-1',
        type: 'todo',
        name: 'Follow up email',
        created_at: now.toISOString(),
        due_date: dueIso,
        due_at: dueIso,
        origin: 'catchall',
        tags: [],
      } as any,
    ]);

    render(<CatchAllNotepad />);

    const badge = await screen.findByTestId('minddrop-recent-todo-due-todo-due-1');
    const badgeLabel = Array.isArray(badge.props.children)
      ? badge.props.children.join('')
      : badge.props.children;
    expect(typeof badgeLabel).toBe('string');
    expect((badgeLabel as string).toLowerCase()).toContain('due');
  });

  test('shows singular stats copy when exactly one item is organized today', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([makeNote('n-single', 'single note', now)]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);

    render(<CatchAllNotepad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const statsRow = await screen.findByTestId('minddrop-trust');
    expect(statsRow).toBeTruthy();
    expect(screen.getByText('1 thought organized today')).toBeTruthy();
  });

  test('shows plural stats copy when multiple items are organized today', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'first note', now),
      makeNote('n2', 'second note', new Date(now.getTime() - 1000)),
    ]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);

    render(<CatchAllNotepad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const statsRow = await screen.findByTestId('minddrop-trust');
    expect(statsRow).toBeTruthy();
    expect(screen.getByText('2 thoughts organized today')).toBeTruthy();
  });

  test('hides stats row when nothing has been organized today', async () => {
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);

    render(<CatchAllNotepad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    expect(screen.queryByTestId('minddrop-trust')).toBeNull();
  });

  test.skip('Timestamp is present ("ago") for each rendered card', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([makeNote('n1', 'one', new Date(now.getTime() - 1500))]);

    render(<CatchAllNotepad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const card = await screen.findByTestId('minddrop-recent-note-n1');

    // The time label includes the word "ago"
    const timeLabel = within(card).getByText(/ago/i);
    expect(timeLabel).toBeTruthy();
  });

  test.skip('Delete refreshes the list and calls repo.notes.delete with the card id', async () => {
    const now = new Date();
    const n1 = makeNote('n1', 'one', new Date(now.getTime() - 0));
    const n2 = makeNote('n2', 'two', new Date(now.getTime() - 1000));
    const n3 = makeNote('n3', 'three', new Date(now.getTime() - 2000));
    const n4 = makeNote('n4', 'four', new Date(now.getTime() - 3000));

    // Initial response has 4 items (component slices to top 3)
    mockNotesList.mockResolvedValue([n1, n2, n3, n4]);

    render(<CatchAllNotepad />);

    // Open the section
    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    await screen.findByTestId('minddrop-recent-note-n1');

    // Count initial list calls
    const callsBefore = mockNotesList.mock.calls.length;

    // Delete the first card (should be the most recent: n1)
    const list = screen.getByTestId('minddrop-recent-list');
    const delButtons = within(list).getAllByText('Delete');
    fireEvent.press(delButtons[0]);

    await waitFor(() => expect(mockNotesDelete).toHaveBeenCalledWith('n1'));

    // Ensure load() was triggered again (another notes.list call)
    await waitFor(() => {
      const callsAfter = mockNotesList.mock.calls.length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  test.skip('Recent list reloads after submit (refresh signal bump)', async () => {
    const now = new Date();
    // Start with some items
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'one', new Date(now.getTime() - 0)),
      makeNote('n2', 'two', new Date(now.getTime() - 1000)),
      makeNote('n3', 'three', new Date(now.getTime() - 2000)),
    ]);

    render(<CatchAllNotepad />);

    // Open section for visibility (not required for load, but helps assertions)
    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    await act(async () => {});

    // Track only the calls from RecentDrops load by options shape (limit/order present)
    const countRecentLoadCalls = () =>
      mockNotesList.mock.calls.filter((args) => args && args[0] && 'limit' in (args[0] || {}))
        .length;

    const before = countRecentLoadCalls();

    // Submit a quick note
    fireEvent.changeText(screen.getByTestId('minddrop-input'), 'hello world');
    fireEvent.press(screen.getByTestId('minddrop-submit-button'));

    // Let promises/microtasks resolve
    // Create should be called
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());

    await waitFor(() => {
      const after = countRecentLoadCalls();
      expect(after).toBeGreaterThan(before);
    });
  });
});
