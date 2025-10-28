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

// Repo mocks
const mockNotesList: jest.Mock<Promise<any[]>, [any?]> = jest.fn(async () => []);
const mockNotesDelete: jest.Mock<Promise<void>, [string]> = jest.fn(
  async (_id: string) => undefined as unknown as void,
);

jest.mock('../providers/RepoProvider', () => ({
  useRepo: () => ({
    notes: { list: mockNotesList, delete: mockNotesDelete },
  }),
}));

import { RecentDropsTestable as RecentDrops } from '../app/screens/CatchAllNotepad';

function makeNote(id: string, text: string, createdAt: Date) {
  return {
    id,
    type: 'note',
    subtype: 'catchall',
    body: text,
    created_at: createdAt.toISOString(),
    labels: ['catchall'],
  } as any;
}

describe('RecentDrops component (isolated)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotesList.mockResolvedValue([]);
  });

  test('renders up to 3 items', async () => {
    const now = Date.now();
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'one', new Date(now - 0)),
      makeNote('n2', 'two', new Date(now - 1000)),
      makeNote('n3', 'three', new Date(now - 2000)),
      makeNote('n4', 'four', new Date(now - 3000)),
    ]);

    render(<RecentDrops initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('minddrop-recent-n1')).toBeTruthy());
    expect(screen.getByTestId('minddrop-recent-n2')).toBeTruthy();
    expect(screen.getByTestId('minddrop-recent-n3')).toBeTruthy();
    expect(screen.queryByTestId('minddrop-recent-n4')).toBeNull();
  });

  test('shows relative timestamp (ago) within a card', async () => {
    const now = Date.now();
    mockNotesList.mockResolvedValue([makeNote('n1', 'one', new Date(now - 1500))]);
    render(<RecentDrops initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const card = await screen.findByTestId('minddrop-recent-n1');
    expect(within(card).getByText(/ago/)).toBeTruthy();
  });

  test('delete triggers repo delete and reloads list', async () => {
    const now = Date.now();
    mockNotesList.mockResolvedValue([
      makeNote('n1', 'one', new Date(now - 0)),
      makeNote('n2', 'two', new Date(now - 1000)),
      makeNote('n3', 'three', new Date(now - 2000)),
    ]);

    render(<RecentDrops initiallyOpen eagerLoad />);

    await waitFor(() => expect(mockNotesList).toHaveBeenCalled());
    const listCallsBefore = mockNotesList.mock.calls.length;

    const list = await screen.findByTestId('minddrop-recent-list');
    const del = within(list).getAllByText('Delete')[0];
    fireEvent.press(del);

    await waitFor(() => expect(mockNotesDelete).toHaveBeenCalledWith('n1'));
    await waitFor(() => expect(mockNotesList.mock.calls.length).toBeGreaterThan(listCallsBefore));
  });
});
