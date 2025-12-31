/**
 * useSweepIntroStats Hook Tests
 *
 * Tests the refactored useSweepIntroStats hook that reads from Zustand store
 * instead of fetching from Supabase.
 */

import { renderHook } from '@testing-library/react-native';
import { useSweepIntroStats } from '../useSweepIntroStats';

// Mock the Zustand store
const mockStoreState = {
  todos: [] as any[],
  habits: [] as any[],
  notes: [] as any[],
  habitProgress: [] as any[],
  lastSweepCompletedAt: null as string | null,
  sweepStreak: 0,
  totalSweepCount: 0,
  isLoading: false,
  isInitialized: true,
};

jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: (selector: (state: typeof mockStoreState) => any) => selector(mockStoreState),
}));

describe('useSweepIntroStats', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-12-15T12:00:00Z'));

    // Reset mock store state
    mockStoreState.todos = [];
    mockStoreState.habits = [];
    mockStoreState.notes = [];
    mockStoreState.habitProgress = [];
    mockStoreState.lastSweepCompletedAt = null;
    mockStoreState.sweepStreak = 0;
    mockStoreState.totalSweepCount = 0;
    mockStoreState.isLoading = false;
    mockStoreState.isInitialized = true;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null stats when store is not initialized', () => {
    mockStoreState.isInitialized = false;

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('returns stats when store is initialized', () => {
    mockStoreState.isInitialized = true;

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('returns isFirstSweep=true when lastSweepCompletedAt is null', () => {
    mockStoreState.lastSweepCompletedAt = null;

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.isFirstSweep).toBe(true);
  });

  it('returns isFirstSweep=false when lastSweepCompletedAt is set', () => {
    mockStoreState.lastSweepCompletedAt = '2025-12-14T20:00:00Z';

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.isFirstSweep).toBe(false);
  });

  it('uses 48-hour fallback cutoff when lastSweepCompletedAt is null', () => {
    mockStoreState.lastSweepCompletedAt = null;
    // Current time: 2025-12-15T12:00:00Z
    // 48 hours ago: 2025-12-13T12:00:00Z

    const { result } = renderHook(() => useSweepIntroStats());

    // cutoffTimestamp should be approximately 48 hours ago
    const cutoff = result.current.stats?.cutoffTimestamp;
    expect(cutoff).toBeDefined();
    // Should be sometime on Dec 13
    expect(cutoff?.startsWith('2025-12-13')).toBe(true);
  });

  it('uses lastSweepCompletedAt as cutoff when set', () => {
    mockStoreState.lastSweepCompletedAt = '2025-12-14T20:00:00Z';

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.cutoffTimestamp).toBe('2025-12-14T20:00:00Z');
  });

  it('includes sweepStreak from store', () => {
    mockStoreState.sweepStreak = 5;

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.sweepStreak).toBe(5);
  });

  it('includes totalSweepCount from store', () => {
    mockStoreState.totalSweepCount = 42;

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.totalSweepCount).toBe(42);
  });

  it('computes completed todos since last sweep', () => {
    mockStoreState.lastSweepCompletedAt = '2025-12-14T12:00:00Z';
    mockStoreState.todos = [
      {
        id: 't1',
        name: 'Completed after sweep',
        completed_at: '2025-12-14T18:00:00Z', // After last sweep
        created_at: '2025-12-10T00:00:00Z',
      },
      {
        id: 't2',
        name: 'Completed before sweep',
        completed_at: '2025-12-14T10:00:00Z', // Before last sweep
        created_at: '2025-12-10T00:00:00Z',
      },
      {
        id: 't3',
        name: 'Not completed',
        completed_at: null,
        created_at: '2025-12-14T18:00:00Z',
      },
    ];

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.completed.todos).toHaveLength(1);
    expect(result.current.stats?.completed.todos[0].id).toBe('t1');
  });

  it('computes completed habits from habitProgress', () => {
    mockStoreState.lastSweepCompletedAt = '2025-12-14T12:00:00Z';
    mockStoreState.habits = [
      { id: 'h1', name: 'Completed habit' },
      { id: 'h2', name: 'Not completed habit' },
    ];
    mockStoreState.habitProgress = [
      {
        habit_id: 'h1',
        occurred_at: '2025-12-14T18:00:00Z', // After last sweep
      },
    ];

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.completed.habits).toHaveLength(1);
    expect(result.current.stats?.completed.habits[0].id).toBe('h1');
  });

  it('computes dropped todos since cutoff', () => {
    mockStoreState.lastSweepCompletedAt = '2025-12-14T12:00:00Z';
    mockStoreState.todos = [
      {
        id: 't1',
        name: 'Created after sweep, not completed',
        created_at: '2025-12-14T18:00:00Z',
        completed_at: null,
        archived: false,
      },
      {
        id: 't2',
        name: 'Created before sweep',
        created_at: '2025-12-10T00:00:00Z',
        completed_at: null,
        archived: false,
      },
      {
        id: 't3',
        name: 'Created after but archived',
        created_at: '2025-12-14T18:00:00Z',
        completed_at: null,
        archived: true,
      },
    ];

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.dropped.todos).toHaveLength(1);
    expect(result.current.stats?.dropped.todos[0].id).toBe('t1');
  });

  it('computes dropped notes since cutoff', () => {
    mockStoreState.lastSweepCompletedAt = '2025-12-14T12:00:00Z';
    mockStoreState.notes = [
      {
        id: 'n1',
        title: 'Created after sweep',
        created_at: '2025-12-14T18:00:00Z',
        archived: false,
      },
      {
        id: 'n2',
        title: 'Created before sweep',
        created_at: '2025-12-10T00:00:00Z',
        archived: false,
      },
    ];

    const { result } = renderHook(() => useSweepIntroStats());

    expect(result.current.stats?.dropped.notes).toHaveLength(1);
    expect(result.current.stats?.dropped.notes[0].id).toBe('n1');
  });

  it('refetch is a no-op (returns empty promise)', async () => {
    const { result } = renderHook(() => useSweepIntroStats());

    // Should not throw
    await expect(result.current.refetch()).resolves.toBeUndefined();
  });
});
