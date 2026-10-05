/**
 * @jest-environment node
 */
import { gatherBrief } from '../data';
import { db, userTimezone, personIdentity } from '../../context/db';
import { readThreadReaction } from '../reaction';
import { sweepCounts } from '../../notifications/sweepCount';

jest.mock('../../context/db', () => ({
  ...jest.requireActual('../../context/db'),
  db: jest.fn(),
  userTimezone: jest.fn(async () => 'UTC'),
  personIdentity: jest.fn(async () => ({})),
}));
jest.mock('../../context/daily', () => ({ buildDcoV4: jest.fn(), writeDco: jest.fn() }));
jest.mock('../reaction', () => ({ readThreadReaction: jest.fn(async () => null) }));
jest.mock('../../notifications/sweepCount', () => ({
  sweepCounts: jest.fn(async () => null),
}));

test('after midnight the brief gathers the person day, not the next calendar day', async () => {
  userTimezone.mockResolvedValue('UTC');
  personIdentity.mockResolvedValue({});
  readThreadReaction.mockResolvedValue(null);
  sweepCounts.mockResolvedValue(null);
  const paths = [];
  db.mockReturnValue({
    select: jest.fn(async (path) => {
      paths.push(path);
      if (path.startsWith('cortex_preferences')) return [{ day_boundary_hour: 3 }];
      if (path.startsWith('user_daily_state')) return [{ dco: { pipeline: 'v4' } }];
      if (path.startsWith('todos')) {
        return [
          { id: 'today', name: 'Monday task', due_day: '2026-10-05' },
          { id: 'tomorrow', name: 'Tuesday task', due_day: '2026-10-06' },
        ];
      }
      if (path.startsWith('habits')) {
        return [
          { id: 'monday', name: 'Monday habit', cadence: 'weekly', days_active: [1] },
          { id: 'tuesday', name: 'Tuesday habit', start_date: '2026-10-06' },
        ];
      }
      return [];
    }),
  });
  const result = await gatherBrief({}, 'user', { at: new Date('2026-10-06T00:30:00Z') });
  expect(result.today).toBe('2026-10-05');
  expect(result.ritualDay).toBe('2026-10-05');
  expect(result.day.date).toBe('2026-10-05');
  expect(result.todosDue.map((t) => t.id)).toEqual(['today']);
  expect(result.habits.map((h) => h.id)).toEqual(['monday']);
  expect(paths.find((p) => p.startsWith('user_daily_state'))).toContain('date=eq.2026-10-05');
  expect(paths.find((p) => p.startsWith('habit_progress'))).toContain(
    'occurred_day=lte.2026-10-05',
  );
});
