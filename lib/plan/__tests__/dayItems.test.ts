/**
 * What a day other than today holds (lib/plan/dayItems.ts).
 */
import { dueWords, habitsOnDay, stepGoal, todoDayWords, todosDueOn } from '../dayItems';

describe('what another day holds', () => {
  it('has the open todos due on it', () => {
    const todos = [
      { id: 'a', due_day: '2026-10-05' },
      { id: 'b', due_day: '2026-10-05', completed_at: 'x' },
      { id: 'c', due_day: '2026-10-05', archived: true },
      { id: 'd', due_day: '2026-10-04' },
    ];
    expect(todosDueOn(todos, '2026-10-05').map((t) => t.id)).toEqual(['a']);
  });

  it('has the todos put off that come back on it, which have no day of their own', () => {
    const todos = [
      { id: 'back', due_day: null, resurface_at: '2026-10-05' },
      { id: 'back-later', due_day: null, resurface_at: '2026-10-06' },
      // given a day of its own since: that day decides
      { id: 'moved-on', due_day: '2026-10-07', resurface_at: '2026-10-05' },
      { id: 'done', due_day: null, resurface_at: '2026-10-05', completed_at: 'x' },
    ];
    expect(todosDueOn(todos, '2026-10-05').map((t) => t.id)).toEqual(['back']);
  });

  it('has the habits on for it: daily, or set for its weekday, started and not ended', () => {
    const habits = [
      { id: 'daily', start_date: '2026-09-01' },
      { id: 'mondays', start_date: '2026-09-01', cadence: 'weekly', days_active: [1] },
      { id: 'tuesdays', start_date: '2026-09-01', cadence: 'weekly', days_active: [2] },
      { id: 'later', start_date: '2026-10-06' },
      { id: 'ended', start_date: '2026-09-01', end_date: '2026-10-01' },
    ];
    // 5 October 2026 is a Monday
    expect(habitsOnDay(habits, '2026-10-05').map((h) => h.id)).toEqual(['daily', 'mondays']);
  });

  it('leaves out a habit paused on it', () => {
    const habits = [
      { id: 'daily', start_date: '2026-09-01' },
      { id: 'mondays', start_date: '2026-09-01', cadence: 'weekly', days_active: [1] },
    ];
    const ease = (habit_id: string, mode: 'pause' | 'floor', last: string) => ({
      id: `${mode}-${habit_id}`,
      owner_id: 'u',
      habit_id,
      mode,
      period_start: '2026-10-01',
      period_end: last,
      created_at: '2026-10-01T08:00:00Z',
      updated_at: '2026-10-01T08:00:00Z',
    });
    // 5 October 2026 is a Monday
    const paused = [ease('daily', 'pause', '2026-10-05')];
    expect(habitsOnDay(habits, '2026-10-05', paused).map((h) => h.id)).toEqual(['mondays']);
    // the day after the pause ends it is on again
    expect(habitsOnDay(habits, '2026-10-06', paused).map((h) => h.id)).toEqual(['daily']);
    // a lighter version changes nothing about when it is on
    const lighter = [ease('daily', 'floor', '2026-10-05')];
    expect(habitsOnDay(habits, '2026-10-05', lighter).map((h) => h.id)).toEqual([
      'daily',
      'mondays',
    ]);
  });

  it('says a todo is due that day by its name', () => {
    expect(dueWords('2026-10-05', '2026-10-05')).toBe('Due today');
    expect(dueWords('2026-10-05', '2026-10-04')).toBe('Due Monday');
  });
});

describe('why a todo is on a day', () => {
  const step = {
    due_day: '2026-10-05',
    views: { milestone: { goal: ' Send the grant application ', date: '2026-10-20' } },
  };
  it('names the goal a milestone step is a step towards', () => {
    expect(stepGoal(step)).toBe('Send the grant application');
    expect(stepGoal({ due_day: '2026-10-05' })).toBeNull();
    expect(stepGoal({ views: { milestone: { goal: '  ' } } })).toBeNull();
    expect(stepGoal(null)).toBeNull();
    expect(todoDayWords(step, '2026-10-05', '2026-10-05')).toBe(
      'A step towards Send the grant application',
    );
  });

  it('says a Later is back on the day it comes back, and otherwise when it is due', () => {
    const back = { due_day: null, resurface_at: '2026-10-05' };
    expect(todoDayWords(back, '2026-10-05', '2026-10-05')).toBe('Back from Later');
    expect(todoDayWords(back, '2026-10-06', '2026-10-05')).toBe('Due Tuesday');
    expect(todoDayWords({ due_day: '2026-10-05' }, '2026-10-05', '2026-10-05')).toBe('Due today');
    expect(todoDayWords({ due_day: '2026-10-06' }, '2026-10-06', '2026-10-05')).toBe('Due Tuesday');
  });
});
