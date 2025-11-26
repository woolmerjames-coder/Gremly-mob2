/**
 * Tests for schema alignment features:
 * - Lock-in persistence (locked_in + locked_in_at)
 * - Habit progress tracking (habit_progress table)
 * - Focus card management (focus_card table)
 */

import { MemoryRepo } from '../../lib/repo/memory';
import type { CreateRecordInput } from '../../lib/repo/IRepo';

describe('Lock-In Persistence', () => {
  let repo: MemoryRepo;
  let habitId: string;
  let todoId: string;

  beforeEach(async () => {
    repo = new MemoryRepo('lockin-user');

    // Create a habit
    const habit = await repo.create({
      type: 'habit',
      name: 'Morning Meditation',
      frequency: 'daily',
      subtype: 'start_habit',
      ai_placed: false,
    } as CreateRecordInput);
    habitId = habit.id;

    // Create a todo
    const todo = await repo.create({
      type: 'todo',
      name: 'Finish report',
      ai_placed: false,
    } as CreateRecordInput);
    todoId = todo.id;
  });

  describe('Habits', () => {
    test('addCommitment sets locked_in=true and locked_in_at timestamp', async () => {
      await repo.addCommitment(habitId, 'habit');

      const habit = await repo.getById(habitId);

      expect((habit as any).locked_in).toBe(true);
      expect((habit as any).locked_in_at).toBeTruthy();
      expect(typeof (habit as any).locked_in_at).toBe('string');
    });

    test('removeCommitment sets locked_in=false and locked_in_at=null', async () => {
      // First add a commitment
      await repo.addCommitment(habitId, 'habit');

      // Then remove it
      await repo.removeCommitment(habitId, 'habit');

      const habit = await repo.getById(habitId);

      expect((habit as any).locked_in).toBe(false);
      expect((habit as any).locked_in_at).toBeNull();
    });

    test('listCommitments returns habits with locked_in=true', async () => {
      await repo.addCommitment(habitId, 'habit');

      const commitments = await repo.listCommitments();
      const habitCommitment = commitments.find((c) => c.id === habitId);

      expect(habitCommitment).toBeTruthy();
      expect(habitCommitment?.type).toBe('habit');
      expect(habitCommitment?.name).toBe('Morning Meditation');
    });

    test('countActiveCommitments includes habits with locked_in=true', async () => {
      const countBefore = await repo.countActiveCommitments();
      await repo.addCommitment(habitId, 'habit');
      const countAfter = await repo.countActiveCommitments();

      expect(countAfter).toBe(countBefore + 1);
    });

    test('locked_in persists after other updates', async () => {
      // Lock in the habit
      await repo.addCommitment(habitId, 'habit');

      // Update some other field
      await repo.update({
        id: habitId,
        patch: { notes: 'Updated notes' } as any,
      });

      const habit = await repo.getById(habitId);

      // locked_in should still be true
      expect((habit as any).locked_in).toBe(true);
      expect((habit as any).locked_in_at).toBeTruthy();
      expect((habit as any).notes).toBe('Updated notes');
    });
  });

  describe('Todos', () => {
    test('addCommitment sets locked_in=true and locked_in_at timestamp', async () => {
      await repo.addCommitment(todoId, 'todo');

      const todo = await repo.getById(todoId);

      expect((todo as any).locked_in).toBe(true);
      expect((todo as any).locked_in_at).toBeTruthy();
      expect(typeof (todo as any).locked_in_at).toBe('string');
    });

    test('removeCommitment sets locked_in=false and locked_in_at=null', async () => {
      // First add a commitment
      await repo.addCommitment(todoId, 'todo');

      // Then remove it
      await repo.removeCommitment(todoId, 'todo');

      const todo = await repo.getById(todoId);

      expect((todo as any).locked_in).toBe(false);
      expect((todo as any).locked_in_at).toBeNull();
    });

    test('listCommitments returns todos with locked_in=true', async () => {
      await repo.addCommitment(todoId, 'todo');

      const commitments = await repo.listCommitments();
      const todoCommitment = commitments.find((c) => c.id === todoId);

      expect(todoCommitment).toBeTruthy();
      expect(todoCommitment?.type).toBe('todo');
      expect(todoCommitment?.name).toBe('Finish report');
    });
  });

  describe('Mixed Commitments', () => {
    test('listCommitments returns both habits and todos with locked_in=true', async () => {
      await repo.addCommitment(habitId, 'habit');
      await repo.addCommitment(todoId, 'todo');

      const commitments = await repo.listCommitments();
      const commitmentIds = commitments.map((c) => c.id);

      expect(commitmentIds).toContain(habitId);
      expect(commitmentIds).toContain(todoId);
      expect(commitments.length).toBeGreaterThanOrEqual(2);
    });

    test('countActiveCommitments counts both habits and todos', async () => {
      const countBefore = await repo.countActiveCommitments();

      await repo.addCommitment(habitId, 'habit');
      await repo.addCommitment(todoId, 'todo');

      const countAfter = await repo.countActiveCommitments();

      expect(countAfter).toBe(countBefore + 2);
    });
  });
});

