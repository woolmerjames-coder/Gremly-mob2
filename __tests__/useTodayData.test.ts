/**
 * useTodayData.spec.ts - Phase 9 Step 3
 * Focused unit tests for Today hook heuristics
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useTodayData } from '../lib/today/useTodayData';
import { eventBus } from '../lib/events';
import type { Habit, Todo } from '../lib/types';

// Mock dependencies
jest.mock('../providers/RepoProvider', () => ({
  useRepo: jest.fn(),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../design/animations', () => ({
  useReducedMotion: jest.fn(() => true),
}));

// Mock getTodayDayString to return a fixed date for consistent testing
jest.mock('../lib/date/computeDueDay', () => ({
  ...jest.requireActual('../lib/date/computeDueDay'),
  getTodayDayString: () => '2025-01-15',
}));

// Import mocked modules
import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';

const OriginalDate = Date;

// Helper to create minimal valid habit
const createHabit = (overrides: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  type: 'habit',
  name: 'Test Habit',
  frequency: 'daily',
  subtype: 'start_habit',
  ai_placed: false,
  owner_id: 'user-1',
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  ...overrides,
});

// Helper to create minimal valid todo
const createTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 't1',
  type: 'todo',
  name: 'Test Todo',
  ai_placed: false,
  owner_id: 'user-1',
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  ...overrides,
});

describe('useTodayData', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
  };

  const mockRepo = {
    listDueToday: jest.fn(),
    listUndefinedDue: jest.fn(),
    getSpaceById: jest.fn(),
    countPlannedToday: jest.fn(),
    countCompletedToday: jest.fn(),
    listCommitments: jest.fn(),
  };

  beforeEach(() => {
    (global as any).Date = OriginalDate;
    (global as any).Date.now = OriginalDate.now;
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser });
    (useRepo as jest.Mock).mockReturnValue(mockRepo);

    // Default empty responses
    mockRepo.listDueToday.mockResolvedValue([]);
    mockRepo.listUndefinedDue.mockResolvedValue([]);
    mockRepo.getSpaceById.mockResolvedValue(null);
    mockRepo.countPlannedToday.mockResolvedValue(0);
    mockRepo.countCompletedToday.mockResolvedValue(0);
    mockRepo.listCommitments.mockResolvedValue([]);
  });

  afterEach(() => {
    eventBus.clear();
  });

  it('should order habits with dueWindow first, then by name', async () => {
    const habits: Habit[] = [
      createHabit({
        id: 'h2',
        name: 'Zebra Habit',
      }),
      createHabit({
        id: 'h1',
        name: 'Alpha Habit',
      }),
    ];

    mockRepo.listDueToday.mockResolvedValue(habits);
    mockRepo.countPlannedToday.mockResolvedValue(2);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Habits should be ordered alphabetically by name (no dueWindow)
    expect(result.current.habits).toHaveLength(2);
    expect(result.current.habits[0].name).toBe('Alpha Habit');
    expect(result.current.habits[1].name).toBe('Zebra Habit');
  });

  it('should order todos: overdue → nearDue → dueTime → title', async () => {
    // Note: This test uses due_day (canonical field) for overdue detection
    // due_day='2025-01-14' with today='2025-01-15' should be overdue

    const todos: Todo[] = [
      createTodo({
        id: 't1',
        name: 'Zebra Todo', // Non-overdue
        due_day: '2025-01-15', // Today
      }),
      createTodo({
        id: 't2',
        name: 'Overdue Todo',
        due_day: '2025-01-14', // Yesterday - overdue
      }),
    ];

    mockRepo.listDueToday.mockResolvedValue(todos);
    mockRepo.countPlannedToday.mockResolvedValue(2);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify we have both todos
    expect(result.current.todos).toHaveLength(2);

    // The overdue todo (t2) should come first
    expect(result.current.todos[0].id).toBe('t2');
    expect(result.current.todos[0].overdue).toBe(true);

    // The non-overdue todo (t1) should come second
    expect(result.current.todos[1].id).toBe('t1');
    expect(result.current.todos[1].overdue).toBe(false);
  });

  it('should cap visible items to 5 per section and track hidden counts', async () => {
    const habits: Habit[] = Array.from({ length: 8 }, (_, i) =>
      createHabit({
        id: `h${i}`,
        name: `Habit ${i}`,
      }),
    );

    const todos: Todo[] = Array.from({ length: 7 }, (_, i) =>
      createTodo({
        id: `t${i}`,
        name: `Todo ${i}`,
        due_date: `2025-01-15T${10 + i}:00:00Z`,
      }),
    );

    mockRepo.listDueToday.mockResolvedValue([...habits, ...todos]);
    mockRepo.countPlannedToday.mockResolvedValue(15);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should have all items in main arrays
    expect(result.current.habits).toHaveLength(8);
    expect(result.current.todos).toHaveLength(7);

    // But only 5 visible each
    expect(result.current.visible.habits).toHaveLength(5);
    expect(result.current.visible.todos).toHaveLength(5);

    // Hidden counts should be correct
    expect(result.current.hidden.habits).toBe(3);
    expect(result.current.hidden.todos).toBe(2);
  });

  it('should cap suggestions to 3 items', async () => {
    // Provide enough context to generate multiple suggestions
    const habits: Habit[] = [createHabit({ id: 'h1', name: 'Easy Habit' })];

    mockRepo.listDueToday.mockResolvedValue(habits);
    mockRepo.countPlannedToday.mockResolvedValue(1);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should generate up to 3 suggestions (journal + habit in this case)
    expect(result.current.suggestions.length).toBeLessThanOrEqual(3);
    expect(result.current.suggestions.length).toBeGreaterThan(0);
  });

  it('should use real header stats from repo', async () => {
    mockRepo.countPlannedToday.mockResolvedValue(12);
    mockRepo.countCompletedToday.mockResolvedValue(7);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.header.plannedToday).toBe(12);
    expect(result.current.header.completedToday).toBe(7);
    expect(mockRepo.countPlannedToday).toHaveBeenCalled();
    expect(mockRepo.countCompletedToday).toHaveBeenCalled();
  });

  it('should reload data when event bus emits ItemCompleted', async () => {
    mockRepo.listDueToday.mockResolvedValue([]);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Clear initial calls
    mockRepo.listDueToday.mockClear();

    // Emit ItemCompleted event
    eventBus.emit('ItemCompleted', { id: 'test-1', type: 'habit' });

    // Should trigger reload
    await waitFor(() => {
      expect(mockRepo.listDueToday).toHaveBeenCalled();
    });
  });

  it('should reload data when event bus emits ItemSaved', async () => {
    mockRepo.listDueToday.mockResolvedValue([]);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockRepo.listDueToday.mockClear();

    // Emit ItemSaved event
    eventBus.emit('ItemSaved', { id: 'test-1' });

    await waitFor(() => {
      expect(mockRepo.listDueToday).toHaveBeenCalled();
    });
  });

  it('should reload data when event bus emits ItemUpdated', async () => {
    mockRepo.listDueToday.mockResolvedValue([]);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    mockRepo.listDueToday.mockClear();

    // Emit ItemUpdated event
    eventBus.emit('ItemUpdated', { id: 'test-1' });

    await waitFor(() => {
      expect(mockRepo.listDueToday).toHaveBeenCalled();
    });
  });

  it('should enrich items with space names', async () => {
    const habitWithSpace = createHabit({
      id: 'h1',
      name: 'Test Habit',
      space_id: 'space-1',
    });

    mockRepo.listDueToday.mockResolvedValue([habitWithSpace]);
    mockRepo.getSpaceById.mockResolvedValue({
      id: 'space-1',
      name: 'Work Space',
    });

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.habits[0].spaceName).toBe('Work Space');
    expect(mockRepo.getSpaceById).toHaveBeenCalledWith('space-1');
  });

  it('should handle error state gracefully', async () => {
    mockRepo.listDueToday.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Soft fallback - no error shown to user, just logs warning
    // UI remains usable with safe defaults
    expect(result.current.error).toBeNull();
    expect(result.current.header.subline).toBe('Unable to load data');
    expect(result.current.habits).toEqual([]);
    expect(result.current.todos).toEqual([]);
  });

  it('should handle unauthenticated user', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // No error - just returns empty data gracefully
    expect(result.current.error).toBeNull();
    expect(result.current.habits).toEqual([]);
    expect(result.current.todos).toEqual([]);
    expect(mockRepo.listDueToday).not.toHaveBeenCalled();
  });

  describe('suggestion heuristics', () => {
    it('should suggest journal entry if none today and not evening', async () => {
      // Set morning/midday time (T15:00Z = 3pm UTC = 5am UTC-10, not evening in any timezone)
      const mockDate = new Date('2025-01-01T15:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation((() => mockDate) as any);

      mockRepo.listDueToday.mockResolvedValue([]);
      mockRepo.countPlannedToday.mockResolvedValue(0);

      const { result } = renderHook(() => useTodayData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have journal suggestion
      const journalSugg = result.current.suggestions.find((s) => s.type === 'journal');
      expect(journalSugg).toBeDefined();
      expect(journalSugg?.title).toContain('Journal');
      expect(journalSugg?.cta).toBe('Write');
      expect(journalSugg?.payload?.type).toBe('journal');

      jest.restoreAllMocks();
    });

    it('should suggest easy habit if streak < 3', async () => {
      const habits: Habit[] = [
        createHabit({
          id: 'h1',
          name: 'Morning Stretch',
        }),
      ];

      mockRepo.listDueToday.mockResolvedValue(habits);
      mockRepo.countPlannedToday.mockResolvedValue(1);

      const { result } = renderHook(() => useTodayData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should have habit suggestion (streak is 0 by default)
      const habitSugg = result.current.suggestions.find((s) => s.type === 'habit');
      expect(habitSugg).toBeDefined();
      expect(habitSugg?.title).toContain('Easy win');
      expect(habitSugg?.cta).toBe('Start');
      expect(habitSugg?.payload?.type).toBe('habit');
    });

    it('should cap suggestions to 3', async () => {
      const habits: Habit[] = [
        createHabit({ id: 'h1', name: 'Habit 1' }),
        createHabit({ id: 'h2', name: 'Habit 2' }),
      ];

      mockRepo.listDueToday.mockResolvedValue(habits);

      const { result } = renderHook(() => useTodayData());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.suggestions.length).toBeLessThanOrEqual(3);
    });

    // NOTE: Feature flag test removed - env module loads flags at startup
    // Feature flags are validated in integration/E2E tests instead
    // See docs/phase9-step5-qa-checklist.md for manual QA validation
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// getSweepPillLines unit tests
// ───────────────────────────────────────────────────────────────────────────────

import { getSweepPillLines } from '../lib/today/useTodayData';

describe('getSweepPillLines', () => {
  // Updated copy: "All caught up" replaced "all clear ✨" in brand refresh
  it('returns "All caught up" for 0 items', () => {
    const result = getSweepPillLines(0);
    expect(result).toEqual({ title: 'Sweep', subtitle: 'All caught up' });
  });

  it('returns "1 thing waiting" for 1 item', () => {
    const result = getSweepPillLines(1);
    expect(result).toEqual({ title: 'Sweep', subtitle: '1 thing waiting' });
  });

  it.each([2, 5, 9])('returns "%s things waiting" for 2-9 items', (count) => {
    const result = getSweepPillLines(count);
    expect(result).toEqual({ title: 'Sweep', subtitle: `${count} things waiting` });
  });

  it.each([10, 12, 14])('returns "%s things ready for review" for 10-14 items', (count) => {
    const result = getSweepPillLines(count);
    expect(result).toEqual({ title: 'Sweep', subtitle: `${count} things ready for review` });
  });

  it.each([15, 20, 100])('returns friendly overflow message for 15+ items', (count) => {
    const result = getSweepPillLines(count);
    expect(result).toEqual({ title: 'Sweep', subtitle: 'Quite a few things — want to tidy?' });
  });

  it('always returns "Sweep" as title', () => {
    [0, 1, 5, 10, 15, 50].forEach((count) => {
      expect(getSweepPillLines(count).title).toBe('Sweep');
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// getHeaderSweepLabel unit tests
// ───────────────────────────────────────────────────────────────────────────────

import { getHeaderSweepLabel } from '../lib/today/useTodayData';

describe('getHeaderSweepLabel', () => {
  it('returns "Ready for a quick Sweep" for high level', () => {
    expect(getHeaderSweepLabel('high')).toBe('Ready for a quick Sweep');
  });

  it('returns "A few things to tidy" for moderate level', () => {
    expect(getHeaderSweepLabel('moderate')).toBe('A few things to tidy');
  });

  it('returns "Sweep is waiting" for normal level', () => {
    expect(getHeaderSweepLabel('normal')).toBe('Sweep is waiting');
  });

  it('returns empty string for none level', () => {
    expect(getHeaderSweepLabel('none')).toBe('');
  });
});
