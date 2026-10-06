/**
 * @jest-environment node
 *
 * Planning: reminders get a fire time and a queued run, days get claimed and
 * planned, outcomes teach the miss streaks, and a changed plan cancels what it
 * replaced. The database and Inngest are replaced.
 */
import {
  planReminders,
  queueReminders,
  rollReminder,
  claimDays,
  reminderEvent,
  habitCheckinMinutes,
  learn,
  buildDayPlan,
  planPersonDay,
  sendEvents,
  cameBackSince,
  cameBackWhileAway,
  cameBackReason,
  readCameBack,
} from '../planner';

let mockTables;
let mockRpc;
let mockCalls;
jest.mock('../../context/db', () => ({
  db: () => ({
    select: async (path) => {
      mockCalls.select.push(path);
      const t = mockTables[path.split('?')[0]];
      return typeof t === 'function' ? t(path) : t || [];
    },
    update: async (path, patch) => {
      mockCalls.update.push({ path, patch });
      return [];
    },
    upsert: async (table, rows, onConflict) => {
      mockCalls.upsert.push({ table, rows, onConflict });
      return rows;
    },
    rpc: async (fn, args) => {
      mockCalls.rpc.push({ fn, args });
      const r = mockRpc[fn.split('?')[0]];
      return typeof r === 'function' ? r(args, fn) : r || [];
    },
  }),
}));

const USER = 'u1';
const TZ = 'Europe/London';
const ENV = { INNGEST_EVENT_KEY: 'evkey' };
const sentEvents = () => global.fetch.mock.calls.flatMap((c) => JSON.parse(c[1].body));

beforeEach(() => {
  mockTables = { notification_preferences: [{ user_id: USER, timezone: TZ }] };
  mockRpc = {};
  mockCalls = { select: [], update: [], upsert: [], rpc: [] };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }));
});

describe('sendEvents', () => {
  it('posts to Inngest in batches of 100 and fails loudly', async () => {
    await sendEvents(
      ENV,
      Array.from({ length: 150 }, (_, i) => ({ name: 'x', data: { i } })),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('https://inn.gs/e/evkey');
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, text: async () => 'bad key' }));
    await expect(sendEvents(ENV, [{ name: 'x' }])).rejects.toThrow('Inngest event send 401');
    await expect(sendEvents({}, [{ name: 'x' }])).rejects.toThrow('INNGEST_EVENT_KEY');
  });
});

