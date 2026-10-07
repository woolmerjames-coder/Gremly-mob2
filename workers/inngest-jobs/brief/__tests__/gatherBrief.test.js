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

  it('does not count a habit they are breaking as one for today, something to plan, or planned', async () => {
    const { g } = await gather(
      rows({
        habits: [
          { id: 'h1', name: 'Read', cadence: 'daily' },
          {
            id: 'b1',
            name: 'No sugar',
            subtype: 'break_habit',
            cadence: 'weekly',
            days_active: [1],
            scheduled_start_iso: '2026-10-05T09:00:00Z',
          },
        ],
      }),
    );
    // it falls on today (a Monday) and has a time, and is still nothing to do:
    // not one of the habits for today, and not a candidate for the plan
    expect(g.habitsForToday.map((h) => h.id)).toEqual(['h1']);
    expect(g.candidates).toBe(1);
    expect(g.planned).toEqual([]);
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

  describe('habits counted in their own week', () => {
    // logged on Wednesday 30 September and Thursday 1 October; today is Monday 5 October
    const logged = [
      { habit_id: 'h1', occurred_day: '2026-09-30' },
      { habit_id: 'h1', occurred_day: '2026-10-01' },
    ];

    it('starts a Sunday person on Monday, so last week is not counted', async () => {
      const { g, paths } = await gather(rows({ habits: [strength], habit_progress: logged }));
      expect(g.habits[0]).toMatchObject({ id: 'h1', done: 0, target: 3, behind: false });
      expect(g.habitsForToday).toEqual([]);
      // read from the earliest day any week holding today can begin
      const read = paths.find((p) => p.startsWith('habit_progress'));
      expect(read).toContain('occurred_day=gte.2026-09-29');
      expect(read).toContain('occurred_day=lte.2026-10-05');
    });

    it('starts a Wednesday person on Thursday', async () => {
      const { g } = await gather(
        rows({
          habits: [strength],
          habit_progress: logged,
          notification_preferences: [{ weekly_day: 3 }],
        }),
      );
      // Thursday's counts and Wednesday's does not; Monday is day five of their
      // week, by when two of three should be done
      expect(g.habits[0]).toMatchObject({ id: 'h1', done: 1, target: 3, behind: true });
      expect(g.habitsForToday.map((h) => h.id)).toEqual(['h1']);
      expect(g.candidates).toBe(1);
    });

    it('counts from Monday when their weekly day cannot be read', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { g } = await gather(
        rows({
          habits: [strength],
          habit_progress: logged,
          notification_preferences: new Error('settings are down'),
        }),
      );
      expect(g.habits[0]).toMatchObject({ done: 0, behind: false });
      warn.mockRestore();
    });
  });

  describe('a habit paused, or on a lighter version', () => {
    const plans = [{ habit_id: 'h1', planned_date: '2026-10-05', status: 'planned' }];
    const stretch = (mode, period_start, period_end, floor_note = null) => ({
      id: `${mode}-${period_start}`,
      habit_id: 'h1',
      mode,
      period_start,
      period_end,
      floor_note,
    });
    const daily = { id: 'h2', name: 'Stretch', cadence: 'daily' };

    it('reads the stretches that reach into any week holding today', async () => {
      const { g, paths } = await gather(rows({ habits: [strength] }));
      const read = paths.find((p) => p.startsWith('habit_adaptations'));
      expect(read).toBe(
        'habit_adaptations?owner_id=eq.user&period_end=gte.2026-09-29&select=id,habit_id,mode,period_start,period_end,floor_note&limit=200',
      );
      expect(g.habits[0].lighter).toBeNull();
    });

    it('leaves a habit paused today out of the habits for today, and does not check in on it', async () => {
      const { g } = await gather(
        rows({
          habits: [strength, daily],
          habit_plans: plans,
          habit_adaptations: [stretch('pause', '2026-10-05', '2026-10-09')],
        }),
      );
      expect(g.habitsForToday.map((h) => h.id)).toEqual(['h2']);
      expect(g.candidates).toBe(1);
      expect(g.checkIn).toBeNull();
      expect(g.habits.find((h) => h.id === 'h1').behind).toBe(false);
    });

    it('is not behind while paused, even late in a week with nothing done', async () => {
      // Friday is their weekly day, so Monday 5 October is day three of their week
      const tables = (habit_adaptations) =>
        rows({
          habits: [strength],
          notification_preferences: [{ weekly_day: 5 }],
          habit_adaptations,
        });
      const usual = await gather(tables([]));
      expect(usual.g.habitsForToday.map((h) => h.id)).toEqual(['h1']);
      expect(usual.g.habitsForToday[0].behind).toBe(true);
      const paused = await gather(tables([stretch('pause', '2026-10-03', '2026-10-06')]));
      expect(paused.g.habitsForToday).toEqual([]);
      expect(paused.g.habits[0].behind).toBe(false);
    });

    it('takes a pause that has ended, or has not begun, as no pause today', async () => {
      const { g } = await gather(
        rows({
          habits: [strength],
          habit_plans: plans,
          habit_adaptations: [
            stretch('pause', '2026-09-29', '2026-10-04'),
            stretch('pause', '2026-10-06', '2026-10-12'),
          ],
        }),
      );
      expect(g.habitsForToday.map((h) => h.id)).toEqual(['h1']);
      expect(g.checkIn).toEqual({ id: 'h1', title: 'Strength', minutes: 45 });
    });

    it('says what a lighter version running today is, and still checks in', async () => {
      const said = await gather(
        rows({
          habits: [strength],
          habit_plans: plans,
          habit_adaptations: [
            stretch('floor', '2026-10-01', '2026-10-14', ' Ten minutes  is enough '),
          ],
        }),
      );
      expect(said.g.habitsForToday[0]).toMatchObject({
        id: 'h1',
        lighter: 'Ten minutes is enough',
      });
      expect(said.g.checkIn).toEqual({ id: 'h1', title: 'Strength', minutes: 45 });
      const unsaid = await gather(
        rows({
          habits: [strength],
          habit_plans: plans,
          habit_adaptations: [stretch('floor', '2026-10-01', '2026-10-14')],
        }),
      );
      expect(unsaid.g.habitsForToday[0].lighter).toBe('');
      // one that starts tomorrow, and a row that changes nothing, are not a lighter version today
      const none = await gather(
        rows({
          habits: [strength],
          habit_plans: plans,
          habit_adaptations: [
            stretch('floor', '2026-10-06', '2026-10-14', 'Ten minutes'),
            stretch('keep', '2026-10-01', '2026-10-05'),
          ],
        }),
      );
      expect(none.g.habitsForToday[0].lighter).toBeNull();
    });

    it('still gathers the day when they cannot be read, and checks in on no habit', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { g } = await gather(
        rows({
          habits: [strength],
          habit_plans: plans,
          habit_adaptations: new Error('habit_adaptations is down'),
        }),
      );
      expect(g.habitsForToday.map((h) => h.id)).toEqual(['h1']);
      expect(g.habitsForToday[0].lighter).toBeNull();
      // it cannot tell which habit they asked to be left alone about, so it asks about none
      expect(g.checkIn).toBeNull();
      expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(
        /habit_adaptations is down/,
      );
      warn.mockRestore();
    });
  });
});
