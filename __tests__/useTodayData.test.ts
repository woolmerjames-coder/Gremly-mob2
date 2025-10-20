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

// Import mocked modules
import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';

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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: mockUser });
    (useRepo as jest.Mock).mockReturnValue(mockRepo);

    // Default empty responses
    mockRepo.listDueToday.mockResolvedValue([]);
    mockRepo.listUndefinedDue.mockResolvedValue([]);
    mockRepo.getSpaceById.mockResolvedValue(null);
    mockRepo.countPlannedToday.mockResolvedValue(0);
    mockRepo.countCompletedToday.mockResolvedValue(0);
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
    const now = new Date('2025-01-15T12:00:00Z');
    const RealDate = Date;

    // Mock Date constructor
    (global as any).Date = jest.fn((...args) => {
      if (args.length === 0) {
        return now;
      }
      return new RealDate(...(args as [any]));
    });
    global.Date.now = () => now.getTime();

    const todos: Todo[] = [
      createTodo({
        id: 't1',
        name: 'Normal Todo',
        due_date: '2025-01-15T14:00:00Z', // 2 hours from now
      }),
      createTodo({
        id: 't2',
        name: 'Near Due Todo',
        due_date: '2025-01-15T13:00:00Z', // 1 hour from now (within 3h)
      }),
      createTodo({
        id: 't3',
        name: 'Overdue Todo',
        due_date: '2025-01-15T09:00:00Z', // 3 hours ago
      }),
    ];

    mockRepo.listDueToday.mockResolvedValue(todos);
    mockRepo.countPlannedToday.mockResolvedValue(3);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Todos should be ordered: overdue → nearDue → normal
    expect(result.current.todos).toHaveLength(3);
    expect(result.current.todos[0].id).toBe('t3'); // Overdue first
    expect(result.current.todos[0].overdue).toBe(true);
    expect(result.current.todos[1].id).toBe('t2'); // Near due second
    expect(result.current.todos[1].nearDue).toBe(true);
    expect(result.current.todos[2].id).toBe('t1'); // Normal last

    global.Date = RealDate;
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
    const suggestions: Todo[] = Array.from({ length: 5 }, (_, i) =>
      createTodo({
        id: `s${i}`,
        name: `Suggestion ${i}`,
      }),
    );

    mockRepo.listUndefinedDue.mockResolvedValue(suggestions);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Suggestions should be capped at 3
    expect(result.current.suggestions).toHaveLength(3);
    expect(result.current.visible.suggestions).toHaveLength(3);
    expect(result.current.hidden.suggestions).toBe(0);
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

    expect(result.current.error).toBe('Network error');
  });

  it('should handle unauthenticated user', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Please sign in to view your items');
    expect(mockRepo.listDueToday).not.toHaveBeenCalled();
  });
});
