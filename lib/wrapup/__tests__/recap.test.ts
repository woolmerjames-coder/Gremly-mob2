/**
 * The day in counts for Gremly's opening card (lib/wrapup/recap): counted
 * from when the person's day started, with today's plan checked off.
 */
import { recapFrom, type RecapInput } from '../recap';
import type { PlanItem } from '../../brief/types';

const DAY = '2026-09-30';
// their day started at 3am on the 30th (Los Angeles), in UTC
const START = Date.parse('2026-09-30T10:00:00Z');

const plan = (id: string, kind: PlanItem['kind']): PlanItem =>
  ({ id, kind, title: id, start: 600, end: 630 }) as PlanItem;

const base = (): RecapInput => ({
  day: DAY,
  dayStartMs: START,
  todos: [
    { id: 't1', name: 'Send staffing notes', completed_at: '2026-09-30T18:00:00Z' },
    { id: 't2', name: 'Buy oat milk', completed_at: '2026-10-01T05:30:00Z' },
    { id: 't3', name: 'Book the car service', completed_at: null },
    { id: 't4', name: 'Done yesterday', completed_at: '2026-09-30T02:00:00Z' },
    { id: 't5', name: 'Dropped today', created_at: '2026-09-30T20:00:00Z', completed_at: null },
  ],
  habits: [
    { id: 'h1', name: 'Run' },
    { id: 'h2', name: 'Stretch' },
  ],
  habitProgress: [
    { habit_id: 'h1', occurred_day: DAY },
    { habit_id: 'h2', occurred_day: '2026-09-29' },
  ],
  notes: [
    { id: 'n1', title: 'Eye test', subtype: 'catchall', created_at: '2026-09-30T19:00:00Z' },
    {
      id: 'n2',
      title: 'Synced meeting',
      subtype: 'event',
      external_source: 'google',
      created_at: '2026-09-30T19:00:00Z',
    },
    { id: 'n3', title: 'Old idea', subtype: 'idea', created_at: '2026-09-20T19:00:00Z' },
  ],
  meetings: 8,
  plan: [plan('t1', 'todo'), plan('t3', 'todo'), plan('h1', 'habit'), plan('h2', 'habit')],
});

test('counts what was finished and dropped since their day started', () => {
  const r = recapFrom(base());
  // t2 was ticked off after midnight, still on their day; t4 was before it started
  expect(r.counts).toEqual({ todos: 2, habits: 1, meetings: 8, drops: 2 });
  expect(r.done).toEqual([
    { title: 'Send staffing notes', kind: 'todo' },
    { title: 'Buy oat milk', kind: 'todo' },
    { title: 'Run', kind: 'habit' },
  ]);
});

test('checks today’s plan: what was done, and the todos that did not happen', () => {
  const r = recapFrom(base());
  expect(r.planned).toEqual({ done: 2, total: 4 });
  // a planned habit not logged is checked in on the habit card, not named here
  expect(r.missed).toEqual([{ id: 't3', title: 'Book the car service' }]);
});

test('with no plan there is nothing to check', () => {
  const r = recapFrom({ ...base(), plan: null });
  expect(r.planned).toBeNull();
  expect(r.missed).toEqual([]);
});

test('a planned todo archived since is neither done nor missed', () => {
  const i = base();
  i.todos[2].archived = true;
  const r = recapFrom(i);
  expect(r.missed).toEqual([]);
  expect(r.planned).toEqual({ done: 2, total: 4 });
});
