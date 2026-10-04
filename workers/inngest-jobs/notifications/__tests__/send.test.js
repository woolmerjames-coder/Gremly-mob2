/**
 * @jest-environment node
 *
 * One notification from waking to receipt, with the database, Expo, the brief
 * and Sentry replaced: lateness, holds, the brief check, the daily limit for a
 * first day back, dead phones, rate limits and receipts.
 */
import {
  routeFor,
  tooLate,
  publicPerson,
  stillTrue,
  decide,
  claim,
  push,
  settleReceipts,
  settleDueReceipts,
  CANARY_WORDS,
  briefFacts,
  compose,
  touchedTonight,
} from '../send';
import { gatherBrief } from '../../brief/data';
import { writeDailyBrief } from '../../brief/index';
import { reportProblem } from '../alert';
import { jsonCall } from '../../context/llm';

jest.mock('../../context/llm', () => ({ jsonCall: jest.fn() }));
jest.mock('../alert', () => ({ reportProblem: jest.fn(), cronCheckIn: jest.fn() }));
jest.mock('../../brief/index', () => ({ writeDailyBrief: jest.fn() }));
jest.mock('../../brief/data', () => ({
  gatherBrief: jest.fn(),
  minutesIn: (tz, at) => {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(at));
    const get = (t) => Number(p.find((x) => x.type === t).value);
    return (get('hour') % 24) * 60 + get('minute');
  },
  ritualDayFor: (today) => today,
  localStartIso: (_tz, day) => `${day}T00:00:00.000Z`,
}));

// A tiny stand in for the Supabase REST client: tables are arrays, filters are ignored
// except where a test sets an answer for a specific path.
let mockTables;
let mockCalls;
jest.mock('../../context/db', () => ({
  db: () => ({
    select: async (path) => {
      mockCalls.select.push(path);
      const table = path.split('?')[0];
      const fn = mockTables[table];
      return typeof fn === 'function' ? fn(path) : fn || [];
    },
    update: async (path, patch) => {
      mockCalls.update.push({ path, patch });
      return [];
    },
    insertQuiet: async (table, rows) => {
      mockCalls.insert.push({ table, rows });
    },
    rpc: async (fn, args) => {
      mockCalls.rpc.push({ fn, args });
      return [{ ok: true, reason: null, log_id: 'log-1' }];
    },
  }),
  localDate: (tz, at = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at),
  userTimezone: async () => 'Europe/London',
}));

const AT = new Date('2026-10-01T17:00:00Z'); // 18:00 in London
const ON = { NOTIFICATIONS_MODE: 'on' };
const USER = 'u1';
const TOKEN = 'ExponentPushToken[secret-device-token]';

const prefs = (over = {}) => ({
  user_id: USER,
  timezone: 'Europe/London',
  evening_enabled: true,
  morning_enabled: true,
  reminders_enabled: true,
  ...over,
});

beforeEach(() => {
  mockCalls = { select: [], update: [], insert: [], rpc: [] };
  mockTables = {
    notification_preferences: [prefs()],
    push_devices: [{ id: 'd1', expo_token: TOKEN, time_sensitive: true }],
    user_engagement: [{ user_id: USER, state: 'engaged', days_away: 0 }],
    cortex_preferences: [{ day_boundary_hour: 0 }],
    app_events: [],
    events: [],
  };
  gatherBrief.mockResolvedValue({
    now: 18 * 60,
    meetings: [],
    ritualDay: '2026-10-01',
    part: 'evening',
  });
  reportProblem.mockResolvedValue(true);
  global.fetch = jest.fn();
});

const okExpo = (tickets) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ data: tickets }),
});

describe('routeFor', () => {
  it('sends each moment somewhere sensible', () => {
    expect(routeFor('reminder', 'todo:abc:r1')).toBe('item/todo/abc');
    expect(routeFor('habit_checkin', 'h1')).toBe('habit/h1');
    expect(routeFor('brief')).toBe('brief');
    expect(routeFor('good_news', 'weekly_summary:2026-09-28')).toBe('summary');
    expect(routeFor('return_note')).toBe('drop');
  });
});

