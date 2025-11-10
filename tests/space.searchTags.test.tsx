import React from 'react';
import { renderWithProviders, waitFor } from './utils/renderWithProviders';
import { useSpaceSearch } from '../hooks/useSpaceSearch';

jest.mock('../providers/AuthProvider', () => ({
  ...jest.requireActual('../providers/AuthProvider'),
  useAuth: () => require('./utils/renderWithProviders').useAuth(),
}));

jest.mock('../providers/RepoProvider', () => ({
  ...jest.requireActual('../providers/RepoProvider'),
  useRepo: () => require('./utils/renderWithProviders').useRepo(),
}));

type Filter = 'chats' | 'notes' | 'habits';

type HarnessProps = {
  spaceId: string;
  query: string;
  filter: Filter;
  onResult: (items: Awaited<ReturnType<ReturnType<typeof useSpaceSearch>['search']>>) => void;
};

function SearchHarness({ spaceId, query, filter, onResult }: HarnessProps) {
  const { search } = useSpaceSearch(spaceId);

  React.useEffect(() => {
    let cancelled = false;

    search(query, filter).then((items) => {
      if (!cancelled) {
        onResult(items);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [search, query, filter, onResult]);

  return null;
}

describe('useSpaceSearch tag queries', () => {
  test('tag-prefixed query filters by tags only', async () => {
    const now = new Date().toISOString();
    const taggedNote = {
      id: 'note-1',
      type: 'note' as const,
      subtype: 'idea' as const,
      title: 'Morning Routine',
      body: 'Stretch and hydrate',
      tags: ['#Health'],
      ai_placed: false,
      why_string: null,
      origin: null,
      created_at: now,
      updated_at: now,
      owner_id: 'user-1',
      space_id: 'space-1',
    };
    const untaggedNote = {
      id: 'note-2',
      type: 'note' as const,
      subtype: 'idea' as const,
      title: 'Health checklist',
      body: 'All the supplements to take',
      tags: [],
      ai_placed: false,
      why_string: null,
      origin: null,
      created_at: now,
      updated_at: now,
      owner_id: 'user-1',
      space_id: 'space-1',
    };

    const listBySpace = jest.fn().mockResolvedValue([taggedNote, untaggedNote]);
    const onResult = jest.fn();

    renderWithProviders(
      <SearchHarness spaceId="space-1" query="#health" filter="notes" onResult={onResult} />,
      {
        repo: {
          listBySpace,
        },
      },
    );

    await waitFor(() => expect(onResult).toHaveBeenCalled());

    const [results] = onResult.mock.calls[0];
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('note-1');
    expect(results[0].title).toBe('Morning Routine');

    expect(listBySpace).toHaveBeenCalledWith('space-1');
  });
});