describe('reminders', () => {
  it('works out the next fire time in their time zone', async () => {
    mockTables.reminder_schedule = [
      {
        id: 's1',
        user_id: USER,
        entity_type: 'todo',
        entity_id: 't1',
        reminder_id: 'r1',
        rule: { id: 'r1', time: '18:00', frequency: 'daily' },
      },
    ];
    await planReminders(ENV, { now: new Date('2026-10-01T12:00:00Z') });
    const u = mockCalls.update[0];
    expect(u.path).toBe('reminder_schedule?id=eq.s1&planned_at=is.null');
    expect(u.patch.next_fire_at).toBe('2026-10-01T17:00:00.000Z'); // 18:00 BST
  });

  it('counts back from an event for "before it starts"', async () => {
    mockTables.reminder_schedule = [
      {
        id: 's2',
        user_id: USER,
        entity_type: 'note',
        entity_id: 'n1',
        reminder_id: 'r2',
        rule: { id: 'r2', kind: 'before', minutes: 60 },
      },
    ];
    mockTables.notes = [{ id: 'n1', target_date: '2026-10-02', event_time: '15:30:00' }];
    await planReminders(ENV, { now: new Date('2026-10-01T12:00:00Z') });
    expect(mockCalls.update[0].patch.next_fire_at).toBe('2026-10-02T13:30:00.000Z');
  });

  it('marks a reminder that will never fire again as planned with no time', async () => {
    mockTables.reminder_schedule = [
      {
        id: 's3',
        user_id: USER,
        entity_type: 'todo',
        entity_id: 't1',
        reminder_id: 'r3',
        rule: { id: 'r3', time: '09:00', frequency: 'once', date: '2026-09-01' },
      },
    ];
    await planReminders(ENV, { now: new Date('2026-10-01T12:00:00Z') });
    expect(mockCalls.update[0].patch).toMatchObject({
      next_fire_at: null,
      planned_at: '2026-10-01T12:00:00.000Z',
    });
  });

  it('queues each due reminder once, keyed by its local time', async () => {
    const row = {
      id: 's1',
      user_id: USER,
      entity_type: 'todo',
      entity_id: 't1',
      reminder_id: 'r1',
      rule: { time: '18:00' },
      next_fire_at: '2026-10-01T17:00:00+00:00',
    };
    mockRpc.reminders_to_queue = [row];
    const out = await queueReminders(ENV, { now: new Date('2026-10-01T12:00:00Z') });
    expect(out).toEqual({ queued: 1 });
    const [e] = sentEvents();
    expect(e).toMatchObject({
      name: 'notifications/send.due',
      id: 'u1:reminder:todo:t1:r1:2026-10-01:18:00',
    });
    expect(e.data).toMatchObject({
      moment: 'reminder',
      subject: 'todo:t1:r1',
      planned_for: '2026-10-01T17:00:00.000Z',
    });
    expect(mockCalls.update[0]).toEqual({
      path: `reminder_schedule?id=eq.s1&next_fire_at=eq.${encodeURIComponent(row.next_fire_at)}`,
      patch: expect.objectContaining({ queued_for: row.next_fire_at }),
    });
  });

  it('in testers mode asks only for their reminders', async () => {
    await queueReminders(ENV, { now: new Date(), only: new Set(['t-1']) });
    expect(mockCalls.rpc[0].fn).toBe('reminders_to_queue?user_id=in.(t-1)');
  });

  it('rolls on only the occurrence that ran', async () => {
    await rollReminder(ENV, {
      subject: 'todo:t1:r1',
      planned_for: '2026-10-01T17:00:00.000Z',
      sent: true,
    });
    expect(mockCalls.update[0].path).toBe(
      `reminder_schedule?entity_type=eq.todo&entity_id=eq.t1&reminder_id=eq.r1&queued_for=eq.${encodeURIComponent('2026-10-01T17:00:00.000Z')}`,
    );
    expect(mockCalls.update[0].patch.planned_at).toBeNull();
    expect(mockCalls.update[0].patch.last_fired_at).toBeTruthy();
  });

  it('builds the same key the planner and sender agree on', () => {
    const e = reminderEvent(
      {
        user_id: USER,
        entity_type: 'habit',
        entity_id: 'h1',
        reminder_id: 'x',
        rule: {},
        next_fire_at: '2026-10-01T06:30:00Z',
      },
      TZ,
    );
    expect(e.id).toBe('u1:reminder:habit:h1:x:2026-10-01:07:30');
  });
});

describe('claiming days', () => {
  it('sends one plan event per person; a settings change gets its own id', async () => {
    mockRpc.claim_days_to_plan = [
      { user_id: 'a', timezone: TZ, local_date: '2026-10-01', settings_changed: false },
      { user_id: 'b', timezone: TZ, local_date: '2026-10-01', settings_changed: true },
    ];
    const now = new Date('2026-10-01T05:00:00Z');
    await claimDays(ENV, { now });
    const ev = sentEvents();
    expect(ev[0].id).toBe('plan:a:2026-10-01');
    expect(ev[1].id).toBe(`plan:b:2026-10-01:${now.getTime()}`);
    expect(ev[1].data.replan).toBe(true);
  });

  it('gives the claim back when Inngest cannot be reached', async () => {
    mockRpc.claim_days_to_plan = [{ user_id: 'a', timezone: TZ, local_date: '2026-10-01' }];
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => 'down' }));
    await expect(claimDays(ENV)).rejects.toThrow('500');
    expect(mockCalls.update[0]).toEqual({
      path: 'user_engagement?user_id=in.(a)',
      patch: { plan_date: null },
    });
  });

  it('in testers mode plans only testers', async () => {
    mockRpc.claim_days_to_plan = [
      { user_id: 'a', local_date: '2026-10-01' },
      { user_id: 'b', local_date: '2026-10-01' },
    ];
    await claimDays(ENV, { only: new Set(['b']) });
    expect(sentEvents().map((e) => e.data.user_id)).toEqual(['b']);
  });
});