describe('tooLate', () => {
  const at = new Date('2026-10-01T09:00:00Z');
  it('lets a reminder go up to half an hour late, a brief up to ninety minutes', () => {
    expect(tooLate({ moment: 'reminder', planned_for: '2026-10-01T08:20:00Z' }, at)).toMatch(
      /40 minutes after/,
    );
    expect(tooLate({ moment: 'reminder', planned_for: '2026-10-01T08:40:00Z' }, at)).toBeNull();
    expect(tooLate({ moment: 'brief', planned_for: '2026-10-01T08:00:00Z' }, at)).toBeNull();
  });
  it('does not count minutes it was held on purpose', () => {
    // planned 7:00, held 60 minutes while they were in the app, now 9:00: 60 minutes late, not 120
    const job = { moment: 'sweep', planned_for: '2026-10-01T07:00:00Z' };
    expect(tooLate(job, at)).toMatch(/120 minutes after/);
    expect(tooLate(job, at, 60)).toBeNull();
  });
  it('never applies to a test', () => {
    expect(
      tooLate({ moment: 'reminder', planned_for: '2026-09-30T08:00:00Z', test: true }, at),
    ).toBeNull();
  });
});

it('publicPerson keeps tokens out of what Inngest stores', () => {
  const p = publicPerson({ userId: USER, devices: [{ id: 'd1', expo_token: TOKEN }] });
  expect(JSON.stringify(p)).not.toContain(TOKEN);
  expect(p.devices[0].id).toBe('d1');
});

describe('the brief check', () => {
  const person = {
    userId: USER,
    tz: 'Europe/London',
    ritualDay: '2026-10-01',
    today: '2026-10-01',
  };

  it('stops when they have already read it', async () => {
    mockTables.scope_chats = [{ id: 't1', metadata_json: { brief_written_at: 'x', seen_at: 'y' } }];
    expect(await stillTrue({}, person, { moment: 'brief' }, AT)).toEqual({
      ok: false,
      reason: 'They had already read today’s brief',
    });
    expect(writeDailyBrief).not.toHaveBeenCalled();
  });

  it('writes a missing brief before sending', async () => {
    let written = false;
    mockTables.scope_chats = () =>
      written ? [{ id: 't1', metadata_json: { brief_written_at: 'now' } }] : [];
    writeDailyBrief.mockImplementation(async () => {
      written = true;
      return { thread_id: 't1' };
    });
    expect(await stillTrue({}, person, { moment: 'brief' }, AT)).toEqual({ ok: true });
  });

  it('treats a skipped new user as expected, not a fault', async () => {
    mockTables.scope_chats = [];
    writeDailyBrief.mockResolvedValue({ skipped: 'new user' });
    const r = await stillTrue({}, person, { moment: 'brief' }, AT);
    expect(r).toEqual({ ok: false, reason: 'The brief starts on their second day' });
  });

  it('flags a brief that could not be written', async () => {
    mockTables.scope_chats = [];
    writeDailyBrief.mockResolvedValue({ thread_id: 't1' });
    const r = await stillTrue({}, person, { moment: 'brief' }, AT);
    expect(r).toMatchObject({ ok: false, problem: true });
  });
});

