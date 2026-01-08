/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react-native';
import { useRolling7DayHabitStats } from '../useRolling7DayHabitStats';
import * as useGremlyStoreModule from '../../../store/useGremlyStore';
import type { Habit } from '../../../types';
import type { HabitProgressRow } from '../../../store/useGremlyStore';

/**
 * Format date as YYYY-MM-DD in LOCAL timezone (matches DateService behavior).
 * IMPORTANT: Do NOT use toISOString().split('T')[0] - that returns UTC date!
 */
const formatDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get today and relative dates
const getToday = () => new Date();
const getDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

// Create mock habit
const createHabit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 'habit-1',
  type: 'habit',
  owner_id: 'user-1',
  name: 'Test Habit',
  frequency: 'daily',
  subtype: 'start_habit',
  ai_placed: false,
  cadence: 'daily',
  target_per_period: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  archived: false,
  ...overrides,
});

// Create mock progress row
const createProgress = (habitId: string, date: Date): HabitProgressRow => ({
  id: `prog-${Date.now()}-${Math.random()}`,
  habit_id: habitId,
  owner_id: 'user-1',
  occurred_day: formatDate(date),
  occurred_at: date.toISOString(),
  count: 1,
  occurrence_index: null,
});

describe('useRolling7DayHabitStats', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  const mockStore = (habitProgress: HabitProgressRow[]) => {
    jest.spyOn(useGremlyStoreModule, 'useGremlyStore').mockImplementation((selector: any) => {
      const state = { habitProgress };
      return selector(state);
    });
  };

  describe('rolling 7-day window', () => {
    it('returns 7 days with today as the last day', () => {
      mockStore([]);
      const habits = [createHabit()];

      const { result } = renderHook(() => useRolling7DayHabitStats(habits));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].days).toHaveLength(7);
      expect(result.current[0].days[6].isToday).toBe(true);
      expect(result.current[0].days[0].isToday).toBe(false);
    });

    it('marks completed days correctly', () => {
      const todayDate = getToday();
      const yesterdayDate = getDaysAgo(1);
      const habit = createHabit({ id: 'h1' });

      mockStore([createProgress('h1', todayDate), createProgress('h1', yesterdayDate)]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      const days = result.current[0].days;
      // Today (index 6) and yesterday (index 5) should be completed
      expect(days[6].isCompleted).toBe(true);
      expect(days[5].isCompleted).toBe(true);
      expect(days[4].isCompleted).toBe(false);
    });

    it('generates correct day labels', () => {
      mockStore([]);
      const { result } = renderHook(() => useRolling7DayHabitStats([createHabit()]));

      const days = result.current[0].days;
      // All day labels should be single letters
      days.forEach((day) => {
        expect(['S', 'M', 'T', 'W', 'F']).toContain(day.dayLabel);
      });
    });
  });

  describe('daily habits', () => {
    it('shows flame icon and streak count when streak >= 2', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      // Create 3-day streak ending today
      mockStore([
        createProgress('h1', getToday()),
        createProgress('h1', getDaysAgo(1)),
        createProgress('h1', getDaysAgo(2)),
      ]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataIcon).toBe('Flame');
      expect(result.current[0].metadataLabel).toBe('3');
    });

    it('shows clock icon and "Today" when done today with no streak', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      // Only done today
      mockStore([createProgress('h1', getToday())]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataIcon).toBe('Clock');
      expect(result.current[0].metadataLabel).toBe('Today');
    });

    it('shows "Xd ago" when last completion was X days ago', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      // Last done 3 days ago
      mockStore([createProgress('h1', getDaysAgo(3))]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataIcon).toBe('Clock');
      expect(result.current[0].metadataLabel).toBe('3d ago');
    });

    it('shows "Never" when no completions exist', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      mockStore([]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataIcon).toBe('Clock');
      expect(result.current[0].metadataLabel).toBe('Never');
    });

    it('marks status as done_for_period when done today', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      mockStore([createProgress('h1', getToday())]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].status).toBe('done_for_period');
    });

    it('marks status as on_track when streak is active but not done today', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      // Done yesterday (streak of 1 ending yesterday)
      mockStore([createProgress('h1', getDaysAgo(1))]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].status).toBe('on_track');
    });

    it('marks status as needs_attention when no streak and not done today', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      // Last done 3 days ago (streak broken)
      mockStore([createProgress('h1', getDaysAgo(3))]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].status).toBe('needs_attention');
    });
  });

  describe('weekly habits', () => {
    it('shows RefreshCw icon with progress label', () => {
      const habit = createHabit({ id: 'h1', cadence: 'weekly', target_per_period: 3 });
      mockStore([createProgress('h1', getToday()), createProgress('h1', getDaysAgo(2))]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataIcon).toBe('RefreshCw');
      expect(result.current[0].metadataLabel).toBe('2/3 past 7d');
    });

    it('marks status as done_for_period when target met', () => {
      const habit = createHabit({ id: 'h1', cadence: 'weekly', target_per_period: 2 });
      mockStore([createProgress('h1', getToday()), createProgress('h1', getDaysAgo(1))]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].status).toBe('done_for_period');
    });

    it('marks status as on_track when at 50%+ of target', () => {
      const habit = createHabit({ id: 'h1', cadence: 'weekly', target_per_period: 4 });
      // 2 of 4 = 50%
      mockStore([createProgress('h1', getToday()), createProgress('h1', getDaysAgo(1))]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].status).toBe('on_track');
    });

    it('marks status as needs_attention when below 50%', () => {
      const habit = createHabit({ id: 'h1', cadence: 'weekly', target_per_period: 5 });
      // 1 of 5 = 20%
      mockStore([createProgress('h1', getToday())]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].status).toBe('needs_attention');
    });
  });

  describe('monthly habits', () => {
    it('shows Calendar icon with 30-day progress label', () => {
      const habit = createHabit({ id: 'h1', cadence: 'monthly', target_per_period: 4 });
      mockStore([createProgress('h1', getToday())]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataIcon).toBe('Calendar');
      expect(result.current[0].metadataLabel).toMatch(/\/4 past 30d$/);
    });
  });

  describe('filtering and sorting', () => {
    it('excludes archived habits', () => {
      const activeHabit = createHabit({ id: 'h1', name: 'Active', archived: false });
      const archivedHabit = createHabit({ id: 'h2', name: 'Archived', archived: true });
      mockStore([]);

      const { result } = renderHook(() => useRolling7DayHabitStats([activeHabit, archivedHabit]));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].name).toBe('Active');
    });

    it('sorts by priority: needs_attention first, then on_track, then done', () => {
      const habitDone = createHabit({ id: 'h1', name: 'Done', cadence: 'daily' });
      const habitOnTrack = createHabit({ id: 'h2', name: 'On Track', cadence: 'daily' });
      const habitNeedsAttention = createHabit({
        id: 'h3',
        name: 'Needs Attention',
        cadence: 'daily',
      });

      mockStore([
        createProgress('h1', getToday()), // Done today
        createProgress('h2', getDaysAgo(1)), // Done yesterday only (on track)
        // h3 has no progress (needs attention)
      ]);

      const { result } = renderHook(() =>
        useRolling7DayHabitStats([habitDone, habitOnTrack, habitNeedsAttention]),
      );

      expect(result.current[0].name).toBe('Needs Attention');
      expect(result.current[1].name).toBe('On Track');
      expect(result.current[2].name).toBe('Done');
    });
  });

  describe('streak calculation', () => {
    it('counts consecutive days ending today', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      mockStore([
        createProgress('h1', getToday()),
        createProgress('h1', getDaysAgo(1)),
        createProgress('h1', getDaysAgo(2)),
        createProgress('h1', getDaysAgo(3)),
        // Gap at 4 days ago
        createProgress('h1', getDaysAgo(5)),
      ]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataLabel).toBe('4'); // 4-day streak
    });

    it('counts consecutive days ending yesterday if not done today', () => {
      const habit = createHabit({ id: 'h1', cadence: 'daily' });
      mockStore([
        // Not done today
        createProgress('h1', getDaysAgo(1)),
        createProgress('h1', getDaysAgo(2)),
      ]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].metadataLabel).toBe('2'); // 2-day streak ending yesterday
    });
  });

  describe('cadence defaults', () => {
    it('defaults to daily cadence when not specified', () => {
      const habit = createHabit({ id: 'h1', cadence: undefined as any });
      mockStore([]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      expect(result.current[0].cadence).toBe('daily');
    });

    it('defaults target_per_period to 1 when not specified', () => {
      const habit = createHabit({
        id: 'h1',
        cadence: 'weekly',
        target_per_period: undefined as any,
      });
      mockStore([createProgress('h1', getToday())]);

      const { result } = renderHook(() => useRolling7DayHabitStats([habit]));

      // 1/1 should be done_for_period
      expect(result.current[0].status).toBe('done_for_period');
    });
  });

  describe('empty states', () => {
    it('returns empty array when no habits provided', () => {
      mockStore([]);

      const { result } = renderHook(() => useRolling7DayHabitStats([]));

      expect(result.current).toEqual([]);
    });
  });
});
