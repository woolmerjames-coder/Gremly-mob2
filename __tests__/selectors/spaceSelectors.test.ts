/**
 * Unit tests for space selectors (Phase 8+ Spaces v2)
 */

import { startOfWeek, addDays, formatISO } from 'date-fns';
import {
  getSchedulePreview,
  listHabitsForSpace,
  listTodosForSpace,
  listNotesForSpace,
  countJournalForSpace,
} from '../../lib/selectors/spaceSelectors';
import type { AppRecord, Habit, Todo, Note } from '../../lib/types';

describe('Spaces v2 - Space Selectors', () => {
  const spaceId = 'space-123';
  const otherSpaceId = 'space-456';
  const userId = 'test-user';

  // Helper to create test records
  const createHabit = (overrides: Partial<Habit> = {}): Habit => ({
    id: `habit-${Math.random()}`,
    type: 'habit',
    name: 'Test Habit',
    frequency: 'daily',
    subtype: 'start_habit',
    space_id: spaceId,
    ai_placed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_id: userId,
    ...overrides,
  });

  const createTodo = (overrides: Partial<Todo> = {}): Todo => ({
    id: `todo-${Math.random()}`,
    type: 'todo',
    name: 'Test Todo',
    title: 'Test Todo',
    space_id: spaceId,
    ai_placed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_id: userId,
    ...overrides,
  });

  const createNote = (overrides: Partial<Note> = {}): Note => ({
    id: `note-${Math.random()}`,
    type: 'note',
    subtype: 'catchall',
    title: 'Test Note',
    body: 'Test body',
    space_id: spaceId,
    ai_placed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    owner_id: userId,
    ...overrides,
  });

  describe('getSchedulePreview', () => {
    it('should return todos with due dates in the week', () => {
      const weekStart = formatISO(startOfWeek(new Date()), { representation: 'date' });
      const weekMiddle = formatISO(addDays(startOfWeek(new Date()), 3), { representation: 'date' });

      const items: AppRecord[] = [
        createTodo({ due_date: weekMiddle }), // Should be included
        createTodo({ due_date: null }), // No due date
        createTodo({ due_date: '2020-01-01' }), // Outside week
      ];

      const preview = getSchedulePreview(items, spaceId, weekStart);

      expect(preview.length).toBe(1);
      expect(preview[0].id).toBe(items[0].id);
    });

    it('should return habits with start dates in the week', () => {
      const weekStart = formatISO(startOfWeek(new Date()), { representation: 'date' });
      const weekMiddle = formatISO(addDays(startOfWeek(new Date()), 2), { representation: 'date' });

      const items: AppRecord[] = [
        createHabit({ start_date: weekMiddle }), // Should be included
        createHabit({ start_date: null }), // No start date
        createHabit({ start_date: '2020-01-01' }), // Outside week
      ];

      const preview = getSchedulePreview(items, spaceId, weekStart);

      expect(preview.length).toBe(1);
      expect(preview[0].id).toBe(items[0].id);
    });

    it('should filter by space_id', () => {
      const weekStart = formatISO(startOfWeek(new Date()), { representation: 'date' });
      const weekMiddle = formatISO(addDays(startOfWeek(new Date()), 3), { representation: 'date' });

      const items: AppRecord[] = [
        createTodo({ space_id: spaceId, due_date: weekMiddle }),
        createTodo({ space_id: otherSpaceId, due_date: weekMiddle }),
      ];

      const preview = getSchedulePreview(items, spaceId, weekStart);

      expect(preview.length).toBe(1);
      expect(preview[0]).toHaveProperty('space_id', spaceId);
    });

    it('should return empty array if no scheduled items', () => {
      const weekStart = formatISO(startOfWeek(new Date()), { representation: 'date' });
      const items: AppRecord[] = [
        createTodo({ due_date: null }),
        createHabit({ start_date: null }),
      ];

      const preview = getSchedulePreview(items, spaceId, weekStart);

      expect(preview).toEqual([]);
    });
  });

  describe('listHabitsForSpace', () => {
    it('should return all habits for a space', () => {
      const items: AppRecord[] = [createHabit(), createHabit(), createTodo(), createNote()];

      const habits = listHabitsForSpace(items, spaceId);

      expect(habits.length).toBe(2);
      expect(habits.every((h) => h.type === 'habit')).toBe(true);
    });

    it('should filter by space_id', () => {
      const items: AppRecord[] = [
        createHabit({ space_id: spaceId }),
        createHabit({ space_id: otherSpaceId }),
      ];

      const habits = listHabitsForSpace(items, spaceId);

      expect(habits.length).toBe(1);
      expect(habits[0].space_id).toBe(spaceId);
    });

    it('should respect limit option', () => {
      const items: AppRecord[] = [
        createHabit(),
        createHabit(),
        createHabit(),
        createHabit(),
        createHabit(),
      ];

      const habits = listHabitsForSpace(items, spaceId, { limit: 3 });

      expect(habits.length).toBe(3);
    });

    it('should return empty array if no habits', () => {
      const items: AppRecord[] = [createTodo(), createNote()];

      const habits = listHabitsForSpace(items, spaceId);

      expect(habits).toEqual([]);
    });
  });

  describe('listTodosForSpace', () => {
    it('should return all todos for a space', () => {
      const items: AppRecord[] = [createTodo(), createTodo(), createHabit(), createNote()];

      const todos = listTodosForSpace(items, spaceId);

      expect(todos.length).toBe(2);
      expect(todos.every((t) => t.type === 'todo')).toBe(true);
    });

    it('should filter by space_id', () => {
      const items: AppRecord[] = [
        createTodo({ space_id: spaceId }),
        createTodo({ space_id: otherSpaceId }),
      ];

      const todos = listTodosForSpace(items, spaceId);

      expect(todos.length).toBe(1);
      expect(todos[0].space_id).toBe(spaceId);
    });

    it('should respect limit option', () => {
      const items: AppRecord[] = [createTodo(), createTodo(), createTodo(), createTodo()];

      const todos = listTodosForSpace(items, spaceId, { limit: 2 });

      expect(todos.length).toBe(2);
    });
  });

  describe('listNotesForSpace', () => {
    it('should return all notes for a space', () => {
      const items: AppRecord[] = [createNote(), createNote(), createHabit(), createTodo()];

      const notes = listNotesForSpace(items, spaceId);

      expect(notes.length).toBe(2);
      expect(notes.every((n) => n.type === 'note')).toBe(true);
    });

    it('should filter by space_id', () => {
      const items: AppRecord[] = [
        createNote({ space_id: spaceId }),
        createNote({ space_id: otherSpaceId }),
      ];

      const notes = listNotesForSpace(items, spaceId);

      expect(notes.length).toBe(1);
      expect(notes[0].space_id).toBe(spaceId);
    });

    it('should filter by subtype', () => {
      const items: AppRecord[] = [
        createNote({ subtype: 'journal' }),
        createNote({ subtype: 'idea' }),
        createNote({ subtype: 'journal' }),
        // Lists are no longer a subtype; they are expressed as has_list + list_items
        createNote({ subtype: 'reference', has_list: true }),
      ];

      const journals = listNotesForSpace(items, spaceId, { subtype: 'journal' });

      expect(journals.length).toBe(2);
      expect(journals.every((n) => n.subtype === 'journal')).toBe(true);
    });

    it('should respect limit option', () => {
      const items: AppRecord[] = [createNote(), createNote(), createNote(), createNote()];

      const notes = listNotesForSpace(items, spaceId, { limit: 2 });

      expect(notes.length).toBe(2);
    });

    it('should combine subtype and limit options', () => {
      const items: AppRecord[] = [
        createNote({ subtype: 'idea' }),
        createNote({ subtype: 'idea' }),
        createNote({ subtype: 'idea' }),
        createNote({ subtype: 'reference', has_list: true }),
      ];

      const ideas = listNotesForSpace(items, spaceId, { subtype: 'idea', limit: 2 });

      expect(ideas.length).toBe(2);
      expect(ideas.every((n) => n.subtype === 'idea')).toBe(true);
    });
  });

  describe('countJournalForSpace', () => {
    const createJournal = (dateOrCreatedAt?: string): Note => {
      const now = dateOrCreatedAt || new Date().toISOString();
      return createNote({
        subtype: 'journal',
        date: dateOrCreatedAt,
        created_at: now,
      });
    };

    it('should count all journals when timeframe is "all"', () => {
      const items: AppRecord[] = [
        createJournal(),
        createJournal(),
        createJournal(),
        createNote({ subtype: 'idea' }), // Not a journal
      ];

      const count = countJournalForSpace(items, spaceId, { timeframe: 'all' });

      expect(count).toBe(3);
    });

    it('should count journals for today', () => {
      const today = formatISO(new Date(), { representation: 'date' });
      const yesterday = formatISO(addDays(new Date(), -1), { representation: 'date' });

      const items: AppRecord[] = [
        createJournal(today),
        createJournal(today),
        createJournal(yesterday),
      ];

      const count = countJournalForSpace(items, spaceId, { timeframe: 'today' });

      expect(count).toBe(2);
    });

    it('should count journals for this week', () => {
      const today = formatISO(new Date(), { representation: 'date' });
      const lastWeek = formatISO(addDays(new Date(), -10), { representation: 'date' });

      const items: AppRecord[] = [
        createJournal(today),
        createJournal(today),
        createJournal(lastWeek),
      ];

      const count = countJournalForSpace(items, spaceId, { timeframe: 'week' });

      expect(count).toBe(2);
    });

    it('should filter by space_id', () => {
      const items: AppRecord[] = [
        createNote({ subtype: 'journal', space_id: spaceId }),
        createNote({ subtype: 'journal', space_id: otherSpaceId }),
      ];

      const count = countJournalForSpace(items, spaceId);

      expect(count).toBe(1);
    });

    it('should return 0 if no journals exist', () => {
      const items: AppRecord[] = [createNote({ subtype: 'idea' }), createTodo(), createHabit()];

      const count = countJournalForSpace(items, spaceId);

      expect(count).toBe(0);
    });

    it('should default to "all" timeframe when not specified', () => {
      const items: AppRecord[] = [createJournal(), createJournal(), createJournal()];

      const count = countJournalForSpace(items, spaceId);

      expect(count).toBe(3);
    });
  });
});