describe('decide', () => {
  const job = {
    user_id: USER,
    moment: 'sweep',
    dedupe_key: 'k',
    planned_for: '2026-10-01T16:55:00Z',
  };

  it('sends when nothing is in the way', async () => {
    const v = await decide(ON, job, { at: AT });
    expect(v.action).toBe('send');
    expect(v.facts).toMatchObject({ weekday: 'Thursday', meetings_today: 0 });
  });

  it('names the number the wrap up will show: todos due today are cards like any other', async () => {
    // two due today and one with no day are cards; the one due next week is not
    gatherBrief.mockResolvedValue({
      now: 18 * 60,
      meetings: [],
      ritualDay: '2026-10-01',
      overdue: 0,
      unsorted: 1,
    });
    mockTables.todos = [
      { id: 'a', due_day: '2026-10-01' },
      { id: 'b', due_day: '2026-10-01' },
      { id: 'c', due_day: null },
      { id: 'd', due_day: '2026-10-09' },
    ];
    mockTables.notes = [];
    const v = await decide(ON, job, { at: AT });
    expect(v.facts.waiting_in_sweep).toBe(3);
  });

  it('gives the words what makes a day not clear: habits, Sweep and what is dated today', async () => {
    // 2 October for Dave: no meetings, nothing due, but habits, Sweep and a trip
    gatherBrief.mockResolvedValue({
      now: 7 * 60,
      meetings: [],
      today: '2026-10-02',
      ritualDay: '2026-10-02',
      todosDue: [],
      habitsForToday: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
      sweep: { all: 10, evening: 8, quick: 6 },
      sweepWaiting: 6,
      anchors: [
        { date: '2026-10-02', short_label: 'Flying to San Diego' },
        { date: '2026-10-07', short_label: 'Anniversary' },
      ],
    });
    const v = await decide(ON, job, { at: AT });
    expect(v.facts).toMatchObject({
      meetings_today: 0,
      due_today: 0,
      habits_today: 3,
      waiting_in_sweep: 8,
      dated_today: ['Flying to San Diego'],
    });
  });

  it('the morning brief names the quick sweep, what still needs a decision', async () => {
    gatherBrief.mockResolvedValue({
      now: 7 * 60,
      meetings: [],
      today: '2026-10-02',
      ritualDay: '2026-10-02',
      sweep: { all: 10, evening: 8, quick: 6 },
      sweepWaiting: 6,
    });
    expect(briefFacts(await gatherBrief(), 'brief').waiting_in_sweep).toBe(6);
    expect(briefFacts(await gatherBrief(), 'sweep').waiting_in_sweep).toBe(8);
  });

  it('says they travel today, and when they set off, from the day record', () => {
    const g = {
      now: 7 * 60,
      meetings: [],
      today: '2026-10-02',
      ritualDay: '2026-10-02',
      day: { travel: { label: 'Flying to San Diego', departs: 750 } },
    };
    expect(briefFacts(g, 'brief').travel_today).toEqual({
      what: 'Flying to San Diego',
      sets_off: expect.stringMatching(/^12:30/),
    });
    expect(briefFacts({ ...g, day: null }, 'brief')).not.toHaveProperty('travel_today');
  });

  it('leaves the number out rather than guess when it cannot be counted', async () => {
    mockTables.todos = () => {
      throw new Error('database down');
    };
    const v = await decide(ON, job, { at: AT });
    expect(v.action).toBe('send');
    expect(v.facts).not.toHaveProperty('waiting_in_sweep');
  });

  it('holds while they are in the app', async () => {
    mockTables.app_events = [{ occurred_at: new Date(AT.getTime() - 10 * 60000).toISOString() }];
    const v = await decide(ON, job, { at: AT });
    expect(v).toMatchObject({ action: 'hold', minutes: 15 });
  });

  it('drops the sweep when they already swept, and says when', async () => {
    mockTables.events = [{ created_at: '2026-10-01T16:30:00Z' }];
    const v = await decide(ON, job, { at: AT });
    expect(v).toMatchObject({ action: 'drop', reason: 'They swept at 5:30pm' });
  });

  it('counts "already swept" from when their day started, not from midnight', async () => {
    // a 3am day end: a wrap up finished at 12:30am belongs to the evening before
    mockTables.cortex_preferences = [{ day_boundary_hour: 3 }];
    mockTables.events = (path) => {
      const since = decodeURIComponent(path.match(/created_at=gte\.([^&]+)/)[1]);
      return since === '2026-10-01T03:00:00.000Z' ? [] : [{ created_at: '2026-10-01T00:30:00Z' }];
    };
    const v = await decide(ON, job, { at: AT });
    expect(v.action).toBe('send');
  });

  it('says nothing more once the wrap up was opened in the thread, or they said not tonight', async () => {
    mockTables.scope_chats = [{ sweep: { step: 'declined' } }];
    expect(await decide(ON, job, { at: AT })).toMatchObject({
      action: 'drop',
      reason: 'They said not tonight',
    });
    mockTables.scope_chats = [{ sweep: { step: 'partial' } }];
    expect(await decide(ON, job, { at: AT })).toMatchObject({
      action: 'drop',
      reason: 'They had already opened the wrap up',
    });
    // a thread with no wrap up yet (the morning brief only) changes nothing
    mockTables.scope_chats = [{ sweep: null }];
    expect((await decide(ON, job, { at: AT })).action).toBe('send');
  });

  it('still goes out when the wrap up was only opened or turned down earlier in the day', async () => {
    // London: 2pm is before the evening, 5:30pm is in it
    const early = { started_at: '2026-10-01T13:00:00Z', touched_at: '2026-10-01T13:05:00Z' };
    mockTables.scope_chats = [{ sweep: { step: 'declined', ...early } }];
    expect((await decide(ON, job, { at: AT })).action).toBe('send');
    mockTables.scope_chats = [{ sweep: { step: 'partial', ...early } }];
    expect((await decide(ON, job, { at: AT })).action).toBe('send');
    // started earlier, picked up again in the evening: they have seen it tonight
    mockTables.scope_chats = [
      { sweep: { step: 'partial', ...early, touched_at: '2026-10-01T16:30:00Z' } },
    ];
    expect(await decide(ON, job, { at: AT })).toMatchObject({
      action: 'drop',
      reason: 'They had already opened the wrap up',
    });
    // after midnight, before their day ends, is still the evening
    mockTables.cortex_preferences = [{ day_boundary_hour: 3 }];
    expect(touchedTonight({ touched_at: '2026-10-01T23:30:00Z' }, 'Europe/London', 3)).toBe(true);
    expect(touchedTonight({ touched_at: '2026-10-01T09:00:00Z' }, 'Europe/London', 3)).toBe(false);
  });

  it('drops and reports a wake far past its time', async () => {
    const v = await decide(ON, { ...job, planned_for: '2026-10-01T14:00:00Z' }, { at: AT });
    expect(v.action).toBe('drop');
    expect(v.reason).toMatch(/Woke 180 minutes after/);
    expect(reportProblem).toHaveBeenCalled();
  });

  it('drops when no phone can receive', async () => {
    mockTables.push_devices = [];
    const v = await decide(ON, job, { at: AT });
    expect(v).toMatchObject({ action: 'drop', reason: 'No phone can receive notifications' });
  });

  it('sends nothing when the server switch is off, and only to testers in testers mode', async () => {
    expect(await decide({}, job, { at: AT })).toMatchObject({
      action: 'drop',
      reason: 'Notifications are switched off on the server',
    });
    expect(await decide({ NOTIFICATIONS_MODE: 'testers' }, job, { at: AT })).toMatchObject({
      reason: 'Only testers get notifications for now',
    });
    mockTables.cortex_preferences = [{ day_boundary_hour: 0, is_tester: true }];
    expect((await decide({ NOTIFICATIONS_MODE: 'testers' }, job, { at: AT })).action).toBe('send');
  });

  it('a Lab test goes even with the switch off', async () => {
    expect((await decide({}, { ...job, test: true }, { at: AT })).action).toBe('send');
  });

  describe('a reminder whose item changed after its run was queued', () => {
    // queued for 18:00 London (17:00 UTC), which is also the time it wakes
    const rem = {
      user_id: USER,
      moment: 'reminder',
      subject: 'todo:t1:r1',
      dedupe_key: 'k',
      planned_for: '2026-10-01T17:00:00Z',
    };
    const row = (rule, over = {}) => ({
      status: 'active',
      entity_type: 'todo',
      entity_id: 't1',
      next_fire_at: null,
      rule,
      ...over,
    });
    const daily = (time) => ({ id: 'r1', frequency: 'daily', time });

    it('still goes when the reminder still falls at this time', async () => {
      mockTables.reminder_schedule = [row(daily('18:00'), { next_fire_at: rem.planned_for })];
      expect((await decide(ON, rem, { at: AT })).action).toBe('send');
    });

    it('is dropped when the time was changed', async () => {
      mockTables.reminder_schedule = [
        row(daily('19:00'), { next_fire_at: '2026-10-01T18:00:00Z' }),
      ];
      expect(await decide(ON, rem, { at: AT })).toMatchObject({
        action: 'drop',
        reason: 'The reminder moved to another time',
      });
    });

    it('is dropped in the minute before the new time is worked out', async () => {
      // the edit cleared next_fire_at and the planner has not run yet
      mockTables.reminder_schedule = [row(daily('18:30'))];
      expect(await decide(ON, rem, { at: AT })).toMatchObject({
        action: 'drop',
        reason: 'The reminder moved to another time',
      });
    });

    it('still goes in that minute when the edit left the time alone', async () => {
      mockTables.reminder_schedule = [row(daily('18:00'))];
      expect((await decide(ON, rem, { at: AT })).action).toBe('send');
    });

    it('still goes after the planner has moved on to tomorrow, if the time is unchanged', async () => {
      mockTables.reminder_schedule = [
        row(daily('18:00'), { next_fire_at: '2026-10-02T17:00:00Z' }),
      ];
      expect((await decide(ON, rem, { at: AT })).action).toBe('send');
    });

    it('is dropped when a one off reminder moved to another day', async () => {
      mockTables.reminder_schedule = [
        row({ id: 'r1', frequency: 'once', date: '2026-10-02', time: '18:00' }),
      ];
      expect((await decide(ON, rem, { at: AT })).action).toBe('drop');
    });

    it('follows the event for a "before it starts" reminder', async () => {
      const ev = { ...rem, subject: 'note:n1:r1' };
      const before = row(
        { id: 'r1', kind: 'before', minutes: 30 },
        { entity_type: 'note', entity_id: 'n1' },
      );
      mockTables.reminder_schedule = [before];
      mockTables.notes = [{ id: 'n1', target_date: '2026-10-01', event_time: '18:30:00' }];
      expect((await decide(ON, ev, { at: AT })).action).toBe('send');
      mockTables.notes = [{ id: 'n1', target_date: '2026-10-01', event_time: '19:00:00' }];
      expect((await decide(ON, ev, { at: AT })).action).toBe('drop');
    });
  });

  it('does not build a day for someone who has been away', async () => {
    mockTables.user_engagement = [{ user_id: USER, state: 'lapsed', days_away: 7 }];
    await decide(ON, { ...job, moment: 'nudge' }, { at: AT });
    expect(gatherBrief).not.toHaveBeenCalled();
  });
});

