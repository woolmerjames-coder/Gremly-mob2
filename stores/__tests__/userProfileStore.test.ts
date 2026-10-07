/**
 * Tests for userProfileStore - Zustand store for user profile management
 */

import { act } from '@testing-library/react-native';
import { useUserProfileStore } from '../userProfileStore';

// Mock Supabase client
const mockUser = { id: 'test-user-123' };
const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockOrder = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();

jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: (table: string) => mockFrom(table),
  },
}));

// Forget Everything goes through Cortex (workers/cortex/context/forget.js)
const mockForgetMe = jest.fn();
jest.mock('../../lib/cortex/CortexClient', () => ({
  callForgetMe: () => mockForgetMe(),
}));

// Helper to build chainable mock
function buildChainableMock(data: unknown, error: unknown = null) {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data, error }),
        order: jest.fn().mockResolvedValue({ data, error }),
      }),
      single: jest.fn().mockResolvedValue({ data, error }),
    }),
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data, error }),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error }),
    }),
  };
}

describe('userProfileStore', () => {
  beforeEach(() => {
    // Reset store state
    useUserProfileStore.setState({
      profile: null,
      overrides: [],
      isLoading: false,
      error: null,
    });

    // Reset mocks
    jest.clearAllMocks();

    // Default: authenticated user
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
  });

  describe('initial state', () => {
    it('has correct initial state', () => {
      const state = useUserProfileStore.getState();

      expect(state.profile).toBeNull();
      expect(state.overrides).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('fetchProfile', () => {
    it('sets isLoading true while fetching', async () => {
      const profileData = {
        profile_text: 'Test profile',
        signals: { facts: ['fact1'], overrides_applied: 0 },
        generated_at: '2026-01-01T00:00:00Z',
        relationship_started_at: '2025-12-01T00:00:00Z',
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return buildChainableMock(profileData);
        }
        if (table === 'user_profile_overrides') {
          return buildChainableMock([]);
        }
        return buildChainableMock(null);
      });

      const { fetchProfile } = useUserProfileStore.getState();

      // Check loading is set
      const fetchPromise = fetchProfile();
      expect(useUserProfileStore.getState().isLoading).toBe(true);

      await fetchPromise;
      expect(useUserProfileStore.getState().isLoading).toBe(false);
    });

    it('normalizes profile data correctly', async () => {
      const profileData = {
        profile_text: 'Test profile text',
        signals: {
          facts: ['I like coffee', 'I have a dog'],
          overrides_applied: 2,
        },
        generated_at: '2026-01-15T00:00:00Z',
        relationship_started_at: '2025-11-01T00:00:00Z',
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return buildChainableMock(profileData);
        }
        if (table === 'user_profile_overrides') {
          return buildChainableMock([]);
        }
        return buildChainableMock(null);
      });

      await act(async () => {
        await useUserProfileStore.getState().fetchProfile();
      });

      const { profile } = useUserProfileStore.getState();

      expect(profile).toEqual({
        profileText: 'Test profile text',
        facts: ['I like coffee', 'I have a dog'],
        generatedAt: '2026-01-15T00:00:00Z',
        relationshipStartedAt: '2025-11-01T00:00:00Z',
        overridesApplied: 2,
        identity: {},
      });
    });

    it('handles missing profile (new user)', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return buildChainableMock(null);
        }
        if (table === 'user_profile_overrides') {
          return buildChainableMock([]);
        }
        return buildChainableMock(null);
      });

      await act(async () => {
        await useUserProfileStore.getState().fetchProfile();
      });

      const { profile } = useUserProfileStore.getState();

      expect(profile).toEqual({
        profileText: null,
        facts: [],
        generatedAt: null,
        relationshipStartedAt: null,
        overridesApplied: 0,
        identity: {},
      });
    });

    it('fetches overrides correctly', async () => {
      const overridesData = [
        { id: '1', action: 'add', fact_text: 'Added fact', created_at: '2026-01-20T00:00:00Z' },
        {
          id: '2',
          action: 'remove',
          fact_text: 'Removed fact',
          created_at: '2026-01-19T00:00:00Z',
        },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'user_profiles') {
          return buildChainableMock(null);
        }
        if (table === 'user_profile_overrides') {
          return buildChainableMock(overridesData);
        }
        return buildChainableMock(null);
      });

      await act(async () => {
        await useUserProfileStore.getState().fetchProfile();
      });

      const { overrides } = useUserProfileStore.getState();

      expect(overrides).toHaveLength(2);
      expect(overrides[0].action).toBe('add');
      expect(overrides[1].action).toBe('remove');
    });

    it('sets error when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });

      await act(async () => {
        await useUserProfileStore.getState().fetchProfile();
      });

      const { error, isLoading } = useUserProfileStore.getState();

      expect(error).toBe('Failed to load profile');
      expect(isLoading).toBe(false);
    });
  });

  describe('addFact', () => {
    it('does nothing for empty fact', async () => {
      await act(async () => {
        await useUserProfileStore.getState().addFact('');
      });

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('does nothing for whitespace-only fact', async () => {
      await act(async () => {
        await useUserProfileStore.getState().addFact('   ');
      });

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('inserts add override and updates local state', async () => {
      const newOverride = {
        id: 'new-1',
        action: 'add',
        fact_text: 'New fact',
        created_at: '2026-01-30T00:00:00Z',
      };

      // Set initial state with a profile
      useUserProfileStore.setState({
        profile: {
          profileText: 'Test',
          facts: ['existing fact'],
          generatedAt: null,
          relationshipStartedAt: null,
          overridesApplied: 0,
          identity: {},
        },
        overrides: [],
      });

      mockFrom.mockImplementation(() => ({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: newOverride, error: null }),
          }),
        }),
      }));

      await act(async () => {
        await useUserProfileStore.getState().addFact('New fact');
      });

      const { profile, overrides } = useUserProfileStore.getState();

      expect(overrides).toHaveLength(1);
      expect(overrides[0].fact_text).toBe('New fact');
      expect(profile?.facts).toContain('New fact');
      expect(profile?.facts).toContain('existing fact');
    });
  });

  describe('removeFact', () => {
    it('deletes add override if fact was user-added', async () => {
      const existingAddOverride = {
        id: 'override-1',
        action: 'add' as const,
        fact_text: 'User added fact',
        created_at: '2026-01-20T00:00:00Z',
      };

      useUserProfileStore.setState({
        profile: {
          profileText: 'Test',
          facts: ['User added fact'],
          generatedAt: null,
          relationshipStartedAt: null,
          overridesApplied: 0,
          identity: {},
        },
        overrides: [existingAddOverride],
      });

      const mockDeleteChain = {
        delete: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };

      mockFrom.mockImplementation(() => mockDeleteChain);

      await act(async () => {
        await useUserProfileStore.getState().removeFact('User added fact');
      });

      const { overrides, profile } = useUserProfileStore.getState();

      expect(overrides).toHaveLength(0);
      expect(profile?.facts).not.toContain('User added fact');
    });

    it('creates remove override for AI-extracted fact', async () => {
      const newRemoveOverride = {
        id: 'remove-1',
        action: 'remove',
        fact_text: 'AI extracted fact',
        created_at: '2026-01-30T00:00:00Z',
      };

      useUserProfileStore.setState({
        profile: {
          profileText: 'Test',
          facts: ['AI extracted fact'],
          generatedAt: null,
          relationshipStartedAt: null,
          overridesApplied: 0,
          identity: {},
        },
        overrides: [], // No existing add override for this fact
      });

      mockFrom.mockImplementation(() => ({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: newRemoveOverride, error: null }),
          }),
        }),
      }));

      await act(async () => {
        await useUserProfileStore.getState().removeFact('AI extracted fact');
      });

      const { overrides, profile } = useUserProfileStore.getState();

      expect(overrides).toHaveLength(1);
      expect(overrides[0].action).toBe('remove');
      expect(overrides[0].fact_text).toBe('AI extracted fact');
      expect(profile?.facts).not.toContain('AI extracted fact');
    });
  });

  describe('forgetEverything', () => {
    const before = () => ({
      profile: {
        profileText: 'Test',
        facts: ['fact1', 'fact2'],
        generatedAt: '2026-01-15T00:00:00Z',
        relationshipStartedAt: '2025-11-01T00:00:00Z',
        overridesApplied: 1,
        identity: { name: 'Alex' },
      },
      overrides: [{ id: '1', action: 'add' as const, fact_text: 'test', created_at: 'now' }],
    });

    it('asks Cortex to forget, then clears what Gremly wrote and keeps who they are', async () => {
      useUserProfileStore.setState(before());
      mockForgetMe.mockResolvedValue({ ok: true, data: { ok: true, forgotten: { facts: 3 } } });

      await act(async () => {
        await useUserProfileStore.getState().forgetEverything();
      });

      const { profile, overrides, isLoading, error } = useUserProfileStore.getState();
      expect(mockForgetMe).toHaveBeenCalledTimes(1);
      expect(profile?.profileText).toBeNull();
      expect(profile?.facts).toEqual([]);
      expect(profile?.identity).toEqual({ name: 'Alex' });
      expect(overrides).toEqual([]);
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
    });

    it('changes nothing on screen when the forget fails, and says so', async () => {
      useUserProfileStore.setState({ ...before(), error: null });
      mockForgetMe.mockResolvedValue({ ok: false, error: 'could not forget' });

      await act(async () => {
        await useUserProfileStore.getState().forgetEverything();
      });

      const { profile, overrides, error } = useUserProfileStore.getState();
      expect(profile?.profileText).toBe('Test');
      expect(overrides).toHaveLength(1);
      expect(error).toBe('Failed to reset profile');
    });
  });

  describe('clearError', () => {
    it('clears the error state', () => {
      useUserProfileStore.setState({ error: 'Some error' });

      useUserProfileStore.getState().clearError();

      expect(useUserProfileStore.getState().error).toBeNull();
    });
  });
});
