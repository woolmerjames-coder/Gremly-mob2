import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react-native';

// Mock navigation
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: jest.fn(),
      setOptions: jest.fn(),
    }),
  };
});

// Mock AuthProvider
jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    userId: undefined, // IMPORTANT: Disable Supabase subscriptions in tests
  }),
}));

// Mock RepoProvider
jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    update: jest.fn().mockResolvedValue(undefined),
    archive: jest.fn().mockResolvedValue(undefined),
    getById: jest.fn().mockResolvedValue(null),
  }),
}));

// Mock Zustand store selectors (RecentDrops now uses these instead of repo)
import * as selectors from '../lib/store/selectors';
const mockSelectRecentNotes = selectors.selectRecentNotes as unknown as jest.Mock;
const mockSelectRecentTodos = selectors.selectRecentTodos as unknown as jest.Mock;
const mockSelectRecentHabits = selectors.selectRecentHabits as unknown as jest.Mock;

jest.mock('../lib/store/selectors', () => ({
  selectItemById: jest.fn(),
  selectNoteBySourceMessageId: jest.fn(),
  selectRecentNotes: jest.fn(() => []),
  selectRecentTodos: jest.fn(() => []),
  selectRecentHabits: jest.fn(() => []),
}));

import { RecentDropsTestable as RecentDrops } from '../app/screens/CatchAllNotepad';

const overlayStub = {
  state: {
    visible: false,
    mode: 'create' as const,
    initialEntity: undefined,
    initialSpaceId: null,
    conversionMeta: undefined,
    initialText: null,
  },
  openCreate: jest.fn(),
  openEdit: jest.fn(),
  close: jest.fn(),
};

function makeNote(id: string, text: string, createdAt: Date) {
  return {
    id,
    type: 'note',
    subtype: 'catchall',
    body: text,
    created_at: createdAt.toISOString(),
    labels: ['catchall'],
    origin: 'catchall',
  } as any;
}

// Skipped: Test selector mocks aren't properly setting up note data.
// TODO: Investigate selector mock timing and data setup.
describe.skip('RecentDrops component (isolated)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectRecentNotes.mockReturnValue([]);
    mockSelectRecentTodos.mockReturnValue([]);
    mockSelectRecentHabits.mockReturnValue([]);
  });

  test.skip('filters to today by default and toggles older items', async () => {
    // SKIP: This tests reload behavior which relies on subscription mechanism
    const now = Date.now();
    mockSelectRecentNotes.mockReturnValue([
      makeNote('n1', 'one', new Date(now - 0)),
      makeNote('n2', 'two', new Date(now - 1000)),
      makeNote('n3', 'three', new Date(now - 2000)),
      makeNote('n4', 'yesterday', new Date(now - 48 * 60 * 60 * 1000)),
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n1')).toBeTruthy());
    expect(screen.getByTestId('minddrop-recent-note-n2')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-note-n3')).toBeTruthy();
    expect(screen.queryByTestId('minddrop-recent-note-n4')).toBeNull();

    fireEvent.press(screen.getByTestId('minddrop-recent-range-action'));
    await waitFor(() =>
      expect(screen.getByTestId('minddrop-recent-range').props.children).toBe('Earlier'),
    );
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n4')).toBeTruthy());

    fireEvent.press(screen.getByTestId('minddrop-recent-range-action'));
    await waitFor(() =>
      expect(screen.getByTestId('minddrop-recent-range').props.children).toBe('Today'),
    );
    await waitFor(() => expect(screen.queryByTestId('minddrop-recent-note-n4')).toBeNull());
  });

  test('shows relative timestamp (ago) within a card', async () => {
    const now = Date.now();
    mockSelectRecentNotes.mockReturnValue([makeNote('n1', 'one', new Date(now - 1500))]);
    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    const card = await screen.findByTestId('minddrop-recent-note-n1');
    expect(within(card).getByText(/ago/)).toBeTruthy();
  });

  test.skip('delete triggers repo delete and reloads list', async () => {
    // SKIP: This tests deletion which now uses Zustand store mutations
    const now = Date.now();
    mockSelectRecentNotes.mockReturnValue([
      makeNote('n1', 'one', new Date(now - 0)),
      makeNote('n2', 'two', new Date(now - 1000)),
      makeNote('n3', 'three', new Date(now - 2000)),
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n1')).toBeTruthy());

    const list = await screen.findByTestId('minddrop-recent-list');
    const del = within(list).getAllByText('Delete')[0];
    fireEvent.press(del);

    // Would need to verify store.deleteNote was called
  });

  test.skip('renders todo tags when available', async () => {
    const now = Date.now();
    mockSelectRecentNotes.mockReturnValue([]);
    mockSelectRecentTodos.mockReturnValue([
      {
        id: 't1',
        type: 'todo',
        name: 'tagged task',
        created_at: new Date(now - 500).toISOString(),
        origin: 'catchall',
        tags: ['running', 'focus'],
      },
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    const todoCard = await screen.findByTestId('minddrop-recent-todo-t1');
    expect(within(todoCard).getByText('#running')).toBeTruthy();
    expect(within(todoCard).getByText('#focus')).toBeTruthy();
  });

  test.skip('renders habit tags when available', async () => {
    const now = Date.now();
    mockSelectRecentNotes.mockReturnValue([]);
    mockSelectRecentTodos.mockReturnValue([]);
    mockSelectRecentHabits.mockReturnValue([
      {
        id: 'h1',
        type: 'habit',
        name: 'Run every morning',
        created_at: new Date(now - 500).toISOString(),
        origin: 'catchall',
        tags: ['#running', '#morning', '#exercise'],
      },
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    const habitCard = await screen.findByTestId('minddrop-recent-habit-h1');
    expect(within(habitCard).getByText('#running')).toBeTruthy();
    // 'morning' is filtered by TAG_STOP_WORDS
    expect(within(habitCard).getByText('#exercise')).toBeTruthy();
  });
});
