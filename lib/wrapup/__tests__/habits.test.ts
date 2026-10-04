/**
 * The habits the wrap up checks in on (lib/wrapup/habits): still open on the
 * person's day, built ones first, broken ones always asked.
 */
import { habitsToCheckIn, runBefore } from '../habits';

const DAY = '2026-09-30'; // a Wednesday
const h = (id: string, more: Record<string, unknown> = {}) => ({
  id,
  name: id,
  subtype: 'start_habit',
  cadence: 'daily',
  target_per_period: 1,
  frequency: 'daily',
  start_date: '2026-09-01',
  ...more,
});
const logs = (id: string, ...days: string[]) =>
  days.map((d) => ({ habit_id: id, occurred_day: d }));

test('a daily habit not yet logged is open, with its run of days', () => {
  const out = habitsToCheckIn(
    [h('Blinkist'), h('Stretch'), h('Run')],
    [
      ...logs('Blinkist', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'),
      ...logs('Run', DAY),
    ],
    DAY,
  );
  expect(out.rows).toEqual([
    { id: 'Blinkist', title: 'Blinkist', kind: 'build', note: 'Daily, 4 days running' },
    { id: 'Stretch', title: 'Stretch', kind: 'build', note: 'Daily' },
  ]);
  expect(out.already).toEqual(['Run']);
});

test('a weekly habit is open until its week is met, and a fixed day one only on its days', () => {
  const weekly = h('Gym', { cadence: 'weekly', target_per_period: 3, frequency: '3x/week' });
  expect(habitsToCheckIn([weekly], logs('Gym', '2026-09-28'), DAY).rows).toEqual([
    { id: 'Gym', title: 'Gym', kind: 'build', note: '1 of 3 this week' },
  ]);
  expect(
    habitsToCheckIn([weekly], logs('Gym', '2026-09-28', '2026-09-29', '2026-09-27'), DAY).rows,
  ).toHaveLength(1);
  expect(
    habitsToCheckIn(
      [h('Gym', { cadence: 'weekly', target_per_period: 2, frequency: '2x/week' })],
      logs('Gym', '2026-09-28', '2026-09-29'),
      DAY,
    ).rows,
  ).toEqual([]);

  const wednesdays = h('Class', { cadence: 'weekly', days_active: [3] });
  const thursdays = h('Choir', { cadence: 'weekly', days_active: [4] });
  expect(habitsToCheckIn([wednesdays, thursdays], [], DAY).rows.map((r) => r.id)).toEqual([
    'Class',
  ]);
});

test('a habit being broken is always asked, after the ones being built', () => {
  const out = habitsToCheckIn(
    [h('No Coffee After 2pm', { subtype: 'break_habit' }), h('Stretch')],
    [],
    DAY,
  );
  expect(out.rows.map((r) => [r.id, r.kind])).toEqual([
    ['Stretch', 'build'],
    ['No Coffee After 2pm', 'break'],
  ]);
  // once it has an answer for the day it is not asked again
  expect(
    habitsToCheckIn(
      [h('No Coffee After 2pm', { subtype: 'break_habit' })],
      logs('No Coffee After 2pm', DAY),
      DAY,
    ),
  ).toEqual({ rows: [], already: ['No Coffee After 2pm'] });
});

test('archived, not started and finished habits are left out', () => {
  const out = habitsToCheckIn(
    [
      h('Archived', { archived: true }),
      h('No start', { start_date: null, start_date_confirmed: false }),
      h('Later', { start_date: '2026-10-05' }),
      h('Over', { end_date: '2026-09-20' }),
    ],
    [],
    DAY,
  );
  expect(out.rows).toEqual([]);
});

test('it is counted for the day given, so a late check in lands on their day', () => {
  // the calendar says 1 October; their day is still 30 September
  const progress = logs('Stretch', '2026-10-01');
  expect(habitsToCheckIn([h('Stretch')], progress, DAY).rows).toHaveLength(1);
  expect(habitsToCheckIn([h('Stretch')], progress, '2026-10-01').rows).toHaveLength(0);
});

test('a run counts back from the day before', () => {
  expect(runBefore(new Set(['2026-09-29', '2026-09-28']), DAY)).toBe(2);
  expect(runBefore(new Set(['2026-09-28']), DAY)).toBe(0);
});
