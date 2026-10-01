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
  compose,
} from '../send';
import { gatherBrief } from '../../brief/data';
import { writeDailyBrief } from '../../brief/index';
import { reportProblem } from '../alert';

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
    cortex_preferences: [{ day_boundary_hour: 0, brief_in_chat: true }],
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
    const v = await decide({}, job, { at: AT });
    expect(v.action).toBe('send');
    expect(v.facts).toMatchObject({ weekday: 'Thursday', meetings_today: 0 });
  });

  it('holds while they are in the app', async () => {
    mockTables.app_events = [{ occurred_at: new Date(AT.getTime() - 10 * 60000).toISOString() }];
    const v = await decide({}, job, { at: AT });
    expect(v).toMatchObject({ action: 'hold', minutes: 15 });
  });

  it('drops the sweep when they already swept, and says when', async () => {
    mockTables.events = [{ created_at: '2026-10-01T16:30:00Z' }];
    const v = await decide({}, job, { at: AT });
    expect(v).toMatchObject({ action: 'drop', reason: 'They swept at 5:30pm' });
  });

  it('drops and reports a wake far past its time', async () => {
    const v = await decide({}, { ...job, planned_for: '2026-10-01T14:00:00Z' }, { at: AT });
    expect(v.action).toBe('drop');
    expect(v.reason).toMatch(/Woke 180 minutes after/);
    expect(reportProblem).toHaveBeenCalled();
  });

  it('drops when no phone can receive', async () => {
    mockTables.push_devices = [];
    const v = await decide({}, job, { at: AT });
    expect(v).toMatchObject({ action: 'drop', reason: 'No phone can receive notifications' });
  });

  it('does not build a day for someone who has been away', async () => {
    mockTables.user_engagement = [{ user_id: USER, state: 'lapsed', days_away: 7 }];
    await decide({}, { ...job, moment: 'nudge' }, { at: AT });
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
