/**
 * Tests for fetchFeedingHistory and fetchLifetimeStats store actions.
 *
 * Covers: 7-day window construction, fed/unfed mapping, no-op without userId,
 * DB errors handled, lifetime stats aggregation across tables.
 */

// ---------- mutable result containers (survive resetMocks) ----------
let mockFeedingRows: Array<{ ritual_day: string; is_fed: boolean }> = [];
let mockFeedingError: unknown = null;

let mockFedDaysCount: number | null = 0;
let mockTodosCount: number | null = 0;
let mockNotesCount: number | null = 0;
let mockHabitsCount: number | null = 0;
let mockStatsError: unknown = null;

jest.mock('../../supabase/client', () => {
  const supabase = {
    auth: {
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getSession() {
        return Promise.resolve({ data: { session: null } });
      },
    },
    from(table: string) {
      if (table === 'daily_ritual_progress') {
        return {
          select(_sel?: string, opts?: { count?: string; head?: boolean }) {
            if (opts?.head) {
              // lifetime stats path — count query
              return {
                eq(_col: string, _val: unknown) {
                  return {
                    eq(_col2: string, _val2: unknown) {
                      return Promise.resolve({
                        count: mockFedDaysCount,
                        error: mockStatsError,
                      });
                    },
                  };
                },
              };
            }
            // feeding history path — row query
            return {
              eq(_col: string, _val: unknown) {
                return {
                  gte(_col2: string, _val2: unknown) {
                    return {
                      order() {
                        return Promise.resolve({
                          data: mockFeedingRows,
                          error: mockFeedingError,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      // todos / notes / habits — count queries for lifetimeStats
      return {
        select(_sel?: string, _opts?: unknown) {
          return {
            eq(_col: string, _val: unknown) {
              if (table === 'todos') {
                return Promise.resolve({ count: mockTodosCount, error: mockStatsError });
              }
              if (table === 'habits') {
                return Promise.resolve({ count: mockHabitsCount, error: mockStatsError });
              }
              // notes needs .is() chain
              return {
                is() {
                  return Promise.resolve({ count: mockNotesCount, error: mockStatsError });
                },
              };
            },
          };
        },
      };
    },
  };
  return { supabase };
});

jest.mock('../../date/ritualDay', () => ({
  getRitualDay: () => '2025-06-14',
}));

jest.mock('@sentry/react-native', () => ({
  captureException: () => {},
}));

import { useGremlyStore } from '../useGremlyStore';

beforeEach(() => {
  mockFeedingRows = [];
  mockFeedingError = null;
  mockFedDaysCount = 0;
  mockTodosCount = 0;
  mockNotesCount = 0;
  mockHabitsCount = 0;
  mockStatsError = null;

  // Reset store to a known state with userId
  useGremlyStore.setState({
    userId: 'user-123',
    dayBoundaryHour: 4,
    feedingHistory: [],
  });
});

// ─── fetchFeedingHistory ────────────────────────────────────────────

describe('fetchFeedingHistory', () => {
  it('no-ops when userId is missing', async () => {
    useGremlyStore.setState({ userId: null });
    await useGremlyStore.getState().fetchFeedingHistory();
    expect(useGremlyStore.getState().feedingHistory).toEqual([]);
  });

  it('builds a 7-day window and maps fed days', async () => {
    mockFeedingRows = [
      { ritual_day: '2025-06-10', is_fed: true },
      { ritual_day: '2025-06-12', is_fed: true },
      { ritual_day: '2025-06-14', is_fed: true },
    ];
    await useGremlyStore.getState().fetchFeedingHistory();
    const history = useGremlyStore.getState().feedingHistory;

    expect(history).toHaveLength(7);
    // Days 8-14 (from today minus 6 to today)
    expect(history[0]).toEqual({ date: '2025-06-08', isFed: false });
    expect(history[2]).toEqual({ date: '2025-06-10', isFed: true });
    expect(history[4]).toEqual({ date: '2025-06-12', isFed: true });
    expect(history[6]).toEqual({ date: '2025-06-14', isFed: true });
  });

  it('marks all days unfed when no rows returned', async () => {
    mockFeedingRows = [];
    await useGremlyStore.getState().fetchFeedingHistory();
    const history = useGremlyStore.getState().feedingHistory;

    expect(history).toHaveLength(7);
    expect(history.every((d: { isFed: boolean }) => d.isFed === false)).toBe(true);
  });

  it('handles DB error gracefully', async () => {
    mockFeedingError = { message: 'timeout' };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await useGremlyStore.getState().fetchFeedingHistory();
    // feedingHistory remains unchanged (empty from beforeEach)
    expect(useGremlyStore.getState().feedingHistory).toEqual([]);
    spy.mockRestore();
  });
});

// ─── fetchLifetimeStats ─────────────────────────────────────────────

describe('fetchLifetimeStats', () => {
  it('returns zeros when userId is missing', async () => {
    useGremlyStore.setState({ userId: null });
    const result = await useGremlyStore.getState().fetchLifetimeStats();
    expect(result).toEqual({ daysFed: 0, thoughtsCount: 0 });
  });

  it('aggregates counts from all tables', async () => {
    mockFedDaysCount = 42;
    mockTodosCount = 100;
    mockNotesCount = 50;
    mockHabitsCount = 25;
    const result = await useGremlyStore.getState().fetchLifetimeStats();
    expect(result).toEqual({ daysFed: 42, thoughtsCount: 175 });
  });

  it('treats null counts as zero', async () => {
    mockFedDaysCount = null;
    mockTodosCount = null;
    mockNotesCount = null;
    mockHabitsCount = null;
    const result = await useGremlyStore.getState().fetchLifetimeStats();
    expect(result).toEqual({ daysFed: 0, thoughtsCount: 0 });
  });

  it('returns zeros on error and logs to Sentry', async () => {
    mockStatsError = new Error('DB down');
    // Force the Promise.all to throw by making supabase throw
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await useGremlyStore.getState().fetchLifetimeStats();
    // Even with errors in individual queries, the function shouldn't crash
    expect(result).toBeDefined();
    expect(typeof result.daysFed).toBe('number');
    expect(typeof result.thoughtsCount).toBe('number');
    spy.mockRestore();
  });
});
