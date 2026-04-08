/**
 * Tests for useGremlyStore.setUserProfile
 */

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockUpsert = jest.fn();
jest.mock('../../../lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'user_profiles') {
        return { select: mockSelect, upsert: mockUpsert };
      }
      return { upsert: jest.fn().mockResolvedValue({ error: null }) };
    },
  },
}));

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

describe('setUserProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { identity: {} }, error: null });
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockUpsert.mockResolvedValue({ error: null });
    useGremlyStore.setState({
      userId: 'user-1',
      userName: null,
      userPronouns: null,
    });
  });

  it('updates userName and userPronouns in state', async () => {
    await useGremlyStore.getState().setUserProfile('Alice', 'she/her');
    const state = useGremlyStore.getState();
    expect(state.userName).toBe('Alice');
    expect(state.userPronouns).toBe('she/her');
  });

  it('merges identity with existing profile data', async () => {
    await useGremlyStore.getState().setUserProfile('Bob', 'he/him');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        identity: expect.objectContaining({
          name: 'Bob',
          pronouns: 'he/him',
          source: 'onboarding',
        }),
      }),
      { onConflict: 'user_id' },
    );
  });

  it('handles null name and pronouns', async () => {
    await useGremlyStore.getState().setUserProfile(null, null);
    const state = useGremlyStore.getState();
    expect(state.userName).toBeNull();
    expect(state.userPronouns).toBeNull();
  });

  it('does not call Supabase if no userId', async () => {
    useGremlyStore.setState({ userId: null });
    await useGremlyStore.getState().setUserProfile('Alice', 'she/her');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
