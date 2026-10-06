/**
 * What a day other than today holds (lib/plan/dayItems.ts).
 */
import { dueWords, habitsOnDay, todosDueOn } from '../dayItems';

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

  it('says a todo is due that day by its name', () => {
    expect(dueWords('2026-10-05', '2026-10-05')).toBe('Due today');
    expect(dueWords('2026-10-05', '2026-10-04')).toBe('Due Monday');
  });
});
