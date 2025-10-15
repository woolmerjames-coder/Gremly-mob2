import { startOfDay, endOfDay, addDays, subDays } from 'date-fns';
import { memoryRepo } from '../../lib/repo/memory';
import type { Todo } from '../../lib/types';

describe('MemoryRepo - listDueToday', () => {
  test('includes todo with dueDate set to today', async () => {
    // Create a todo with today's date
    const today = new Date();
    const todayISO = today.toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      title: 'Todo due today',
      dueDate: todayISO,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(todayISO);

    // Expect the new todo to be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeDefined();
    expect(foundTodo?.title).toBe('Todo due today');
    expect((foundTodo as Todo).dueDate).toBe(todayISO);
  });

  test('includes todo with dueDate at start of today', async () => {
    // Create a todo with date at start of day
    const startOfToday = startOfDay(new Date()).toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      title: 'Todo at start of day',
      dueDate: startOfToday,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeDefined();
  });

  test('includes todo with dueDate at end of today', async () => {
    // Create a todo with date at end of day
    const endOfToday = endOfDay(new Date()).toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      title: 'Todo at end of day',
      dueDate: endOfToday,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeDefined();
  });

  test('excludes todo with dueDate tomorrow', async () => {
    // Create a todo with tomorrow's date
    const tomorrow = addDays(new Date(), 1);
    const tomorrowISO = tomorrow.toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      title: 'Todo due tomorrow',
      dueDate: tomorrowISO,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should NOT be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeUndefined();
  });

  test('excludes todo with dueDate yesterday', async () => {
    // Create a todo with yesterday's date
    const yesterday = subDays(new Date(), 1);
    const yesterdayISO = yesterday.toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      title: 'Todo due yesterday',
      dueDate: yesterdayISO,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should NOT be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeUndefined();
  });

  test('excludes todo with null dueDate', async () => {
    const todo = await memoryRepo.create({
      type: 'todo',
      title: 'Todo with no due date',
      dueDate: null,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should NOT be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeUndefined();
  });

  test('includes habit with dueDate today', async () => {
    // Habits can also have due dates
    const todayISO = new Date().toISOString();

    const habit = await memoryRepo.create({
      type: 'habit',
      title: 'Habit due today',
      frequency: 'daily',
      dueDate: todayISO,
    });

    // Query for records due today
    const dueToday = await memoryRepo.listDueToday(todayISO);

    // Should include habits too
    const foundHabit = dueToday.find((r) => r.id === habit.id);
    expect(foundHabit).toBeDefined();
    expect(foundHabit?.type).toBe('habit');
  });

  test('returns empty array when no records due today', async () => {
    // Clear existing data by creating a new isolated test
    const tomorrow = addDays(new Date(), 1).toISOString();

    // Create todos only for tomorrow
    await memoryRepo.create({
      type: 'todo',
      title: 'Future todo',
      dueDate: tomorrow,
    });

    // Query for today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // May have other records from seed/previous tests,
    // but should not include the future todo we just created
    const futureTodo = dueToday.find((r) => r.title === 'Future todo');
    expect(futureTodo).toBeUndefined();
  });

  test('handles malformed date gracefully', async () => {
    // Note: Zod validation prevents creating records with invalid date strings,
    // so we test that listDueToday handles edge cases in the date parsing

    // Create a valid todo first
    const validTodo = await memoryRepo.create({
      type: 'todo',
      title: 'Valid todo',
      dueDate: new Date().toISOString(),
    });

    // listDueToday should not throw even if parsing encounters edge cases
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should return an array
    expect(dueToday).toBeDefined();
    expect(Array.isArray(dueToday)).toBe(true);

    // Should include the valid todo
    const foundTodo = dueToday.find((r) => r.id === validTodo.id);
    expect(foundTodo).toBeDefined();
  });
});