describe('claim', () => {
  const person = { userId: USER, today: '2026-10-01', state: 'engaged', engagement: {} };
  it('asks the database for the normal daily limit', async () => {
    await claim({}, { user_id: USER, moment: 'brief', dedupe_key: 'k' }, person);
    expect(mockCalls.rpc[0].args).toMatchObject({
      p_max_per_day: 3,
      p_counts: true,
      p_min_gap_minutes: 180,
      p_is_test: false,
    });
  });
  it('allows one on the first day back', async () => {
    await claim(
      {},
      { user_id: USER, moment: 'brief', dedupe_key: 'k' },
      { ...person, engagement: { back_on: '2026-10-01' } },
    );
    expect(mockCalls.rpc[0].args.p_max_per_day).toBe(1);
  });
  it('never counts a test or a reminder', async () => {
    await claim({}, { user_id: USER, moment: 'brief', dedupe_key: 'k', test: true }, person);
    await claim({}, { user_id: USER, moment: 'reminder', dedupe_key: 'k2' }, person);
    expect(mockCalls.rpc.map((c) => c.args.p_counts)).toEqual([false, false]);
  });
});

describe('compose', () => {
  const person = {
    userId: USER,
    state: 'engaged',
    devices: [{ id: 'd1', time_sensitive: true }],
    engagement: {},
  };
  it('uses fixed words for the canary', async () => {
    const w = await compose({}, { user_id: USER, moment: 'canary' }, person, null);
    expect(w).toMatchObject({ ...CANARY_WORDS, interruption: 'passive' });
  });
  it('words a reminder from the item, time sensitive', async () => {
    mockTables.todos = [{ id: 'abc', name: 'Call the bank' }];
    const w = await compose(
      {},
      {
        user_id: USER,
        moment: 'reminder',
        subject: 'todo:abc:r1',
        data: { rule: { kind: 'once' } },
      },
      person,
      null,
    );
    expect(w).toMatchObject({
      title: 'Call the bank',
      route: 'item/todo/abc',
      interruption: 'time-sensitive',
    });
  });
  it('says one fixed line on a night with nothing to sort, without the writer', async () => {
    const w = await compose({}, { user_id: USER, moment: 'sweep' }, person, {
      weekday: 'Thursday',
      waiting_in_sweep: 0,
    });
    expect(w).toMatchObject({
      title: 'Nothing to sort tonight',
      body: 'A quick look back at your day is ready in Chat.',
      route: 'sweep',
      model: null,
      usedFallback: false,
    });
    expect(jsonCall).not.toHaveBeenCalled();
  });
});

