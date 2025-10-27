import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react-native';
import { act } from 'react-test-renderer';

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

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    create: mockCreate,
    notes: { list: mockNotesList, delete: mockNotesDelete },
    // Ensure remove is undefined so RecentDrops falls back to notes.delete
    remove: undefined,
    todos: { list: jest.fn(async () => []) },
    habits: { list: jest.fn(async () => []) },
  }),
}));

import CatchAllNotepad from '../app/screens/CatchAllNotepad';

function makeNote(id: string, body: string, createdAt: Date) {
  return {
    id,
    type: 'note',
    subtype: 'catchall',
    title: body,
    body,
    created_at: createdAt.toISOString(),
    labels: ['catchall'],
  } as any;
}

describe('RecentDrops in Mind Drop', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockNotesList.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Toggle open/closed reveals the list container', async () => {
    render(<CatchAllNotepad />);
    const toggle = screen.getByTestId('minddrop-recent-toggle');
    fireEvent.press(toggle);
    expect(screen.getByTestId('minddrop-recent-list')).toBeTruthy();
  });

  test('Shows up to 3 items from repo.notes.list with subtype catchall', async () => {
    const now = new Date();
    const items = [
      makeNote('n1', 'one', new Date(now.getTime() - 0)),
      makeNote('n2', 'two', new Date(now.getTime() - 1000)),
      makeNote('n3', 'three', new Date(now.getTime() - 2000)),
      makeNote('n4', 'four', new Date(now.getTime() - 3000)),
    ];
    mockNotesList.mockResolvedValue(items);

    render(<CatchAllNotepad />);

    // Open the section to render cards
    fireEvent.press(screen.getByTestId('minddrop-recent-toggle'));
    // Ensure the loader fetched
    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    // Wait for items to replace Loading… by checking card testIDs
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-n1')).toBeTruthy(), {
      timeout: 3000,
    });

    // Expect the first three cards present, and the 4th excluded
    expect(screen.getByTestId('minddrop-recent-n1')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-n2')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-n3')).toBeTruthy();
    expect(screen.queryByTestId('minddrop-recent-n4')).toBeNull();
  });

  test.skip('Timestamp is present ("ago") for each rendered card', async () => {
    const now = new Date();
    mockNotesList.mockResolvedValue([makeNote('n1', 'one', new Date(now.getTime() - 1500))]);

    render(<CatchAllNotepad />);

    fireEvent.press(screen.getByTestId('minddrop-recent-toggle'));
    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const card = await screen.findByTestId('minddrop-recent-n1');

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
    fireEvent.press(screen.getByTestId('minddrop-recent-toggle'));
    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    await screen.findByTestId('minddrop-recent-n1');

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
    fireEvent.press(screen.getByTestId('minddrop-recent-toggle'));
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