describe('Habit Progress Tracking', () => {
  let repo: MemoryRepo;
  let habitId: string;

  beforeEach(async () => {
    repo = new MemoryRepo('progress-user');

    const habit = await repo.create({
      type: 'habit',
      name: 'Read 30 min',
      frequency: 'daily',
      subtype: 'start_habit',
      ai_placed: false,
    } as CreateRecordInput);
    habitId = habit.id;
  });

  test('logHabitProgress writes to habit_progress table', async () => {
    const today = new Date().toISOString();

    await (repo as any).logHabitProgress(habitId, today, 1);

    // Verify by reading back
    const todayDay = today.split('T')[0];
    const progress = await (repo as any).getHabitProgressForDate(habitId, todayDay);

    expect(progress).toBe(1);
  });

  test('logHabitProgress accumulates multiple completions for same day', async () => {
    const today = new Date().toISOString();
    const todayDay = today.split('T')[0];

    await (repo as any).logHabitProgress(habitId, today, 1);
    await (repo as any).logHabitProgress(habitId, today, 1);
    await (repo as any).logHabitProgress(habitId, today, 1);

    const progress = await (repo as any).getHabitProgressForDate(habitId, todayDay);

    expect(progress).toBe(3);
  });

  test('getHabitProgressForDate returns 0 for days with no progress', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = yesterday.toISOString().split('T')[0];

    const progress = await (repo as any).getHabitProgressForDate(habitId, yesterdayDay);

    expect(progress).toBe(0);
  });

  test('getHabitProgressForWeek sums progress across multiple days', async () => {
    const today = new Date();
    const todayIso = today.toISOString();
    const todayDay = todayIso.split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();
    const yesterdayDay = yesterdayIso.split('T')[0];

    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoIso = twoDaysAgo.toISOString();
    const twoDaysAgoDay = twoDaysAgoIso.split('T')[0];

    // Log progress for different days
    await (repo as any).logHabitProgress(habitId, todayIso, 2);
    await (repo as any).logHabitProgress(habitId, yesterdayIso, 1);
    await (repo as any).logHabitProgress(habitId, twoDaysAgoIso, 1);

    // Get week progress
    const weekProgress = await (repo as any).getHabitProgressForWeek(
      habitId,
      twoDaysAgoDay,
      todayDay,
    );

    expect(weekProgress).toBe(4); // 2 + 1 + 1
  });

  test('habit_progress tracks occurred_day separately from occurred_at', async () => {
    const morningTime = '2025-11-26T08:00:00.000Z';
    const eveningTime = '2025-11-26T20:00:00.000Z';

    // Log twice on same day at different times
    await (repo as any).logHabitProgress(habitId, morningTime, 1);
    await (repo as any).logHabitProgress(habitId, eveningTime, 1);

    const progress = await (repo as any).getHabitProgressForDate(habitId, '2025-11-26');

    expect(progress).toBe(2);
  });

  test('logHabitProgress accepts custom count values', async () => {
    const today = new Date().toISOString();
    const todayDay = today.split('T')[0];

    await (repo as any).logHabitProgress(habitId, today, 5);

    const progress = await (repo as any).getHabitProgressForDate(habitId, todayDay);

    expect(progress).toBe(5);
  });

  test('multiple habits track progress independently', async () => {
    const habit2 = await repo.create({
      type: 'habit',
      name: 'Exercise',
      frequency: 'daily',
      subtype: 'start_habit',
      ai_placed: false,
    } as CreateRecordInput);

    const today = new Date().toISOString();
    const todayDay = today.split('T')[0];

    await (repo as any).logHabitProgress(habitId, today, 2);
    await (repo as any).logHabitProgress(habit2.id, today, 3);

    const progress1 = await (repo as any).getHabitProgressForDate(habitId, todayDay);
    const progress2 = await (repo as any).getHabitProgressForDate(habit2.id, todayDay);

    expect(progress1).toBe(2);
    expect(progress2).toBe(3);
  });
});