describe('push', () => {
  const words = {
    title: 'Evening',
    body: 'Three things waiting.',
    route: 'sweep',
    interruption: 'active',
    angle: 'tiny_invite',
  };
  const person = {
    userId: USER,
    devices: [
      { id: 'd1', expo_token: TOKEN },
      { id: 'd2', expo_token: 'ExponentPushToken[old]' },
    ],
  };

  it('records each ticket, switches off a dead phone, and keeps tokens out of the log', async () => {
    global.fetch.mockResolvedValue(
      okExpo([
        { status: 'ok', id: 'tk1' },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ]),
    );
    const out = await push({}, { user_id: USER, moment: 'sweep' }, person, 'log-1', words);
    expect(out).toEqual({ sent: true, tickets: 2, ok: 1 });
    const disabled = mockCalls.update.find((u) => u.path.startsWith('push_devices'));
    expect(disabled.path).toContain('d2');
    expect(disabled.patch.disabled_reason).toBe('Expo: DeviceNotRegistered');
    const log = mockCalls.update.find((u) => u.path.startsWith('notification_log'));
    expect(log.patch.status).toBe('sent');
    expect(JSON.stringify(log.patch)).not.toContain('ExponentPushToken');
  });

  it('throws when Expo rate limited every send, so the step retries', async () => {
    global.fetch.mockResolvedValue(
      okExpo([
        { status: 'error', details: { error: 'MessageRateExceeded' } },
        { status: 'error', details: { error: 'MessageRateExceeded' } },
      ]),
    );
    await expect(
      push({}, { user_id: USER, moment: 'sweep' }, person, 'log-1', words),
    ).rejects.toThrow('rate limited');
    expect(mockCalls.update.find((u) => u.path.startsWith('notification_log'))).toBeUndefined();
  });

  it('alerts on a credentials problem and records the failure', async () => {
    global.fetch.mockResolvedValue(
      okExpo([
        { status: 'error', details: { error: 'InvalidCredentials' } },
        { status: 'error', details: { error: 'InvalidCredentials' } },
      ]),
    );
    const out = await push({}, { user_id: USER, moment: 'sweep' }, person, 'log-1', words);
    expect(out.sent).toBe(false);
    expect(reportProblem).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ title: 'Push credentials problem: InvalidCredentials' }),
    );
    expect(mockCalls.update.find((u) => u.path.startsWith('notification_log')).patch.status).toBe(
      'failed',
    );
  });
});

