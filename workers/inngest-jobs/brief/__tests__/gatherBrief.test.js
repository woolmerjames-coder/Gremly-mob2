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

describe('their week, for the brief', () => {
  // Monday 5 October 2026; their weekly day is Sunday, so the review is of the week that starts today
  const AT = new Date('2026-10-05T07:30:00Z');
  const rows = (over = {}) => ({
    cortex_preferences: [{ day_boundary_hour: 3 }],
    user_daily_state: [{ dco: { pipeline: 'v4' } }],
    todos: [],
    habits: [],
    habit_progress: [],
    habit_plans: [],
    notification_preferences: [{ weekly_day: 0 }],
    weekly_reviews: [],
    ...over,
  });
  const gather = async (tables) => {
    userTimezone.mockResolvedValue('UTC');
    personIdentity.mockResolvedValue({});
    readThreadReaction.mockResolvedValue(null);
    sweepCounts.mockResolvedValue(null);
    const paths = [];
    db.mockReturnValue({
      select: jest.fn(async (path) => {
        paths.push(path);
        const table = path.split('?')[0];
        const hit = tables[table];
        if (hit instanceof Error) throw hit;
        return hit ?? [];
      }),
    });
    const g = await gatherBrief({}, 'user', { at: AT });
    return { g, paths };
  };
  const strength = {
    id: 'h1',
    name: 'Strength',
    cadence: 'weekly',
    target_per_period: 3,
    time_estimate_minutes: 45,
  };

  it('counts a Later that comes back today as due today', async () => {
    const { g } = await gather(
      rows({
        todos: [
          { id: 'due', name: 'Due today', due_day: '2026-10-05' },
          { id: 'back', name: 'Back today', due_day: null, resurface_at: '2026-10-05' },
          { id: 'away', name: 'Still put off', due_day: null, resurface_at: '2026-10-09' },
          { id: 'came', name: 'Came back last week', due_day: null, resurface_at: '2026-10-01' },
          { id: 'loose', name: 'No day', due_day: null },
        ],
      }),
    );
    expect(g.todosDue.map((t) => t.id)).toEqual(['due', 'back']);
    // so there is something to plan when it is the only thing today
    expect(g.candidates).toBe(2);
  });

  it('has a habit they planned for today among the habits for today, and checks in on it', async () => {
    const { g, paths } = await gather(
      rows({
        habits: [strength, { id: 'h2', name: 'Read', cadence: 'weekly', target_per_period: 1 }],
        habit_plans: [{ habit_id: 'h1', planned_date: '2026-10-05', status: 'planned' }],
      }),
    );
    expect(g.habitsForToday.map((h) => h.id)).toEqual(['h1']);
    expect(g.habitsForToday[0].plannedToday).toBe(true);
    expect(g.checkIn).toEqual({ id: 'h1', title: 'Strength', minutes: 45 });
    expect(paths.find((p) => p.startsWith('habit_plans'))).toContain('planned_date=eq.2026-10-05');
    expect(paths.find((p) => p.startsWith('habits'))).toContain(
      'quiet_until:views->>checkins_quiet_until',
    );
  });

  it('does not check in on one already done today, or quieted for the week', async () => {
    const plans = [{ habit_id: 'h1', planned_date: '2026-10-05', status: 'planned' }];
    const done = await gather(
      rows({
        habits: [strength],
        habit_plans: plans,
        habit_progress: [{ habit_id: 'h1', occurred_day: '2026-10-05' }],
      }),
    );
    expect(done.g.checkIn).toBeNull();
    const quiet = await gather(
      rows({ habits: [{ ...strength, quiet_until: '2026-10-11' }], habit_plans: plans }),
    );
    expect(quiet.g.checkIn).toBeNull();
  });

  it('offers the review on the morning after their weekly day until it is done', async () => {
    expect((await gather(rows())).g.reviewOffer).toBe(true);
    const started = rows({ weekly_reviews: [{ week_start: '2026-10-05', status: 'started' }] });
    expect((await gather(started)).g.reviewOffer).toBe(true);
    const done = rows({ weekly_reviews: [{ week_start: '2026-10-05', status: 'done' }] });
    expect((await gather(done)).g.reviewOffer).toBe(false);
    // last week's review, done, says nothing about this week
    const last = rows({ weekly_reviews: [{ week_start: '2026-09-28', status: 'done' }] });
    expect((await gather(last)).g.reviewOffer).toBe(true);
    // their weekly day is Friday: Monday is no longer one of the two days after
    const friday = rows({ notification_preferences: [{ weekly_day: 5 }] });
    expect((await gather(friday)).g.reviewOffer).toBe(false);
  });

  it('still gathers the day when their week cannot be read, with no check in and no offer', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { g } = await gather(
      rows({
        todos: [{ id: 'due', name: 'Due today', due_day: '2026-10-05' }],
        habits: [strength],
        habit_plans: new Error('habit_plans is down'),
        notification_preferences: new Error('settings are down'),
        weekly_reviews: new Error('reviews are down'),
      }),
    );
    expect(g.todosDue.map((t) => t.id)).toEqual(['due']);
    expect(g.checkIn).toBeNull();
    expect(g.reviewOffer).toBe(false);
    expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/habit_plans is down/);
    warn.mockRestore();
  });
});
