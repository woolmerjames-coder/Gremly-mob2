/**
 * Test that useTodayData correctly handles due_time values
 * and doesn't trigger timestamp conversion errors
 */

import { renderHook, waitFor } from '@testing-library/react-native';
import { useTodayData } from '../lib/today/useTodayData';
import { useRepo } from '../providers/RepoProvider';
import { useAuth } from '../providers/AuthProvider';

jest.mock('../providers/RepoProvider');
jest.mock('../providers/AuthProvider');
jest.mock('../design/animations', () => ({
  useReducedMotion: jest.fn(() => false),
}));

const mockRepo = {
  listDueToday: jest.fn(),
  countPlannedToday: jest.fn(),
  countCompletedToday: jest.fn(),
  listCommitments: jest.fn(),
  getSpaceById: jest.fn(),
};

describe('useTodayData - due_time handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRepo as jest.Mock).mockReturnValue(mockRepo);
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'user-123', email: 'test@example.com' },
    });

    // Default mocks
    mockRepo.countPlannedToday.mockResolvedValue(5);
    mockRepo.countCompletedToday.mockResolvedValue(2);
    mockRepo.listCommitments.mockResolvedValue([]);
    mockRepo.getSpaceById.mockResolvedValue(null);
  });

  it('should handle todos with due_time values without timestamp errors', async () => {
    // Mock todos with due_date that would have been constructed from due_time
    const mockTodos = [
      {
        type: 'todo' as const,
        id: 'todo-1',
        name: 'Morning standup',
        due_date: new Date('2025-11-17T09:00:00-08:00').toISOString(), // Constructed from due_time="09:00"
        completed_at: null,
        owner_id: 'user-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['work'],
        space_id: null,
      },
      {
        type: 'todo' as const,
        id: 'todo-2',
        name: 'Afternoon meeting',
        due_date: new Date('2025-11-17T14:30:00-08:00').toISOString(), // Constructed from due_time="14:30"
        completed_at: null,
        owner_id: 'user-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['meetings'],
        space_id: null,
      },
    ];

    mockRepo.listDueToday.mockResolvedValue(mockTodos);

    const { result } = renderHook(() => useTodayData());

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Verify data was fetched without errors
    expect(result.current.error).toBeNull();
    expect(result.current.todos).toBeDefined();
    expect(result.current.todos.length).toBe(2);

    // Verify todos are properly enriched
    const morningTodo = result.current.todos.find((item) => item.id === 'todo-1');
    expect(morningTodo).toBeDefined();
    expect(morningTodo?.title).toBe('Morning standup');
    expect(morningTodo?.dueTime).toBeDefined(); // Should have formatted time

    const afternoonTodo = result.current.todos.find((item) => item.id === 'todo-2');
    expect(afternoonTodo).toBeDefined();
    expect(afternoonTodo?.title).toBe('Afternoon meeting');
  });

  it('should handle empty due_time gracefully', async () => {
    const mockTodosWithNullTime = [
      {
        type: 'todo' as const,
        id: 'todo-3',
        name: 'All-day task',
        due_date: new Date('2025-11-17T00:00:00-08:00').toISOString(),
        completed_at: null,
        owner_id: 'user-123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: [],
        space_id: null,
      },
    ];

    mockRepo.listDueToday.mockResolvedValue(mockTodosWithNullTime);

    const { result } = renderHook(() => useTodayData());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    const allDayTask = result.current.todos.find((item) => item.id === 'todo-3');
    expect(allDayTask).toBeDefined();
    expect(allDayTask?.title).toBe('All-day task');
  });

  it('should recover gracefully from repo errors', async () => {
    // Simulate an error from the database
    mockRepo.listDueToday.mockRejectedValue(new Error('Database connection error'));

    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const { result } = renderHook(() => useTodayData());

    // Wait for loading to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should log warning but not crash
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[useTodayData] Failed to load data:',
      expect.any(Error),
    );

    // Should return empty data instead of crashing
    expect(result.current.todos).toEqual([]);
    expect(result.current.habits).toEqual([]);

    consoleWarnSpy.mockRestore();
  });
});
