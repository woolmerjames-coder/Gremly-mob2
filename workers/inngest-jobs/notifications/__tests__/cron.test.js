/**
 * @jest-environment node
 *
 * The minute cron: the server switch, the hourly receipts and watchdog, the
 * Sentry check in, and faults reported without flooding.
 */
import { runMinute, watchdog, allowedPeople, canary } from '../cron';
import { planReminders, queueReminders, claimDays, sendEvents } from '../planner';
import { settleDueReceipts } from '../send';
import { reportProblem, cronCheckIn } from '../alert';

jest.mock('../planner', () => ({
  planReminders: jest.fn(),
  queueReminders: jest.fn(),
  claimDays: jest.fn(),
  sendEvents: jest.fn(),
}));
jest.mock('../send', () => ({ settleDueReceipts: jest.fn() }));
jest.mock('../alert', () => ({ reportProblem: jest.fn(), cronCheckIn: jest.fn() }));
let mockTables;
let mockRpc;
let mockUpdates;
jest.mock('../../context/db', () => ({
  db: () => ({
    select: async (path) => {
      const t = mockTables[path.split('?')[0]];
      return typeof t === 'function' ? t(path) : t || [];
    },
    update: async (path, patch) => {
      mockUpdates.push({ path, patch });
      return [];
    },
    rpc: async (fn) => mockRpc[fn] || [],
  }),
}));

const ON = { NOTIFICATIONS_MODE: 'on' };
beforeEach(() => {
  mockTables = {};
  mockRpc = {};
  mockUpdates = [];
  planReminders.mockResolvedValue({ planned: 0 });
  queueReminders.mockResolvedValue({ queued: 0 });
  claimDays.mockResolvedValue({ days: 0 });
  settleDueReceipts.mockResolvedValue({ checked: 0, delivered: 0, failed: 0, waiting: 0 });
});

describe('the server switch', () => {
  it('off runs nothing at all', async () => {
    const out = await runMinute({}, { now: new Date('2026-10-01T10:07:00Z') });
    expect(out.off).toBe(true);
    expect(planReminders).not.toHaveBeenCalled();
    expect(cronCheckIn).not.toHaveBeenCalled();
  });
  it('testers mode passes the testers on', async () => {
    mockTables.cortex_preferences = [{ owner_id: 't1' }];
    expect(await allowedPeople({ NOTIFICATIONS_MODE: 'testers' })).toEqual(new Set(['t1']));
    expect(await allowedPeople(ON)).toBeNull();
    await runMinute({ NOTIFICATIONS_MODE: 'testers' }, { now: new Date('2026-10-01T10:01:00Z') });
    expect(queueReminders.mock.calls[0][1].only).toEqual(new Set(['t1']));
    expect(claimDays.mock.calls[0][1].only).toEqual(new Set(['t1']));
  });
});

describe('each minute', () => {
  it('plans, queues and claims, and nothing hourly', async () => {
    await runMinute(ON, { now: new Date('2026-10-01T10:01:00Z') });
    expect(planReminders).toHaveBeenCalled();
    expect(queueReminders).toHaveBeenCalled();
    expect(claimDays).toHaveBeenCalled();
    expect(settleDueReceipts).not.toHaveBeenCalled();
    expect(cronCheckIn).not.toHaveBeenCalled();
  });

  it('a fault in one part does not stop the others, and is reported every ten minutes', async () => {
    planReminders.mockRejectedValue(new Error('db down'));
    const out = await runMinute(ON, { now: new Date('2026-10-01T10:01:00Z') });
    expect(queueReminders).toHaveBeenCalled();
    expect(out.problems).toEqual(['plan reminders: db down']);
    expect(reportProblem).not.toHaveBeenCalled();
    await runMinute(ON, { now: new Date('2026-10-01T10:10:00Z') });
    expect(reportProblem).toHaveBeenCalledWith(
      ON,
      expect.objectContaining({ title: 'Notifications: plan reminders: db down' }),
    );
  });
});

describe('hourly', () => {
  it('reads receipts, runs the watchdog and checks in with Sentry', async () => {
    await runMinute(ON, { now: new Date('2026-10-01T10:07:00Z') });
    expect(settleDueReceipts).toHaveBeenCalled();
    expect(cronCheckIn.mock.calls.map((c) => c[2])).toEqual(['in_progress', 'ok']);
    // one id on both, so Sentry pairs the finish with its start
    const [start, finish] = cronCheckIn.mock.calls.map((c) => c[5]);
    expect(start).toMatch(/^[0-9a-f-]{36}$/);
    expect(finish).toBe(start);
  });

  it('checks in with an error when something is wrong', async () => {
    settleDueReceipts.mockResolvedValue({ checked: 4, delivered: 1, failed: 3, waiting: 0 });
    const out = await runMinute(ON, { now: new Date('2026-10-01T10:07:00Z') });
    expect(out.problems).toContain('3 of 4 were not delivered');
    expect(cronCheckIn.mock.calls.at(-1)[2]).toBe('error');
    expect(reportProblem).toHaveBeenCalled();
  });

  it('sends the canary once a day', async () => {
    mockTables.cortex_preferences = [{ owner_id: 't1' }];
    mockTables.push_devices = [{ user_id: 't1' }];
    await runMinute(ON, { now: new Date('2026-10-01T15:07:00Z') });
    expect(sendEvents).toHaveBeenCalledWith(
      ON,
      [
        expect.objectContaining({
          name: 'notifications/test.send',
          id: 'canary:t1:2026-10-01',
          data: expect.objectContaining({ moment: 'canary' }),
        }),
      ],
      undefined,
    );
  });
});

describe('the watchdog', () => {
  const now = new Date('2026-10-01T10:07:00Z');
  it('fails sends stuck for twenty minutes', async () => {
    mockTables.notification_log = (path) =>
      path.includes('status=eq.sending') ? [{ id: 'a' }, { id: 'b' }] : [];
    const found = await watchdog(ON, { now });
    expect(found).toContain('2 stuck while sending');
    expect(mockUpdates[0]).toEqual({
      path: 'notification_log?id=in.(a,b)',
      patch: expect.objectContaining({ status: 'failed', reason: 'Stuck while sending' }),
    });
  });

  it('notices reminders that were never queued and people with no plan', async () => {
    mockRpc.reminders_to_queue = [{ user_id: 'u1' }];
    mockTables.push_devices = [{ user_id: 'u1' }, { user_id: 'u2' }];
    mockTables.notification_preferences = [
      { user_id: 'u1', timezone: 'Europe/London' },
      { user_id: 'u2', timezone: 'Europe/London' },
    ];
    mockTables.user_engagement = [
      { user_id: 'u1', plan_date: '2026-10-01' },
      { user_id: 'u2', plan_date: '2026-09-30' },
    ];
    const found = await watchdog(ON, { now });
    expect(found).toEqual(['1 reminders were never queued', '1 people have no plan for today']);
  });

  it('the canary goes only to testers with a phone', async () => {
    mockTables.cortex_preferences = [{ owner_id: 't1' }, { owner_id: 't2' }];
    mockTables.push_devices = [{ user_id: 't2' }];
    expect(await canary(ON, { now })).toBe(1);
  });
});
