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

// Repo mocks
const mockNotesList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async () => []);
const mockNotesDelete: jest.Mock<Promise<void>, [string]> = jest.fn(
  async (_id: string) => undefined as unknown as void,
);
const mockTodosList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async () => []);
const mockHabitsList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async () => []);

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    notes: { list: mockNotesList, delete: mockNotesDelete },
    todos: { list: mockTodosList },
    habits: { list: mockHabitsList },
  }),
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

describe('RecentDrops component (isolated)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([]);
  });

  test('filters to today by default and toggles older items', async () => {
    const now = Date.now();
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'one', new Date(now - 0)),
      makeNote('n2', 'two', new Date(now - 1000)),
      makeNote('n3', 'three', new Date(now - 2000)),
      makeNote('n4', 'yesterday', new Date(now - 48 * 60 * 60 * 1000)),
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n1')).toBeTruthy());
    expect(screen.getByTestId('minddrop-recent-note-n2')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-note-n3')).toBeTruthy();
    expect(screen.queryByTestId('minddrop-recent-note-n4')).toBeNull();

    fireEvent.press(screen.getByTestId('minddrop-recent-range-action'));
    await waitFor(() =>
      expect(screen.getByTestId('minddrop-recent-range').props.children).toBe('Earlier'),
    );
    await waitFor(() => expect(mockNotesList.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-note-n4')).toBeTruthy());

    fireEvent.press(screen.getByTestId('minddrop-recent-range-action'));
    await waitFor(() =>
      expect(screen.getByTestId('minddrop-recent-range').props.children).toBe('Today'),
    );
    await waitFor(() => expect(mockNotesList.mock.calls.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(screen.queryByTestId('minddrop-recent-note-n4')).toBeNull());
  });

  test('shows relative timestamp (ago) within a card', async () => {
    const now = Date.now();
    mockNotesList.mockResolvedValue([makeNote('n1', 'one', new Date(now - 1500))]);
    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const card = await screen.findByTestId('minddrop-recent-note-n1');
    expect(within(card).getByText(/ago/)).toBeTruthy();
  });

  test.skip('delete triggers repo delete and reloads list', async () => {
    const now = Date.now();
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'one', new Date(now - 0)),
      makeNote('n2', 'two', new Date(now - 1000)),
      makeNote('n3', 'three', new Date(now - 2000)),
    ]);

    render(<RecentDrops overlay={overlayStub} initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const listCallsBefore = mockNotesList.mock.calls.length;

    const list = await screen.findByTestId('minddrop-recent-list');
    const del = within(list).getAllByText('Delete')[0];
    fireEvent.press(del);

    await waitFor(() => expect(mockNotesDelete).toHaveBeenCalledWith('n1'));
    await waitFor(() => expect(mockNotesList.mock.calls.length).toBeGreaterThan(listCallsBefore));
  });

  test.skip('renders todo tags when available', async () => {
    const now = Date.now();
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([
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
    mockNotesList.mockResolvedValue([]);
    mockTodosList.mockResolvedValue([]);
    mockHabitsList.mockResolvedValue([
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