describe('learning', () => {
  const now = new Date('2026-10-02T04:00:00Z');
  it('checks in on a habit after its set time, only on days it is due', () => {
    const h = { scheduled_start_iso: '2026-02-11T18:45:00Z', cadence: 'daily' };
    expect(habitCheckinMinutes(h, { tz: 'UTC', localDate: '2026-10-01' })).toBe(18 * 60 + 45);
    expect(
      habitCheckinMinutes(
        { ...h, reminders_json: [{ id: 'r' }] },
        { tz: 'UTC', localDate: '2026-10-01' },
      ),
    ).toBeNull();
    const weekly = {
      scheduled_start_iso: '2026-02-11T21:30:00Z',
      cadence: 'weekly',
      days_active: [6],
    };
    expect(habitCheckinMinutes(weekly, { tz: 'UTC', localDate: '2026-10-03' })).toBe(21 * 60 + 30); // a Saturday
    expect(habitCheckinMinutes(weekly, { tz: 'UTC', localDate: '2026-10-01' })).toBeNull();
    expect(
      habitCheckinMinutes({ cadence: 'daily' }, { tz: 'UTC', localDate: '2026-10-01' }),
    ).toBeNull();
  });

  it('marks outcomes, moves streaks and scores angles', () => {
    const logs = [
      {
        id: 'l1',
        moment: 'sweep',
        angle: 'tiny_invite',
        sent_at: '2026-10-01T19:00:00Z',
        opened_at: null,
      },
      {
        id: 'l2',
        moment: 'brief',
        angle: 'day_shape',
        sent_at: '2026-10-01T07:00:00Z',
        opened_at: '2026-10-01T07:05:00Z',
      },
      {
        id: 'l3',
        moment: 'nudge',
        angle: 'gremly_state',
        sent_at: '2026-10-02T03:30:00Z',
        opened_at: null,
      },
    ];
    const activities = [{ kind: 'sweep', at: '2026-10-01T23:00:00Z' }];
    const out = learn({
      logs,
      activities,
      engagement: { miss_streaks: { sweep: 2, brief: 4 } },
      now,
    });
    expect(out.patches).toEqual([
      { id: 'l2', outcome: 'succeeded' },
      { id: 'l1', outcome: 'missed' },
    ]);
    expect(out.missStreaks).toEqual({ sweep: 3, brief: 0 });
    expect(out.angleStats).toEqual({
      brief: { day_shape: { s: 1, n: 1 } },
      sweep: { tiny_invite: { s: 0, n: 1 } },
    });
  });
});

describe('a day plan', () => {
  const base = {
    userId: USER,
    tz: TZ,
    localDate: '2026-10-01',
    prefs: {
      morning_time: '08:00',
      evening_time: '20:00',
      morning_enabled: true,
      evening_enabled: true,
      checkins_enabled: true,
    },
    engagement: {},
    daysAway: 0,
    firstDayBack: false,
    facts: { briefExpected: true, habits: [], nudgeReasons: [{ kind: 'unfed' }] },
    bestHours: null,
  };

  it('queues the brief and sweep at their local times', () => {
    const p = buildDayPlan({ ...base, now: new Date('2026-10-01T04:00:00Z') });
    const brief = p.events.find((e) => e.data.moment === 'brief');
    const sweep = p.events.find((e) => e.data.moment === 'sweep');
    expect(brief.data.planned_for).toBe('2026-10-01T07:00:00.000Z');
    expect(brief.id).toBe('u1:brief:-:2026-10-01:08:00');
    expect(sweep.data.planned_for).toBe('2026-10-01T19:00:00.000Z');
  });

  it('leaves out times that have already passed', () => {
    const p = buildDayPlan({ ...base, now: new Date('2026-10-01T12:00:00Z') });
    expect(p.events.find((e) => e.data.moment === 'brief')).toBeUndefined();
    expect(p.skipped.some((s) => s.moment === 'brief' && /had passed/.test(s.reason))).toBe(true);
  });

  it('a person away a week gets only the return note on a ladder day', () => {
    const p = buildDayPlan({ ...base, daysAway: 5, now: new Date('2026-10-01T04:00:00Z') });
    expect(p.events.map((e) => e.data.moment)).toEqual(['return_note']);
    expect(p.state).toBe('lapsed');
  });
});

