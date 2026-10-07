/**
 * The two changes the planner makes to a todo that did not fit the day
 * (usePlanFlow moveUnfit), run against the real checker: the shapes it sends
 * are ones the change model takes, and what comes back is what gets applied.
 */
import { checkChange } from '../../changes/model';

const TODAY = '2026-09-30';
const todo = { id: 't1', name: 'Buy Oat Milk', due_day: TODAY, due_time: null, views: {} };
const ctx = (item: Record<string, unknown> | null) => ({
  today: TODAY,
  item,
  worlds: [],
  chapters: [],
});
// their week as the app holds it: Monday to Sunday, with a review
const week = {
  first: TODAY,
  last: '2026-10-04',
  week_start: '2026-09-28',
  hours: { normal_day: 2, busy_day: 1, weekend_day: 4 },
  busy_days: [],
  has_review: true,
  intention: null,
  weekly_day: 0,
};

describe('a todo that did not fit the day', () => {
  it('moves to the next day as a change of its day', () => {
    const r = checkChange(
      { op: 'change', type: 'todo', id: 't1', fields: { day: '2026-10-01' } },
      ctx(todo) as any,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.change).toMatchObject({
      op: 'change',
      type: 'todo',
      id: 't1',
      fields: { day: '2026-10-01' },
      before: { day: TODAY },
    });
  });

  it('has nothing to change when it is already on that day', () => {
    const r = checkChange(
      { op: 'change', type: 'todo', id: 't1', fields: { day: '2026-10-01' } },
      ctx({ ...todo, due_day: '2026-10-01' }) as any,
    );
    expect(r).toMatchObject({ ok: false, reason: 'no_change' });
  });

  it('is put off for later with the day it comes back', () => {
    const r = checkChange({ op: 'later', type: 'todo', id: 't1', back_on: '2026-10-05' }, {
      ...ctx(todo),
      week,
    } as any);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.change).toMatchObject({
      op: 'later',
      type: 'todo',
      id: 't1',
      fields: { back_on: '2026-10-05' },
      before: { back_on: null, day: TODAY },
    });
  });
});
