import { renderHook, waitFor } from '@testing-library/react-native';

// Mocks must be declared before importing the hook under test
jest.mock('../providers/RepoProvider', () => ({
  useRepo: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

// Silence supabase client init logs in tests
jest.mock('../lib/supabase/client', () => ({
  supabase: {
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }) }),
    }),
    removeChannel: () => {},
  },
}));

import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';
import { useSpaceAggregate } from '../hooks/useSpaceAggregate';

describe('useSpaceAggregate (smoke)', () => {
  beforeEach(() => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: 'user-1' } });
    (useRepo as jest.Mock).mockReturnValue({
      getSpaceById: jest.fn().mockResolvedValue(null),
      listBySpace: jest.fn().mockResolvedValue([]),
    });
    process.env.EXPO_PUBLIC_REPO_BACKEND = 'memory';
  });

  it('returns default shapes', async () => {
    const { result } = renderHook(() => useSpaceAggregate('space-1'));

    await waitFor(() => {
      expect(result.current).toBeTruthy();
      expect(result.current.space).toBeNull();
      expect(Array.isArray(result.current.items)).toBe(true);
      expect(Array.isArray(result.current.chats)).toBe(true);
      expect(typeof result.current.stats.todosOpen).toBe('number');
      expect(Array.isArray(result.current.upcoming)).toBe(true);
      expect(typeof result.current.reload).toBe('function');
    });
  });
});