describe('planning one person', () => {
  it('learns, plans, cancels what changed and stores the plan', async () => {
    const now = new Date('2026-10-01T03:30:00Z'); // 4:30 in London
    mockTables.notification_preferences = [
      {
        user_id: USER,
        timezone: TZ,
        morning_time: '08:00',
        evening_time: '20:00',
        morning_enabled: true,
        evening_enabled: true,
        checkins_enabled: false,
      },
    ];
    mockTables.user_engagement = [
      {
        user_id: USER,
        state: 'lapsed',
        plan: {
          date: '2026-10-01',
          items: [{ key: 'u1:brief:-:2026-10-01:07:30', at: '2026-10-01T06:30:00.000Z' }],
        },
      },
    ];
    mockTables.cortex_preferences = [{ gremly_age: 5 }];
    mockTables.app_events = [{ occurred_at: '2026-09-30T18:00:00Z' }];
    const out = await planPersonDay(
      ENV,
      { user_id: USER, timezone: TZ, local_date: '2026-10-01' },
      { now },
    );
    // first day back after being away: just the one, and the brief wins
    expect(out.events.map((e) => e.data.moment)).toEqual(['brief']);
    // the brief moved from 7:30 to 8:00, so the 7:30 run is cancelled
    expect(out.cancels).toEqual([
      { name: 'notifications/cancel', data: { dedupe_key: 'u1:brief:-:2026-10-01:07:30' } },
    ]);
    const saved = mockCalls.upsert[0].rows[0];
    expect(saved).toMatchObject({
      user_id: USER,
      state: 'engaged',
      days_away: 1,
      back_on: '2026-10-01',
      plan_date: '2026-10-01',
    });
    expect(saved.plan.items).toHaveLength(1);
    expect(
      saved.plan.skipped.some((x) => x.moment === 'sweep' && x.reason === 'Daily limit reached'),
    ).toBe(true);
  });

  describe('what came back from Later while they were away', () => {
    const settings = (over = {}) => ({
      user_id: USER,
      timezone: TZ,
      morning_time: '08:00',
      evening_time: '20:00',
      morning_enabled: true,
      evening_enabled: true,
      checkins_enabled: true,
      ...over,
    });
    const back = (id, resurface_at, name = `Todo ${id}`) => ({ id, name, resurface_at });
    const plan = (lastOpen, todos, prefs = settings()) => {
      mockTables.notification_preferences = [prefs];
      mockTables.user_engagement = [{ user_id: USER, state: 'engaged' }];
      mockTables.cortex_preferences = [{ gremly_age: 5 }];
      mockTables.app_events = [{ occurred_at: lastOpen }];
      mockTables.todos = todos;
      return planPersonDay(
        ENV,
        { user_id: USER, timezone: TZ, local_date: '2026-10-08' },
        { now: new Date('2026-10-08T03:30:00Z') },
      );
    };
    const nudge = (out) => out.events.find((e) => e.data.moment === 'nudge');

    it('is the reason for the nudge after two days away, said as something waiting', async () => {
      // last here on Monday 5; two things came back on Tuesday and today
      const out = await plan('2026-10-05T18:00:00Z', [
        back('a', '2026-10-06'),
        back('b', '2026-10-08'),
        back('old', '2026-10-04'),
      ]);
      expect(out.daysAway).toBe(3);
      expect(nudge(out).data).toMatchObject({
        subject: 'came_back',
        data: {
          // what came back after Monday 5, the last day they were here
          reason: { kind: 'came_back', weight: 3, count: 2, since: '2026-10-05' },
          eligibleAngles: ['something_waiting'],
        },
      });
      // two days away the day has room for one note, and this is the one sent
      expect(out.state).toBe('drifting');
      expect(out.events.map((e) => e.data.moment)).toEqual(['nudge']);
      // only open todos with no day of their own, by the day they come back
      const read = mockCalls.select.find((q) => q.startsWith('todos?'));
      expect(read).toContain('completed_at=is.null&archived=eq.false&due_day=is.null');
      expect(read).toContain('resurface_at=gte.2026-10-02&resurface_at=lte.2026-10-08');
    });

    it('is not said while they are around: Today and the brief show it', async () => {
      const out = await plan('2026-10-07T18:00:00Z', [back('a', '2026-10-08')]);
      expect(out.daysAway).toBe(1);
      expect(nudge(out).data).toMatchObject({ subject: 'unfed' });
      expect(nudge(out).data.data.eligibleAngles).toBeUndefined();
    });

    it('is not said when nothing came back since they were last here: the day is planned as before', async () => {
      const out = await plan('2026-10-05T18:00:00Z', [back('old', '2026-10-05')]);
      // the one note of a day two days away is the brief, as it always was
      expect(out.events.map((e) => e.data.moment)).toEqual(['brief']);
    });

    it('is said once: what a note has said is not said again, until more comes back', async () => {
      const said = (day) => {
        mockTables.notification_log = (path) =>
          path.includes('subject_id=eq.came_back') ? [{ local_date: day }] : [];
      };
      const todos = [back('a', '2026-10-06'), back('b', '2026-10-08')];
      // a note on Wednesday 7 said the first; today's is about the one back since
      said('2026-10-07');
      const more = await plan('2026-10-05T18:00:00Z', todos);
      expect(nudge(more).data.data.reason).toMatchObject({
        kind: 'came_back',
        count: 1,
        since: '2026-10-07',
      });
      const read = mockCalls.select.find((q) => q.includes('subject_id=eq.came_back'));
      expect(read).toContain('moment=eq.nudge');
      expect(read).toContain('status=in.(sent,delivered)&is_test=eq.false');
      // a note today has said it all: the day is planned as before
      said('2026-10-08');
      const none = await plan('2026-10-05T18:00:00Z', todos);
      expect(none.events.map((e) => e.data.moment)).toEqual(['brief']);
    });

    it('is not said when the last note cannot be read, rather than said twice', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockTables.notification_log = (path) => {
        if (path.includes('subject_id=eq.came_back')) throw new Error('the log is down');
        return [];
      };
      const out = await plan('2026-10-05T18:00:00Z', [back('a', '2026-10-06')]);
      expect(out.events.map((e) => e.data.moment)).toEqual(['brief']);
      expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/was last said/);
      warn.mockRestore();
    });

    it('still goes only to someone who has Gremly notes switched on', async () => {
      const out = await plan(
        '2026-10-05T18:00:00Z',
        [back('a', '2026-10-06')],
        settings({ checkins_enabled: false }),
      );
      expect(nudge(out)).toBeUndefined();
    });

    it('plans the day as before when what came back cannot be read', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const out = await plan('2026-10-05T18:00:00Z', () => {
        throw new Error('todos are down');
      });
      expect(out.events.map((e) => e.data.moment)).toEqual(['brief']);
      expect(warn.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/what came back/);
      warn.mockRestore();
    });

    it('counts by dates alone', () => {
      const backs = [
        { back_on: '2026-10-05' },
        { back_on: '2026-10-06' },
        { back_on: '2026-10-08' },
      ];
      const away = (daysAway, lastOpenDate) => cameBackWhileAway(backs, { daysAway, lastOpenDate });
      expect(away(3, '2026-10-05').map((t) => t.back_on)).toEqual(['2026-10-06', '2026-10-08']);
      expect(away(2, '2026-10-06').map((t) => t.back_on)).toEqual(['2026-10-08']);
      expect(away(1, '2026-10-07')).toEqual([]);
      // someone who has never opened the app has not been away from it
      expect(away(0, null)).toEqual([]);
      // what a note already said is not counted again
      const after = (lastSaid) =>
        cameBackWhileAway(backs, { daysAway: 3, lastOpenDate: '2026-10-05', lastSaid });
      expect(after('2026-10-06').map((t) => t.back_on)).toEqual(['2026-10-08']);
      expect(after('2026-10-08')).toEqual([]);
      // a note from before they were last here says nothing about this time away
      expect(after('2026-10-01').map((t) => t.back_on)).toEqual(['2026-10-06', '2026-10-08']);
      expect(cameBackSince('2026-10-05', '2026-10-07')).toBe('2026-10-07');
      expect(cameBackSince('2026-10-05', null)).toBe('2026-10-05');
      expect(cameBackSince(null, '2026-10-07')).toBeNull();
      expect(cameBackReason(2, '2026-10-05')).toEqual({
        kind: 'came_back',
        weight: 3,
        count: 2,
        since: '2026-10-05',
        angles: ['something_waiting'],
        // after good news, ahead of the brief
        priority: 1.5,
      });
    });

    it('reads each one with its title and the day it came back', async () => {
      mockTables.todos = [
        { id: 'a', name: 'Call the plumber', resurface_at: '2026-10-06' },
        { id: 'b', name: null, title: 'Renew passport', resurface_at: '2026-10-08T00:00:00' },
      ];
      expect(await readCameBack(ENV, USER, '2026-10-02', '2026-10-08')).toEqual([
        { id: 'a', title: 'Call the plumber', back_on: '2026-10-06' },
        { id: 'b', title: 'Renew passport', back_on: '2026-10-08' },
      ]);
    });
  });

  it('does nothing without settings', async () => {
    mockTables.notification_preferences = [];
    const out = await planPersonDay(ENV, { user_id: USER, timezone: TZ, local_date: '2026-10-01' });
    expect(out).toMatchObject({ events: [], skipped: 'no settings' });
  });
});
