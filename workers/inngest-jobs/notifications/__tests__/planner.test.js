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
    mockTables.cortex_preferences = [{ gremly_age: 5, brief_in_chat: true }];
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

  it('does nothing without settings', async () => {
    mockTables.notification_preferences = [];
    const out = await planPersonDay(ENV, { user_id: USER, timezone: TZ, local_date: '2026-10-01' });
    expect(out).toMatchObject({ events: [], skipped: 'no settings' });
  });
});
