/**
 * Tests for lib/store/sweepHelpers.ts
 * Tests sweep prediction logic for todos, habits, and notes
 */

import {
  getTodoSweepPrediction,
  getHabitSweepPrediction,
  getNoteSweepPrediction,
  getSweepPrediction,
  type SweepPrediction,
} from '../sweepHelpers';
import { resetDateService, createDateService } from '../../date';
import type { Todo, Habit, Note } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const TODAY = '2025-12-22';
const YESTERDAY = '2025-12-21';
const TOMORROW = '2025-12-23';
const WEEK_AGO = '2025-12-15';
const TWO_WEEKS_AGO = '2025-12-08';

beforeEach(() => {
  resetDateService();
  // Set up DateService with fixed date for deterministic tests
  createDateService({
    clock: () => new Date(`${TODAY}T10:00:00`),
  });
});

afterEach(() => {
  resetDateService();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: `todo-${Math.random().toString(36).slice(2)}`,
    type: 'todo',
    name: 'Test Todo',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    ...overrides,
  } as Todo;
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: `habit-${Math.random().toString(36).slice(2)}`,
    type: 'habit',
    name: 'Test Habit',
    frequency: 'daily',
    subtype: 'start_habit',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    ...overrides,
  } as Habit;
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    type: 'note',
    body: 'Test note body',
    subtype: 'catchall',
    owner_id: 'user-1',
    created_at: `${TODAY}T10:00:00Z`,
    updated_at: `${TODAY}T10:00:00Z`,
    archived: false,
    ai_placed: false,
    ...overrides,
  } as Note;
}

// ═══════════════════════════════════════════════════════════════════════════════
// getTodoSweepPrediction
// ═══════════════════════════════════════════════════════════════════════════════