describe('Focus Card Management', () => {
  let repo: MemoryRepo;
  let habitId: string;
  let todoId: string;

  beforeEach(async () => {
    repo = new MemoryRepo('focus-user');

    const habit = await repo.create({
      type: 'habit',
      name: 'Morning Pages',
      frequency: 'daily',
      subtype: 'start_habit',
      ai_placed: false,
    } as CreateRecordInput);
    habitId = habit.id;

    const todo = await repo.create({
      type: 'todo',
      name: 'Complete presentation',
      ai_placed: false,
    } as CreateRecordInput);
    todoId = todo.id;
  });

  test('setFocus creates focus card for a given day', async () => {
    const todayIso = new Date().toISOString();
    const todayDay = todayIso.split('T')[0];

    await (repo as any).setFocus({
      entry_id: habitId,
      entry_type: 'habit',
      source: 'user',
      expires_at: todayIso,
    });

    const focus = await (repo as any).getFocusForDate(todayDay);

    expect(focus).toBeTruthy();
    expect(focus?.entry_id).toBe(habitId);
    expect(focus?.entry_type).toBe('habit');
    expect(focus?.source).toBe('user');
  });

  test('setFocus replaces existing focus card for same day (uniqueness constraint)', async () => {
    const todayIso = new Date().toISOString();
    const todayDay = todayIso.split('T')[0];

    // Set focus to habit first
    await (repo as any).setFocus({
      entry_id: habitId,
      entry_type: 'habit',
      source: 'user',
      expires_at: todayIso,
    });

    // Replace with todo (same day since same expires_at)
    await (repo as any).setFocus({
      entry_id: todoId,
      entry_type: 'todo',
      source: 'auto',
      expires_at: todayIso,
    });

    const focus = await (repo as any).getFocusForDate(todayDay);

    expect(focus).toBeTruthy();
    expect(focus?.entry_id).toBe(todoId);
    expect(focus?.entry_type).toBe('todo');
    expect(focus?.source).toBe('auto');
  });

  test('getFocusForDate returns null when no focus set for day', async () => {
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const tomorrowDay = tomorrowIso.split('T')[0];

    const focus = await (repo as any).getFocusForDate(tomorrowDay);

    expect(focus).toBeNull();
  });

  test('clearFocusForDate removes focus card', async () => {
    const todayIso = new Date().toISOString();
    const todayDay = todayIso.split('T')[0];

    await (repo as any).setFocus({
      entry_id: habitId,
      entry_type: 'habit',
      source: 'user',
      expires_at: todayIso,
    });

    // Verify it was set
    let focus = await (repo as any).getFocusForDate(todayDay);
    expect(focus).toBeTruthy();

    // Clear it
    await (repo as any).clearFocusForDate(todayDay);

    // Verify it's gone
    focus = await (repo as any).getFocusForDate(todayDay);
    expect(focus).toBeNull();
  });

  test('focus cards for different days are independent', async () => {
    const today = new Date();
    const todayIso = today.toISOString();
    const todayDay = todayIso.split('T')[0];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString();
    const tomorrowDay = tomorrowIso.split('T')[0];

    await (repo as any).setFocus({
      entry_id: habitId,
      entry_type: 'habit',
      source: 'user',
      expires_at: todayIso,
    });

    await (repo as any).setFocus({
      entry_id: todoId,
      entry_type: 'todo',
      source: 'auto',
      expires_at: tomorrowIso,
    });

    const focusToday = await (repo as any).getFocusForDate(todayDay);
    const focusTomorrow = await (repo as any).getFocusForDate(tomorrowDay);

    expect(focusToday?.entry_id).toBe(habitId);
    expect(focusTomorrow?.entry_id).toBe(todoId);
  });

  test('setFocus accepts expires_at timestamp', async () => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const expiresDay = expiresAt.split('T')[0];

    await (repo as any).setFocus({
      entry_id: habitId,
      entry_type: 'habit',
      source: 'user',
      expires_at: expiresAt,
    });

    const focus = await (repo as any).getFocusForDate(expiresDay);

    expect(focus).toBeTruthy();
    expect(focus?.expires_at).toBe(expiresAt);
  });

  test.todo('setFocus works with null expires_at (SupabaseRepo)');

  test('focus card tracks creation timestamp', async () => {
    const beforeTime = Date.now();
    const todayIso = new Date().toISOString();
    const todayDay = todayIso.split('T')[0];

    await (repo as any).setFocus({
      entry_id: habitId,
      entry_type: 'habit',
      source: 'user',
      expires_at: todayIso,
    });

    const afterTime = Date.now();
    const focus = await (repo as any).getFocusForDate(todayDay);

    expect(focus).toBeTruthy();
    expect(focus?.created_at).toBeTruthy();
    if (focus?.created_at) {
      const createdAtTime = new Date(focus.created_at).getTime();
      expect(createdAtTime).toBeGreaterThanOrEqual(beforeTime);
      expect(createdAtTime).toBeLessThanOrEqual(afterTime);
    }
  });
});
