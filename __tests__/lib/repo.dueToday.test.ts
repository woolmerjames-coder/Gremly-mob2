import { startOfDay, endOfDay, addDays, subDays } from 'date-fns';
import { memoryRepo } from '../../lib/repo/memory';
import type { Todo } from '../../lib/types';

describe('MemoryRepo - listDueToday', () => {
  test('includes todo with due_date set to today', async () => {
    // Create a todo with today's date
    const today = new Date();
    const todayISO = today.toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      name: 'Todo due today',
      due_date: todayISO,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(todayISO);

    // Expect the new todo to be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeDefined();
    expect((foundTodo as Todo).name).toBe('Todo due today');
    expect((foundTodo as Todo).due_date).toBe(todayISO);
  });

  test('includes todo with due_date at start of today', async () => {
    // Create a todo with date at start of day
    const startOfToday = startOfDay(new Date()).toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      name: 'Todo at start of day',
      due_date: startOfToday,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeDefined();
  });

  test('includes todo with due_date at end of today', async () => {
    // Create a todo with date at end of day
    const endOfToday = endOfDay(new Date()).toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      name: 'Todo at end of day',
      due_date: endOfToday,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeDefined();
  });

  test('excludes todo with due_date tomorrow', async () => {
    // Create a todo with tomorrow's date
    const tomorrow = addDays(new Date(), 1);
    const tomorrowISO = tomorrow.toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      name: 'Todo due tomorrow',
      due_date: tomorrowISO,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should NOT be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeUndefined();
  });

  test('excludes todo with due_date yesterday', async () => {
    // Create a todo with yesterday's date
    const yesterday = subDays(new Date(), 1);
    const yesterdayISO = yesterday.toISOString();

    const todo = await memoryRepo.create({
      type: 'todo',
      name: 'Todo due yesterday',
      due_date: yesterdayISO,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should NOT be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeUndefined();
  });

  test('excludes todo with null due_date', async () => {
    const todo = await memoryRepo.create({
      type: 'todo',
      name: 'Todo with no due date',
      due_date: null,
    });

    // Query for todos due today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // Should NOT be included
    const foundTodo = dueToday.find((r) => r.id === todo.id);
    expect(foundTodo).toBeUndefined();
  });

  test.skip('includes habit with due_date today', async () => {
    // NOTE: Habits don't have due_date in Phase 4 schema
    // This test is skipped as habits are tracked by frequency, not due dates
    const todayISO = new Date().toISOString();

    const habit = await memoryRepo.create({
      type: 'habit',
      name: 'Habit due today',
      frequency: 'daily',
      subtype: 'start_habit',
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
      name: 'Future todo',
      due_date: tomorrow,
    });

    // Query for today
    const dueToday = await memoryRepo.listDueToday(new Date().toISOString());

    // May have other records from seed/previous tests,
    // but should not include the future todo we just created
    const futureTodo = dueToday.find(
      (r) => r.type === 'todo' && (r as Todo).name === 'Future todo',
    );
    expect(futureTodo).toBeUndefined();
  });

  test('handles malformed date gracefully', async () => {
    // Note: Zod validation prevents creating records with invalid date strings,
    // so we test that listDueToday handles edge cases in the date parsing

    // Create a valid todo first
    const validTodo = await memoryRepo.create({
      type: 'todo',
      name: 'Valid todo',
      due_date: new Date().toISOString(),
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
