import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { useSpaceSearch, type SearchItem } from '../../hooks/useSpaceSearch';

const mockListBySpace = jest.fn();

jest.mock('../../providers/RepoProvider', () => ({
  useRepo: () => ({
    listBySpace: mockListBySpace,
  }),
}));

jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}));

type SearchFn = (query: string, filter: 'chats' | 'notes' | 'habits') => Promise<SearchItem[]>;

const Harness: React.FC<{ onReady: (search: SearchFn) => void }> = ({ onReady }) => {
  const { search } = useSpaceSearch('space-1');

  React.useEffect(() => {
    onReady(search);
  }, [onReady, search]);

  return null;
};

describe('useSpaceSearch tag queries', () => {
  beforeEach(() => {
    mockListBySpace.mockReset();
  });

  test('tag-prefixed query matches notes by tag', async () => {
    mockListBySpace.mockResolvedValue([
      {
        id: 'note-1',
        type: 'note',
        title: 'Deep work log',
        body: 'Planning session',
        tags: ['#Focus', '*project'],
      },
      {
        id: 'note-2',
        type: 'note',
        title: 'General tasks',
        body: 'Focus on chores',
        tags: ['#chores'],
      },
      {
        id: 'habit-1',
        type: 'habit',
        name: 'Morning stretch',
        tags: ['#health'],
      },
    ]);

    let searchFn: SearchFn | undefined;
    render(
      React.createElement(Harness, {
        onReady: (fn: SearchFn) => {
          searchFn = fn;
        },
      }),
    );

    await waitFor(() => expect(searchFn).toBeDefined());

    const results = await searchFn!('#Focus', 'notes');

    expect(mockListBySpace).toHaveBeenCalledWith('space-1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('note-1');
  });
});
