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
  const { getRitualDay } = require('../../date/ritualDay');

  // Per-RPC-name response queues for deterministic test mocking.
  // Tests push responses with mockRpcResponse(name, response).
  // The mock implementation dispatches by RPC name, avoiding ordering issues
  // caused by fire-and-forget gauge calls consuming responses meant for other RPCs.
  const rpcQueues: Record<string, Array<{ data: any; error: any }>> = {};

  function mockRpcResponse(name: string, response: { data: any; error: any }) {
    if (!rpcQueues[name]) rpcQueues[name] = [];
    rpcQueues[name].push(response);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-10T10:00:00Z'));

    // Restore getRitualDay mock after clearAllMocks
    (getRitualDay as jest.Mock).mockReturnValue('2026-01-10');

    // Clear per-RPC queues
    Object.keys(rpcQueues).forEach((k) => delete rpcQueues[k]);

    // Route-aware RPC mock: dispatches by RPC name to avoid ordering issues
    // from fire-and-forget gauge calls consuming responses meant for other RPCs.
    mockRpc.mockImplementation((name: string) => {
      if (rpcQueues[name]?.length) {
        return Promise.resolve(rpcQueues[name].shift()!);
      }
      // Default responses for feeding gauge RPCs (fire-and-forget, not under test)
      if (name === 'update_feeding_gauge') {
        return Promise.resolve({
          data: [{ new_gauge_value: 0, new_is_fed: false }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    // Restore supabase.from mock (clearAllMocks clears inline implementations)
    mockFrom.mockImplementation(() => ({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }));

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
      feedingGaugeValue: 0,
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
      mockRpcResponse('increment_drop_count', { data: { drops_count: 1 }, error: null });
      // Mock checkAndIncrementAge call
      mockRpcResponse('check_and_increment_gremly_age', {
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
      mockRpcResponse('increment_drop_count', { data: { drops_count: 2 }, error: null });
      mockRpcResponse('check_and_increment_gremly_age', {
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
      useGremlyStore.setState({ todayDropsCount: 2, todayRitualDay: '2026-01-10' });
      mockRpcResponse('increment_drop_count', { data: null, error: { message: 'RPC failed' } });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementDropCount();
        expect(result.dropsCount).toBe(2);
        expect(result.didAgeUp).toBe(false);
      });
    });

    it('returns didAgeUp false (age-up handled by feeding gauge)', async () => {
      mockRpcResponse('increment_drop_count', { data: { drops_count: 3 }, error: null });
      useGremlyStore.setState({ todaySweepsCount: 3, todayRitualDay: '2026-01-10' });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementDropCount();
        // Soul Document v8: age-ups flow through feeding gauge, not incrementDropCount
        expect(result.didAgeUp).toBe(false);
        expect(result.dropsCount).toBe(3);
      });
    });

    it('resets ritual progress when day boundary is crossed', async () => {
      // Set up state from "yesterday"
      useGremlyStore.setState({
        todayDropsCount: 2,
        todaySweepsCount: 3,
        todayRitualDay: '2026-01-09', // Yesterday
        todayRitualCompletedAt: '2026-01-09T22:00:00Z', // Completed yesterday
      });

      // Mock getRitualDay to return "today" (different from stored '2026-01-09')
      (getRitualDay as jest.Mock).mockReturnValueOnce('2026-01-10');

      mockRpcResponse('increment_drop_count', { data: { drops_count: 1 }, error: null });
      mockRpcResponse('check_and_increment_gremly_age', {
        data: [{ did_age_up: false, new_age: 5 }],
        error: null,
      });

      await act(async () => {
        await useGremlyStore.getState().incrementDropCount();
      });

      // State should have been reset before RPC call
      const state = useGremlyStore.getState();
      expect(state.todayRitualDay).toBe('2026-01-10');
      expect(state.todayRitualCompletedAt).toBeNull(); // CRITICAL: allows aging again
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // incrementSweepCount
  // ─────────────────────────────────────────────────────────────────────────

  describe('incrementSweepCount', () => {
    it('calls increment_sweep_count RPC with correct params', async () => {
      mockRpcResponse('increment_sweep_count', { data: { sweeps_count: 1 }, error: null });
      mockRpcResponse('check_and_increment_gremly_age', {
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
      mockRpcResponse('increment_sweep_count', { data: { sweeps_count: 2 }, error: null });
      mockRpcResponse('check_and_increment_gremly_age', {
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
      useGremlyStore.setState({ todaySweepsCount: 1, todayRitualDay: '2026-01-10' });
      mockRpcResponse('increment_sweep_count', { data: null, error: { message: 'RPC failed' } });

      await act(async () => {
        const result = await useGremlyStore.getState().incrementSweepCount();
        expect(result.sweepsCount).toBe(1);
        expect(result.didAgeUp).toBe(false);
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

    it('updates local state even on upsert error (local-first)', async () => {
      mockUpsert.mockResolvedValueOnce({ error: { message: 'DB error' } });

      await act(async () => {
        await useGremlyStore.getState().setDayBoundaryHour(5);
      });

      // Local-first: state is updated before the upsert call
      expect(useGremlyStore.getState().dayBoundaryHour).toBe(5);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration: Full ritual flow
  // ─────────────────────────────────────────────────────────────────────────

  describe('Full ritual flow', () => {
    it('tracks drops and sweeps without direct age-up (gauge handles it)', async () => {
      // Simulate incremental drops
      for (let i = 1; i <= 3; i++) {
        mockRpcResponse('increment_drop_count', { data: { drops_count: i }, error: null });

        await act(async () => {
          await useGremlyStore.getState().incrementDropCount();
        });
      }

      expect(useGremlyStore.getState().todayDropsCount).toBe(3);

      // Simulate 3 sweeps
      for (let i = 1; i <= 3; i++) {
        mockRpcResponse('increment_sweep_count', { data: { sweeps_count: i }, error: null });

        await act(async () => {
          const result = await useGremlyStore.getState().incrementSweepCount();
          // Soul Document v8: age-ups flow through feeding gauge, not increment functions
          expect(result.didAgeUp).toBe(false);
        });
      }

      expect(useGremlyStore.getState().todaySweepsCount).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // firstTodayVisitCompletedAt initialization
  // ─────────────────────────────────────────────────────────────────────────

  describe('firstTodayVisitCompletedAt', () => {
    it('defaults to null in initial state', () => {
      useGremlyStore.setState({ firstTodayVisitCompletedAt: null });
      expect(useGremlyStore.getState().firstTodayVisitCompletedAt).toBeNull();
    });

    it('can store a timestamp value', () => {
      const timestamp = '2026-01-10T15:30:00Z';
      useGremlyStore.setState({ firstTodayVisitCompletedAt: timestamp });
      expect(useGremlyStore.getState().firstTodayVisitCompletedAt).toBe(timestamp);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addGaugeContribution (atomic RPC)
  // ─────────────────────────────────────────────────────────────────────────

  describe('addGaugeContribution', () => {
    it('calls update_gauge_atomic RPC with correct params', async () => {
      // Set graduated so no pre-graduation multiplier applies
      useGremlyStore.setState({ graduatedAt: '2025-12-01T00:00:00Z' });

      mockRpcResponse('update_gauge_atomic', {
        data: [
          {
            new_gauge_value: 0.08,
            just_fed: false,
            is_fed: false,
            new_fed_days_count: 0,
            did_age_up: false,
            new_age: 5,
            new_tier: 'Sprout',
          },
        ],
        error: null,
      });

      await act(async () => {
        await useGremlyStore.getState().addGaugeContribution('drop', 0.08);
      });

      expect(mockRpc).toHaveBeenCalledWith('update_gauge_atomic', {
        p_owner_id: 'user-123',
        p_ritual_day: '2026-01-10',
        p_source: 'drop',
        p_value: 0.08,
      });
    });

    it('updates feedingGaugeValue from server response', async () => {
      mockRpcResponse('update_gauge_atomic', {
        data: [
          {
            new_gauge_value: 0.42,
            just_fed: false,
            is_fed: false,
            new_fed_days_count: 3,
            did_age_up: false,
            new_age: 5,
            new_tier: 'Sprout',
          },
        ],
        error: null,
      });

      await act(async () => {
        const result = await useGremlyStore.getState().addGaugeContribution('drop', 0.08);
        expect(result.newValue).toBe(0.42);
        expect(result.justFed).toBe(false);
      });

      expect(useGremlyStore.getState().feedingGaugeValue).toBe(0.42);
    });

    it('returns early with no userId', async () => {
      useGremlyStore.setState({ userId: null });

      await act(async () => {
        const result = await useGremlyStore.getState().addGaugeContribution('drop', 0.08);
        expect(result.newValue).toBe(0);
        expect(result.justFed).toBe(false);
      });

      expect(mockRpc).not.toHaveBeenCalledWith('update_gauge_atomic', expect.anything());
    });

    it('handles did_age_up by updating gremlyAge', async () => {
      mockRpcResponse('update_gauge_atomic', {
        data: [
          {
            new_gauge_value: 1.0,
            just_fed: true,
            is_fed: true,
            new_fed_days_count: 5,
            did_age_up: true,
            new_age: 6,
            new_tier: 'Sprout',
          },
        ],
        error: null,
      });

      await act(async () => {
        await useGremlyStore.getState().addGaugeContribution('sweep', 0.15);
      });

      expect(useGremlyStore.getState().gremlyAge).toBe(6);
    });

    it('applies pre-graduation multiplier', async () => {
      useGremlyStore.setState({ graduatedAt: null });

      mockRpcResponse('update_gauge_atomic', {
        data: [
          {
            new_gauge_value: 0.1,
            just_fed: false,
            is_fed: false,
            new_fed_days_count: 0,
            did_age_up: false,
            new_age: 5,
            new_tier: 'Sprout',
          },
        ],
        error: null,
      });

      await act(async () => {
        await useGremlyStore.getState().addGaugeContribution('drop', 0.08);
      });

      // Should send 0.08 * 1.25 = 0.1
      expect(mockRpc).toHaveBeenCalledWith(
        'update_gauge_atomic',
        expect.objectContaining({
          p_value: 0.1,
        }),
      );
    });

    it('handles RPC error gracefully', async () => {
      useGremlyStore.setState({ feedingGaugeValue: 0.5 });

      mockRpcResponse('update_gauge_atomic', {
        data: null,
        error: { message: 'RPC failed' },
      });

      await act(async () => {
        const result = await useGremlyStore.getState().addGaugeContribution('drop', 0.08);
        expect(result.newValue).toBe(0.5); // Keeps current value
        expect(result.justFed).toBe(false);
      });
    });
  });
});