describe('getTodoSweepPrediction', () => {
  it('returns "-" for completed todos', () => {
    const todo = makeTodo({ completed_at: `${TODAY}T09:00:00Z` });
    const result = getTodoSweepPrediction(todo);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "-" for archived todos', () => {
    const todo = makeTodo({ archived: true });
    const result = getTodoSweepPrediction(todo);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "Next Sweep" for overdue todos', () => {
    const todo = makeTodo({ due_day: YESTERDAY });
    const result = getTodoSweepPrediction(todo);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for todos due today', () => {
    const todo = makeTodo({ due_day: TODAY });
    const result = getTodoSweepPrediction(todo);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for undated todos', () => {
    const todo = makeTodo({ due_day: null });
    const result = getTodoSweepPrediction(todo);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for undated todos (undefined)', () => {
    const todo = makeTodo({ due_day: undefined });
    const result = getTodoSweepPrediction(todo);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for skipped todos', () => {
    const todo = makeTodo({
      due_day: TOMORROW,
      skipped_in_sweep_at: `${TODAY}T08:00:00Z`,
    });
    const result = getTodoSweepPrediction(todo);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns date label for future dated todos', () => {
    const todo = makeTodo({ due_day: TOMORROW });
    const result = getTodoSweepPrediction(todo);
    expect(result.type).toBe('date');
    expect(result.label).toBeTruthy();
    if (result.type === 'date') {
      expect(result.date).toBe(TOMORROW);
    }
  });

  it('returns date label for far future todos', () => {
    const todo = makeTodo({ due_day: '2025-12-31' });
    const result = getTodoSweepPrediction(todo);
    expect(result.type).toBe('date');
    if (result.type === 'date') {
      expect(result.date).toBe('2025-12-31');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getHabitSweepPrediction
// ═══════════════════════════════════════════════════════════════════════════════

describe('getHabitSweepPrediction', () => {
  it('returns "-" for archived habits', () => {
    const habit = makeHabit({ archived: true });
    const result = getHabitSweepPrediction(habit);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "Next Sweep" for unconfirmed habits (start_date_confirmed = false)', () => {
    const habit = makeHabit({ start_date_confirmed: false });
    const result = getHabitSweepPrediction(habit);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for unconfirmed habits (start_date_confirmed = undefined)', () => {
    const habit = makeHabit({ start_date_confirmed: undefined });
    const result = getHabitSweepPrediction(habit);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for unconfirmed habits (start_date_confirmed = null)', () => {
    const habit = makeHabit({ start_date_confirmed: null as any });
    const result = getHabitSweepPrediction(habit);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "-" for confirmed habits (start_date_confirmed = true)', () => {
    const habit = makeHabit({ start_date_confirmed: true });
    const result = getHabitSweepPrediction(habit);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "-" for confirmed habits with start_date set', () => {
    const habit = makeHabit({
      start_date_confirmed: true,
      start_date: TODAY,
    });
    const result = getHabitSweepPrediction(habit);
    expect(result).toEqual({ type: 'none', label: '-' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getNoteSweepPrediction
// ═══════════════════════════════════════════════════════════════════════════════

describe('getNoteSweepPrediction', () => {
  it('returns "-" for archived notes', () => {
    const note = makeNote({ archived: true });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "-" for journals (never appear in sweep)', () => {
    const note = makeNote({ subtype: 'journal' });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "Next Sweep" for skipped notes', () => {
    const note = makeNote({
      subtype: 'catchall',
      created_at: `${WEEK_AGO}T10:00:00Z`,
      skipped_in_sweep_at: `${TODAY}T08:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  // Ideas: recent (< 7 days) appear in sweep
  it('returns "Next Sweep" for recent ideas (created today)', () => {
    const note = makeNote({
      subtype: 'idea',
      created_at: `${TODAY}T10:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for recent ideas (created 6 days ago)', () => {
    const note = makeNote({
      subtype: 'idea',
      created_at: `2025-12-16T10:00:00Z`, // 6 days ago from TODAY
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "-" for old ideas (created > 7 days ago)', () => {
    const note = makeNote({
      subtype: 'idea',
      created_at: `${TWO_WEEKS_AGO}T10:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  // Catchall/list/reference: only today's appear in sweep
  it('returns "Next Sweep" for catchall created today', () => {
    const note = makeNote({
      subtype: 'catchall',
      created_at: `${TODAY}T10:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for list created today', () => {
    const note = makeNote({
      subtype: 'list',
      created_at: `${TODAY}T10:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "Next Sweep" for reference created today', () => {
    const note = makeNote({
      subtype: 'reference',
      created_at: `${TODAY}T10:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('returns "-" for catchall created yesterday', () => {
    const note = makeNote({
      subtype: 'catchall',
      created_at: `${YESTERDAY}T10:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "-" for list created a week ago', () => {
    const note = makeNote({
      subtype: 'list',
      created_at: `${WEEK_AGO}T10:00:00Z`,
    });
    const result = getNoteSweepPrediction(note);
    expect(result).toEqual({ type: 'none', label: '-' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getSweepPrediction (unified dispatcher)
// ═══════════════════════════════════════════════════════════════════════════════

describe('getSweepPrediction', () => {
  it('routes todos to getTodoSweepPrediction', () => {
    const todo = makeTodo({ due_day: TODAY });
    const result = getSweepPrediction(todo);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('routes habits to getHabitSweepPrediction', () => {
    const habit = makeHabit({ start_date_confirmed: false });
    const result = getSweepPrediction(habit);
    expect(result).toEqual({ type: 'next', label: 'Next Sweep' });
  });

  it('routes notes to getNoteSweepPrediction', () => {
    const note = makeNote({ subtype: 'journal' });
    const result = getSweepPrediction(note);
    expect(result).toEqual({ type: 'none', label: '-' });
  });

  it('returns "-" for unknown types', () => {
    const unknown = { type: 'unknown' } as any;
    const result = getSweepPrediction(unknown);
    expect(result).toEqual({ type: 'none', label: '-' });
  });
});
