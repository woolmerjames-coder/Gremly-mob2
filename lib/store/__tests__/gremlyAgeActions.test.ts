/**
 * gremlyAgeActions.test.ts
 *
 * Tests for Gremly aging mechanic store actions.
 * These actions handle the ritual progress system: 3 drops + 3 sweeps = age up.
 */

// Mock getRitualDay BEFORE importing the store (Jest hoists this)
jest.mock('../../date/ritualDay', () => ({
  getRitualDay: jest.fn(() => '2026-01-10'),
  getDayBoundaryLabel: jest.fn((hour: number) => `${hour}:00 AM`),
  isInLateNightPeriod: jest.fn(() => false),
  getHoursUntilDayBoundary: jest.fn(() => 4),
  DAY_BOUNDARY_OPTIONS: [
    { value: 0, label: 'Midnight' },
    { value: 3, label: '3:00 AM' },
    { value: 4, label: '4:00 AM' },
    { value: 5, label: '5:00 AM' },
  ],
}));

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

import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../useGremlyStore';
import { supabase } from '../../supabase/client';

describe('Gremly Age Store Actions', () => {
  const mockRpc = supabase.rpc as jest.Mock;
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-10T10:00:00Z'));

    // Reset store state
    useGremlyStore.setState({
      userId: 'user-123',
      gremlyAge: 5,
      gremlyAgeLastIncrementedAt: null,
      dayBoundaryHour: 4,
      userTimezone: 'UTC',
      todayDropsCount: 0,
      todaySweepsCount: 0,
      todayRitualDay: '2026-01-10',
      todayRitualCompletedAt: null,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // incrementDropCount
  // ─────────────────────────────────────────────────────────────────────────

  describe('incrementDropCount', () => {
    it('calls increment_drop_count RPC with correct params', async () => {
      mockRpc.mockResolvedValueOnce({ data: { drops_count: 1 }, error: null });
      // Mock checkAndIncrementAge call
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: false, new_age: 5 }],
        error: null,
      });

      await act(async () => {
        await useGremlyStore.getState().incrementDropCount();
      });

      // Verify RPC was called with correct function name and owner_id
      // Note: p_ritual_day is computed dynamically via getRitualDay()
      expect(mockRpc).toHaveBeenCalledWith(
        'increment_drop_count',
        expect.objectContaining({
          p_owner_id: 'user-123',
        }),
      );
    });

    it('updates local todayDropsCount on success', async () => {
      mockRpc.mockResolvedValueOnce({ data: { drops_count: 2 }, error: null });
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: false, new_age: 5 }],
        error: null,
      });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementDropCount();
        expect(result.dropsCount).toBe(2);
      });

      expect(useGremlyStore.getState().todayDropsCount).toBe(2);
    });

    it('returns current count if no userId', async () => {
      useGremlyStore.setState({ userId: null, todayDropsCount: 3 });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementDropCount();
        expect(result.dropsCount).toBe(0);
        expect(result.didAgeUp).toBe(false);
      });

      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('returns current count on RPC error', async () => {
      useGremlyStore.setState({ todayDropsCount: 2 });
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC failed' } });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementDropCount();
        expect(result.dropsCount).toBe(2);
        expect(result.didAgeUp).toBe(false);
      });
    });

    it('triggers checkAndIncrementAge after incrementing', async () => {
      mockRpc.mockResolvedValueOnce({ data: { drops_count: 3 }, error: null });
      // This call is for checkAndIncrementAge
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: true, new_age: 6 }],
        error: null,
      });
      useGremlyStore.setState({ todaySweepsCount: 3 }); // Already have 3 sweeps

      await act(async () => {
        const result = await useGremlyStore.getState().incrementDropCount();
        expect(result.didAgeUp).toBe(true);
        expect(result.newAge).toBe(6);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // incrementSweepCount
  // ─────────────────────────────────────────────────────────────────────────

  describe('incrementSweepCount', () => {
    it('calls increment_sweep_count RPC with correct params', async () => {
      mockRpc.mockResolvedValueOnce({ data: { sweeps_count: 1 }, error: null });
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: false, new_age: 5 }],
        error: null,
      });

      await act(async () => {
        await useGremlyStore.getState().incrementSweepCount();
      });

      // Verify RPC was called with correct function name and owner_id
      // Note: p_ritual_day is computed dynamically via getRitualDay()
      expect(mockRpc).toHaveBeenCalledWith(
        'increment_sweep_count',
        expect.objectContaining({
          p_owner_id: 'user-123',
        }),
      );
    });

    it('updates local todaySweepsCount on success', async () => {
      mockRpc.mockResolvedValueOnce({ data: { sweeps_count: 2 }, error: null });
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: false, new_age: 5 }],
        error: null,
      });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementSweepCount();
        expect(result.sweepsCount).toBe(2);
      });

      expect(useGremlyStore.getState().todaySweepsCount).toBe(2);
    });

    it('returns current count if no userId', async () => {
      useGremlyStore.setState({ userId: null, todaySweepsCount: 2 });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementSweepCount();
        expect(result.sweepsCount).toBe(0);
        expect(result.didAgeUp).toBe(false);
      });

      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('returns current count on RPC error', async () => {
      useGremlyStore.setState({ todaySweepsCount: 1 });
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC failed' } });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementSweepCount();
        expect(result.sweepsCount).toBe(1);
        expect(result.didAgeUp).toBe(false);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // checkAndIncrementAge
  // ─────────────────────────────────────────────────────────────────────────

  describe('checkAndIncrementAge', () => {
    it('calls check_and_increment_gremly_age RPC', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: false, new_age: 5 }],
        error: null,
      });

      await act(async () => {
        await useGremlyStore.getState().checkAndIncrementAge();
      });

      // Verify RPC was called with correct function name and owner_id
      // Note: p_ritual_day is computed dynamically via getRitualDay()
      expect(mockRpc).toHaveBeenCalledWith(
        'check_and_increment_gremly_age',
        expect.objectContaining({
          p_owner_id: 'user-123',
        }),
      );
    });

    it('returns didAgeUp: false if ritual not complete', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: false, new_age: 5 }],
        error: null,
      });

      await act(async () => {
        const result = await useGremlyStore.getState().checkAndIncrementAge();
        expect(result.didAgeUp).toBe(false);
        expect(result.newAge).toBe(5);
      });

      expect(useGremlyStore.getState().gremlyAge).toBe(5);
    });

    it('updates gremlyAge and sets completedAt when ritual completes', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: true, new_age: 6 }],
        error: null,
      });

      await act(async () => {
        const result = await useGremlyStore.getState().checkAndIncrementAge();
        expect(result.didAgeUp).toBe(true);
        expect(result.newAge).toBe(6);
      });

      const state = useGremlyStore.getState();
      expect(state.gremlyAge).toBe(6);
      expect(state.gremlyAgeLastIncrementedAt).toBeTruthy();
      expect(state.todayRitualCompletedAt).toBeTruthy();
    });

    it('returns early if ritual already completed today', async () => {
      useGremlyStore.setState({ todayRitualCompletedAt: '2026-01-10T08:00:00Z' });

      await act(async () => {
        const result = await useGremlyStore.getState().checkAndIncrementAge();
        expect(result.didAgeUp).toBe(false);
      });

      // Should not have called RPC
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('returns current age if no userId', async () => {
      useGremlyStore.setState({ userId: null });

      await act(async () => {
        const result = await useGremlyStore.getState().checkAndIncrementAge();
        expect(result.didAgeUp).toBe(false);
        expect(result.newAge).toBe(5);
      });

      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('handles RPC error gracefully', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC failed' } });

      await act(async () => {
        const result = await useGremlyStore.getState().checkAndIncrementAge();
        expect(result.didAgeUp).toBe(false);
        expect(result.newAge).toBe(5);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // setDayBoundaryHour
  // ─────────────────────────────────────────────────────────────────────────

  describe('setDayBoundaryHour', () => {
    let mockUpsert: jest.Mock;

    beforeEach(() => {
      mockUpsert = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({
        upsert: mockUpsert,
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });
    });

    it('calls upsert with day_boundary_hour', async () => {
      await act(async () => {
        await useGremlyStore.getState().setDayBoundaryHour(3);
      });

      expect(mockFrom).toHaveBeenCalledWith('cortex_preferences');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_id: 'user-123',
          day_boundary_hour: 3,
        }),
        { onConflict: 'owner_id' },
      );
    });

    it('updates local dayBoundaryHour on success', async () => {
      await act(async () => {
        await useGremlyStore.getState().setDayBoundaryHour(5);
      });

      expect(useGremlyStore.getState().dayBoundaryHour).toBe(5);
    });

    it('does nothing if no userId', async () => {
      useGremlyStore.setState({ userId: null });

      await act(async () => {
        await useGremlyStore.getState().setDayBoundaryHour(3);
      });

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('does not update local state on error', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'DB error' } });

      await act(async () => {
        await useGremlyStore.getState().setDayBoundaryHour(5);
      });

      // Should remain at original value
      expect(useGremlyStore.getState().dayBoundaryHour).toBe(4);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration: Full ritual flow
  // ─────────────────────────────────────────────────────────────────────────

  describe('Full ritual flow', () => {
    it('ages up after 3 drops + 3 sweeps', async () => {
      // Simulate incremental drops
      for (let i = 1; i <= 3; i++) {
        mockRpc.mockResolvedValueOnce({ data: { drops_count: i }, error: null });
        mockRpc.mockResolvedValueOnce({
          data: [{ did_age_up: false, new_age: 5 }],
          error: null,
        });

        await act(async () => {
          await useGremlyStore.getState().incrementDropCount();
        });
      }

      expect(useGremlyStore.getState().todayDropsCount).toBe(3);

      // Simulate 2 sweeps (not complete yet)
      for (let i = 1; i <= 2; i++) {
        mockRpc.mockResolvedValueOnce({ data: { sweeps_count: i }, error: null });
        mockRpc.mockResolvedValueOnce({
          data: [{ did_age_up: false, new_age: 5 }],
          error: null,
        });

        await act(async () => {
          await useGremlyStore.getState().incrementSweepCount();
        });
      }

      // 3rd sweep should trigger age-up
      mockRpc.mockResolvedValueOnce({ data: { sweeps_count: 3 }, error: null });
      mockRpc.mockResolvedValueOnce({
        data: [{ did_age_up: true, new_age: 6 }],
        error: null,
      });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementSweepCount();
        expect(result.didAgeUp).toBe(true);
        expect(result.newAge).toBe(6);
      });

      expect(useGremlyStore.getState().gremlyAge).toBe(6);
      expect(useGremlyStore.getState().todayRitualCompletedAt).toBeTruthy();
    });
  });
});
