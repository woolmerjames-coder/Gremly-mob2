/**
 * Tests for DCO-related store actions
 *
 * Covers fetchTodayDco and patchDcoTodayFocus actions
 * from the app-fixes-2.27 DCO branch.
 *
 * Uses per-test mockFrom.mockReturnValue() to survive resetMocks: true.
 * (Same pattern as firstTodayVisitActions.test.ts)
 */

import { act } from '@testing-library/react-native';
import { useGremlyStore } from '../useGremlyStore';
import { supabase } from '../../supabase/client';
import type { DailyContextObject } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Supabase — minimal shell; per-test config via mockFrom.mockReturnValue
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../../supabase/client', () => ({
  supabase: {
    from: jest.fn(),
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

// Mock date service
jest.mock('../../date', () => ({
  getDateService: () => ({
    getCurrentDate: () => '2025-12-15',
    today: () => '2025-12-15',
    now: () => new Date('2025-12-15T10:00:00'),
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const mockFrom = supabase.from as jest.Mock;

/**
 * Configure the supabase.from() chain for fetchTodayDco:
 *   from().select().eq().eq().maybeSingle() → result
 */
function setupSelectChain(result: { data: unknown; error: unknown }) {
  const mockMaybeSingle = jest.fn().mockResolvedValue(result);
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: mockMaybeSingle,
        }),
      }),
    }),
  });
  return { mockMaybeSingle };
}

/**
 * Configure the supabase.from() chain for patchDcoTodayFocus:
 *   from().update().eq().eq() → result (thenable via mockResolvedValue)
 */
function setupUpdateChain(result: { error: unknown }) {
  mockFrom.mockReturnValue({
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue(result),
      }),
    }),
  });
}

function makeDco(overrides: Partial<DailyContextObject> = {}): DailyContextObject {
  return {
    user_id: 'user-1',
    date: '2025-12-15',
    generated_at: '2025-12-15T06:00:00Z',
    ttl_days: 1,
    life_moment: 'hosting family',
    life_moment_confidence: 'high',
    tone: 'focused',
    brief_headline: 'Big day ahead',
    named_anchors: [{ label: 'Sarah', type: 'person', source: 'drop' }],
    active_today: {
      overdue_todos: 2,
      habit_streak_risk: ['Meditate'],
      upcoming_in_7d: ['Dentist'],
    },
    deltas: {
      drop_velocity: 'normal',
      habit_health: 'high',
      mood_signal: 'positive',
      notable_change: null,
    },
    today_focus: null,
    weekly_digest: null,
    input_sources: ['drops', 'habits'],
    model_used: 'gpt-4.1-mini',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchTodayDco', () => {
  beforeEach(() => {
    act(() => {
      useGremlyStore.setState({ userId: 'user-1', dco: null, dcoLoading: false });
    });
  });

  it('sets dco state on successful fetch', async () => {
    const dco = makeDco();
    setupSelectChain({ data: { dco }, error: null });

    await act(async () => {
      await useGremlyStore.getState().fetchTodayDco();
    });

    const state = useGremlyStore.getState();
    expect(state.dco).toEqual(dco);
    expect(state.dcoLoading).toBe(false);
  });

  it('sets dco to null when no data', async () => {
    setupSelectChain({ data: null, error: null });

    await act(async () => {
      await useGremlyStore.getState().fetchTodayDco();
    });

    expect(useGremlyStore.getState().dco).toBeNull();
    expect(useGremlyStore.getState().dcoLoading).toBe(false);
  });

  it('handles fetch error gracefully', async () => {
    setupSelectChain({ data: null, error: { message: 'Network error' } });

    await act(async () => {
      await useGremlyStore.getState().fetchTodayDco();
    });

    expect(useGremlyStore.getState().dco).toBeNull();
    expect(useGremlyStore.getState().dcoLoading).toBe(false);
  });

  it('does nothing when userId is null', async () => {
    act(() => {
      useGremlyStore.setState({ userId: null });
    });

    await act(async () => {
      await useGremlyStore.getState().fetchTodayDco();
    });

    // dco should remain null (not changed)
    expect(useGremlyStore.getState().dco).toBeNull();
  });
});

describe('patchDcoTodayFocus', () => {
  beforeEach(() => {
    const dco = makeDco();
    act(() => {
      useGremlyStore.setState({ userId: 'user-1', dco, dcoLoading: false });
    });
  });

  it('updates local dco.today_focus', async () => {
    setupUpdateChain({ error: null });

    await act(async () => {
      await useGremlyStore.getState().patchDcoTodayFocus(['Write report', 'Exercise']);
    });

    expect(useGremlyStore.getState().dco?.today_focus).toEqual(['Write report', 'Exercise']);
  });

  it('does nothing when userId is null', async () => {
    act(() => {
      useGremlyStore.setState({ userId: null });
    });

    await act(async () => {
      await useGremlyStore.getState().patchDcoTodayFocus(['Task']);
    });

    // DCO should be unchanged (still has original today_focus: null)
    expect(useGremlyStore.getState().dco?.today_focus).toBeNull();
  });

  it('does nothing when dco is null', async () => {
    act(() => {
      useGremlyStore.setState({ dco: null });
    });

    await act(async () => {
      await useGremlyStore.getState().patchDcoTodayFocus(['Task']);
    });

    expect(useGremlyStore.getState().dco).toBeNull();
  });

  it('preserves existing DCO fields when patching', async () => {
    setupUpdateChain({ error: null });
    const originalDco = useGremlyStore.getState().dco!;

    await act(async () => {
      await useGremlyStore.getState().patchDcoTodayFocus(['New focus']);
    });

    const updatedDco = useGremlyStore.getState().dco!;
    expect(updatedDco.tone).toBe(originalDco.tone);
    expect(updatedDco.life_moment).toBe(originalDco.life_moment);
    expect(updatedDco.brief_headline).toBe(originalDco.brief_headline);
    expect(updatedDco.today_focus).toEqual(['New focus']);
  });
});
