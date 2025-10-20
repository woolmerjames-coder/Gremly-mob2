/**
 * Tests for MemoryRepo to verify CRUD operations work correctly.
 */

import { MemoryRepo } from '../../lib/repo/memory';
import type { CreateRecordInput } from '../../lib/repo/IRepo';
import type { Habit, Todo } from '../../lib/types';

// Mock date-fns
jest.mock('date-fns', () => ({
  isToday: jest.fn(() => true),
  parseISO: jest.fn((str: string) => new Date(str)),
}));

const mockUserId = 'test-user-123';

describe('MemoryRepo', () => {
  let repo: MemoryRepo;

  beforeEach(() => {
    repo = new MemoryRepo(mockUserId);
  });

  test('creates and retrieves a habit', async () => {
    const input: CreateRecordInput = {
      type: 'habit',
      name: 'Morning meditation',
      frequency: 'daily',
      subtype: 'start_habit',
      owner_id: mockUserId,
    };

    const habit = await repo.create(input);
    expect(habit.id).toBeDefined();
    expect(habit.type).toBe('habit');
    expect((habit as Habit).name).toBe('Morning meditation');

    const retrieved = await repo.getById(habit.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(habit.id);
  });

  test('creates and retrieves a todo', async () => {
    const input: CreateRecordInput = {
      type: 'todo',
      name: 'Buy groceries',
      body: 'Milk, eggs, bread',
      owner_id: mockUserId,
    };

    const todo = await repo.create(input);
    expect(todo.type).toBe('todo');
    expect((todo as Todo).name).toBe('Buy groceries');
  });

  test('lists records by type', async () => {
    await repo.create({
      type: 'habit',
      name: 'Morning routine',
      frequency: 'daily',
      subtype: 'start_habit',
      owner_id: mockUserId,
    });

    await repo.create({
      type: 'todo',
      name: 'Test Habit',
      owner_id: mockUserId,
    });

    const habits = await repo.listByType('habit');
    const todos = await repo.listByType('todo');

    expect(habits.length).toBeGreaterThan(0);
    expect(todos.length).toBeGreaterThan(0);
    expect(habits.every((h) => h.type === 'habit')).toBe(true);
    expect(todos.every((t) => t.type === 'todo')).toBe(true);
  });

  test('searches across records', async () => {
    await repo.create({
      type: 'todo',
      name: 'Buy coffee',
      owner_id: mockUserId,
    });

    const results = await repo.search('coffee');
    expect(results.length).toBeGreaterThan(0);
    expect((results[0] as Todo).name).toContain('coffee');
  });

  test('updates a record', async () => {
    const todo = await repo.create({
      type: 'todo',
      name: 'Original title',
      owner_id: mockUserId,
    });

    const updated = await repo.update({
      id: todo.id,
      patch: { name: 'Updated title' } as Partial<Todo>,
    });

    expect((updated as Todo).name).toBe('Updated title');
  });

  test('removes a record', async () => {
    const todo = await repo.create({
      type: 'todo',
      name: 'To be deleted',
      owner_id: mockUserId,
    });

    await repo.remove(todo.id);

    const retrieved = await repo.getById(todo.id);
    expect(retrieved).toBeNull();
  });

  test('lists undefined due todos', async () => {
    await repo.create({
      type: 'todo',
      name: 'Test Habit',
      undefined_due: true,
      owner_id: mockUserId,
    });

    const undefinedTodos = await repo.listUndefinedDue();
    expect(undefinedTodos.length).toBeGreaterThan(0);
    expect(undefinedTodos.every((t) => t.undefined_due === true)).toBe(true);
  });
});
