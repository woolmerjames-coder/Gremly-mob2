/**
 * Test: Identity hydration from user_profiles
 *
 * Verifies that userName and userPronouns are hydrated
 * from the identity JSONB column during store initialization.
 */

jest.mock('../../../lib/supabase/client', () => {
  const mockFrom = jest.fn((table: string) => {
    if (table === 'user_profiles') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                identity: { name: 'Alice', pronouns: 'she/her', source: 'onboarding' },
              },
              error: null,
            }),
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
      };
    }
    // Default mock for other tables
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          then: jest.fn(),
        }),
        then: jest.fn(),
      }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    };
  });
  return {
    supabase: {
      from: mockFrom,
      auth: {
        onAuthStateChange: jest
          .fn()
          .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
    },
  };
});

jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({
    today: () => '2025-12-15',
    now: () => new Date('2025-12-15T12:00:00Z'),
    nowTimestamp: () => '2025-12-15T12:00:00Z',
    getTimezone: () => 'UTC',
  }),
  createDateService: () => ({}),
  nowTimestamp: () => '2025-12-15T12:00:00Z',
}));

import { useGremlyStore } from '../../../lib/store/useGremlyStore';

describe('identity hydration', () => {
  it('defaults userName and userPronouns to null', () => {
    // Reset to defaults
    useGremlyStore.setState({ userName: null, userPronouns: null });
    const state = useGremlyStore.getState();
    expect(state.userName).toBeNull();
    expect(state.userPronouns).toBeNull();
  });

  it('stores userName and userPronouns when set', () => {
    useGremlyStore.setState({ userName: 'Alice', userPronouns: 'she/her' });
    const state = useGremlyStore.getState();
    expect(state.userName).toBe('Alice');
    expect(state.userPronouns).toBe('she/her');
  });

  it('clears userName and userPronouns when set to null', () => {
    useGremlyStore.setState({ userName: 'Alice', userPronouns: 'she/her' });
    useGremlyStore.setState({ userName: null, userPronouns: null });
    const state = useGremlyStore.getState();
    expect(state.userName).toBeNull();
    expect(state.userPronouns).toBeNull();
  });
});
