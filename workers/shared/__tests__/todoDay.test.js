/**
 * todoDay.js: a todo with no planned day is on its deadline day and overdue
 * once the deadline has passed; a planned day always wins.
 */
import {
  dayOnly,
  deadlineWords,
  hasUnscheduledDeadline,
  isTodoOn,
  isTodoOnOrBefore,
  isTodoOverdue,
  isTodoUndated,
  plannedDayOf,
  todoDayKind,
  todoDayFilter,
  todoDayOf,
  todoDayRangeFilter,
  todoOnOrBeforeFilter,
} from '../todoDay.js';

const deadlineOnly = { due_day: null, scheduled_date: null, target_date: '2026-10-12' };
const planned = { due_day: '2026-10-10', target_date: '2026-10-12' };

describe('a deadline only todo', () => {
  it('is on its deadline day', () => {
    expect(todoDayOf(deadlineOnly)).toBe('2026-10-12');
    expect(todoDayKind(deadlineOnly)).toBe('deadline');
    expect(isTodoOn(deadlineOnly, '2026-10-12')).toBe(true);
    expect(isTodoOn(deadlineOnly, '2026-10-11')).toBe(false);
  });

  it('is not overdue on or before its deadline, and overdue after', () => {
    expect(isTodoOverdue(deadlineOnly, '2026-10-11')).toBe(false);
    expect(isTodoOverdue(deadlineOnly, '2026-10-12')).toBe(false);
    expect(isTodoOverdue(deadlineOnly, '2026-10-13')).toBe(true);
    expect(isTodoOnOrBefore(deadlineOnly, '2026-10-13')).toBe(true);
  });

  it('reads Due today on its deadline, then Overdue', () => {
    expect(deadlineWords(deadlineOnly, '2026-10-11')).toBeNull();
    expect(deadlineWords(deadlineOnly, '2026-10-12')).toBe('Due today');
    expect(deadlineWords(deadlineOnly, '2026-10-13')).toBe('Overdue');
  });

  it('still has no planned day, so it waits for one', () => {
    expect(plannedDayOf(deadlineOnly)).toBeNull();
    expect(hasUnscheduledDeadline(deadlineOnly)).toBe(true);
    expect(isTodoUndated(deadlineOnly)).toBe(false);
  });
});

describe('a planned todo', () => {
  it('is on its planned day, whatever its deadline', () => {
    expect(todoDayOf(planned)).toBe('2026-10-10');
    expect(todoDayKind(planned)).toBe('planned');
    expect(isTodoOn(planned, '2026-10-12')).toBe(false);
    expect(isTodoOverdue(planned, '2026-10-11')).toBe(true);
    expect(hasUnscheduledDeadline(planned)).toBe(false);
    expect(deadlineWords(planned, '2026-10-12')).toBeNull();
  });

  it('reads scheduled_date when due_day is empty, and a caller can pass its own planned day', () => {
    expect(todoDayOf({ scheduled_date: '2026-10-09', target_date: '2026-10-12' })).toBe(
      '2026-10-09',
    );
    expect(todoDayOf(deadlineOnly, '2026-10-08')).toBe('2026-10-08');
  });
});

describe('a todo with no day at all', () => {
  it('is on no day and never overdue', () => {
    const none = { due_day: null, scheduled_date: null, target_date: null };
    expect(todoDayOf(none)).toBeNull();
    expect(isTodoUndated(none)).toBe(true);
    expect(isTodoOverdue(none, '2030-01-01')).toBe(false);
    expect(todoDayKind(none)).toBeNull();
  });
});

describe('days', () => {
  it('takes the date part of a date value and refuses anything else', () => {
    expect(dayOnly('2026-10-12')).toBe('2026-10-12');
    expect(dayOnly('2026-10-12T00:00:00')).toBe('2026-10-12');
    expect(dayOnly('soon')).toBeNull();
    expect(dayOnly(null)).toBeNull();
  });

  it('gives the same rule as a PostgREST filter', () => {
    expect(todoOnOrBeforeFilter('2026-10-12')).toBe(
      'due_day.lte.2026-10-12,and(due_day.is.null,scheduled_date.lte.2026-10-12),and(due_day.is.null,scheduled_date.is.null,target_date.lte.2026-10-12)',
    );
    expect(todoDayFilter('eq', '2026-10-12')).toBe(
      'due_day.eq.2026-10-12,and(due_day.is.null,scheduled_date.eq.2026-10-12),and(due_day.is.null,scheduled_date.is.null,target_date.eq.2026-10-12)',
    );
    expect(todoDayRangeFilter('2026-10-12', '2026-10-18')).toBe(
      'and(due_day.gte.2026-10-12,due_day.lte.2026-10-18),and(due_day.is.null,scheduled_date.gte.2026-10-12,scheduled_date.lte.2026-10-18),and(due_day.is.null,scheduled_date.is.null,target_date.gte.2026-10-12,target_date.lte.2026-10-18)',
    );
    expect(() => todoDayFilter('like', '2026-10-12')).toThrow();
  });
});
