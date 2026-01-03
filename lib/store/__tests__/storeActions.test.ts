/**
 * Tests for useGremlyStore actions
 *
 * Tests the Zustand store actions added/modified on today-page-tweaks-jan-2 branch.
 * Note: These tests verify local state updates. Database operations are mocked.
 */

import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../useGremlyStore';
import type { Habit } from '../../types';

// Mock Supabase
jest.mock('../../supabase/client', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn().mockResolvedValue({ error: null }),
    })),
    auth: {
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: `habit-${Math.random().toString(36).slice(2)}`,
    type: 'habit',
    name: 'Test Habit',
    owner_id: 'user-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
    ai_placed: false,
    tags: [],
    ...overrides,
  } as Habit;
}

describe('useGremlyStore actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T10:00:00Z'));

    // Reset store state with userId so actions work
    useGremlyStore.setState({
      habits: [],
      habitProgress: [],
      miniSweepLastCompletedAt: null,
      userId: 'user-1', // Required for actions to work
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('checkInHabit', () => {
    it('updates last_checked_in_at for the habit in local state', async () => {
      const habit = makeHabit({ id: 'habit-1', last_checked_in_at: null });
      useGremlyStore.setState({ habits: [habit] });

      await act(async () => {
        await useGremlyStore.getState().checkInHabit('habit-1');
      });

      const updatedHabit = useGremlyStore.getState().habits.find((h) => h.id === 'habit-1');
      expect(updatedHabit?.last_checked_in_at).toBeTruthy();
      // Should be set to current time
      expect(updatedHabit?.last_checked_in_at?.startsWith('2025-12-15')).toBe(true);
    });

    it('only updates the targeted habit, not others', async () => {
      const habit1 = makeHabit({ id: 'habit-1', last_checked_in_at: null });
      const habit2 = makeHabit({ id: 'habit-2', last_checked_in_at: null });
      useGremlyStore.setState({ habits: [habit1, habit2] });

      await act(async () => {
        await useGremlyStore.getState().checkInHabit('habit-1');
      });

      const habits = useGremlyStore.getState().habits;
      expect(habits.find((h) => h.id === 'habit-1')?.last_checked_in_at).toBeTruthy();
      expect(habits.find((h) => h.id === 'habit-2')?.last_checked_in_at).toBeNull();
    });

    it('overwrites previous last_checked_in_at value', async () => {
      const oldTimestamp = '2025-12-10T08:00:00Z';
      const habit = makeHabit({ id: 'habit-1', last_checked_in_at: oldTimestamp });
      useGremlyStore.setState({ habits: [habit] });

      await act(async () => {
        await useGremlyStore.getState().checkInHabit('habit-1');
      });

      const updatedHabit = useGremlyStore.getState().habits.find((h) => h.id === 'habit-1');
      expect(updatedHabit?.last_checked_in_at).not.toBe(oldTimestamp);
      expect(updatedHabit?.last_checked_in_at?.startsWith('2025-12-15')).toBe(true);
    });
  });

  describe('markMiniSweepCompleted', () => {
    // Note: markMiniSweepCompleted primarily makes a Supabase upsert call to cortex_preferences.
    // The local state update (miniSweepLastCompletedAt) happens based on DB response.
    // Full testing of this action would require integration tests or e2e tests.
    // The useMiniSweepGate hook tests cover the UI flow that calls this action.
    it.skip('is covered by useMiniSweepGate hook tests and integration tests', () => {
      // See lib/today/hooks/__tests__/useMiniSweepGate.test.ts
    });
  });
});