describe('receipts', () => {
  const sentRow = {
    id: 'log-1',
    user_id: USER,
    moment: 'sweep',
    status: 'sent',
    expo_tickets: [
      { device_id: 'd1', ok: true, ticketId: 'tk1' },
      { device_id: 'd2', ok: true, ticketId: 'tk2' },
    ],
  };

  it('marks it delivered when a phone took it, and switches off a dead one', async () => {
    mockTables.notification_log = [sentRow];
    const getReceiptsImpl = jest.fn(async () => ({
      tk1: { status: 'ok' },
      tk2: { status: 'error', error: 'DeviceNotRegistered' },
    }));
    expect(await settleReceipts({}, 'log-1', { getReceiptsImpl })).toEqual({
      settled: true,
      delivered: true,
    });
    expect(mockCalls.update.find((u) => u.path.startsWith('push_devices')).path).toContain('d2');
    expect(mockCalls.update.find((u) => u.path.startsWith('notification_log')).patch.status).toBe(
      'delivered',
    );
  });

  it('waits while Expo is still working, then calls it on the final read', async () => {
    mockTables.notification_log = [sentRow];
    const getReceiptsImpl = jest.fn(async () => ({}));
    expect(await settleReceipts({}, 'log-1', { getReceiptsImpl })).toEqual({
      settled: false,
      delivered: false,
    });
    expect(mockCalls.update).toHaveLength(0);
    expect(await settleReceipts({}, 'log-1', { getReceiptsImpl, final: true })).toEqual({
      settled: true,
      delivered: false,
    });
    expect(mockCalls.update[0].patch).toMatchObject({
      status: 'failed',
      reason: 'Not delivered: no receipt',
    });
  });

  it('reads every due notification with one receipts request', async () => {
    const sentAt = new Date(AT.getTime() - 20 * 60000).toISOString();
    mockTables.notification_log = (path) =>
      path.includes('status=eq.sent&sent_at')
        ? [
            {
              id: 'a',
              sent_at: sentAt,
              expo_tickets: [{ ok: true, ticketId: 't1', device_id: 'd1' }],
            },
            {
              id: 'b',
              sent_at: sentAt,
              expo_tickets: [
                { ok: true, ticketId: 't2', device_id: 'd1' },
                { ok: true, ticketId: 't3', device_id: 'd2' },
              ],
            },
          ]
        : [
            {
              ...sentRow,
              id: path.includes('id=eq.a') ? 'a' : 'b',
              expo_tickets: path.includes('id=eq.a')
                ? [{ ok: true, ticketId: 't1', device_id: 'd1' }]
                : [
                    { ok: true, ticketId: 't2', device_id: 'd1' },
                    { ok: true, ticketId: 't3', device_id: 'd2' },
                  ],
            },
          ];
    const getReceiptsImpl = jest.fn(async () => ({
      t1: { status: 'ok' },
      t2: { status: 'ok' },
      t3: { status: 'ok' },
    }));
    const out = await settleDueReceipts({}, { at: AT, getReceiptsImpl });
    expect(getReceiptsImpl).toHaveBeenCalledTimes(1);
    expect(getReceiptsImpl.mock.calls[0][1]).toEqual(['t1', 't2', 't3']);
    expect(out).toEqual({ checked: 2, delivered: 2, failed: 0, waiting: 0 });
  });
});
