/**
 * @jest-environment node
 *
 * The Inngest functions with a pretend step runner: the order of steps, holds,
 * skips that are logged, tokens never stored in step results, and what cancels
 * a waiting notification.
 */
import {
  jobFrom,
  runSend,
  createNotificationFunctions,
  CANCEL_ON,
  SEND_EVENT,
  TEST_EVENT,
} from '../functions';
import {
  decide,
  claim,
  compose,
  push,
  logSkip,
  loadDevices,
  settleReceipts,
  settleDueReceipts,
} from '../send';
import { reportProblem, cronCheckIn } from '../alert';

jest.mock('../send', () => {
  const actual = jest.requireActual('../send');
  return {
    publicPerson: actual.publicPerson,
    decide: jest.fn(),
    claim: jest.fn(),
    compose: jest.fn(),
    push: jest.fn(),
    logSkip: jest.fn(),
    loadDevices: jest.fn(),
    settleReceipts: jest.fn(),
    settleDueReceipts: jest.fn(),
  };
});
jest.mock('../alert', () => ({ reportProblem: jest.fn(), cronCheckIn: jest.fn() }));
let mockUpdates;
jest.mock('../../context/db', () => ({
  db: () => ({
    update: async (path, patch) => {
      mockUpdates.push({ path, patch });
      return [];
    },
  }),
}));

const TOKEN = 'ExponentPushToken[secret]';

/** Runs steps for real and stores their results as JSON, the way Inngest does. */
function fakeStep() {
  const stored = {};
  const order = [];
  return {
    stored,
    order,
    run: async (id, fn) => {
      order.push(id);
      const out = await fn();
      stored[id] = out === undefined ? null : JSON.parse(JSON.stringify(out));
      return stored[id];
    },
    sleep: jest.fn(async (id) => order.push(id)),
    sleepUntil: jest.fn(async (id) => order.push(id)),
  };
}

const person = {
  userId: 'u1',
  today: '2026-10-01',
  state: 'engaged',
  devices: [{ id: 'd1', expo_token: TOKEN }],
};
const job = jobFrom({ user_id: 'u1', moment: 'sweep', dedupe_key: 'u1:sweep::2026-10-01:' });

beforeEach(() => {
  mockUpdates = [];
  decide.mockResolvedValue({ action: 'send', person, facts: { weekday: 'Thursday' } });
  claim.mockResolvedValue({ ok: true, reason: null, logId: 'log-1' });
  compose.mockResolvedValue({
    title: 'Evening',
    body: 'Two things waiting.',
    route: 'sweep',
    interruption: 'active',
  });
  loadDevices.mockResolvedValue([{ id: 'd1', expo_token: TOKEN }]);
  push.mockResolvedValue({ sent: true, tickets: 1, ok: 1 });
});

describe('jobFrom', () => {
  it('refuses events it cannot act on', () => {
    expect(() => jobFrom({ moment: 'sweep', dedupe_key: 'k' })).toThrow('user_id');
    expect(() => jobFrom({ user_id: 'u', moment: 'shout', dedupe_key: 'k' })).toThrow(
      'Unknown moment',
    );
    expect(() => jobFrom({ user_id: 'u', moment: 'sweep' })).toThrow('dedupe_key');
    expect(() =>
      jobFrom({ user_id: 'u', moment: 'sweep', dedupe_key: 'k', planned_for: 'soon' }),
    ).toThrow('planned_for');
  });
  it('works out the item a reminder belongs to, so finishing it cancels the reminder', () => {
    expect(
      jobFrom({ user_id: 'u', moment: 'reminder', dedupe_key: 'k', subject: 'todo:abc:r1' }).item,
    ).toBe('todo:abc');
  });
});

describe('runSend', () => {
  it('decides, claims, writes and sends, in that order', async () => {
    const step = fakeStep();
    const out = await runSend({ step, env: {}, runId: 'run-1' }, job);
    expect(step.order).toEqual(['decide-0', 'claim', 'write', 'push']);
    expect(out).toMatchObject({ sent: true, logId: 'log-1', accepted: 1 });
    expect(push.mock.calls[0][1].inngest_run_id).toBe('run-1');
    expect(push.mock.calls[0][2].devices[0].expo_token).toBe(TOKEN);
  });

  it('never stores a push token in a step result', async () => {
    const step = fakeStep();
    await runSend({ step, env: {}, runId: 'run-1' }, job);
    expect(JSON.stringify(step.stored)).not.toContain('ExponentPushToken');
  });

  it('logs a skip with its reason and stops', async () => {
    decide.mockResolvedValue({ action: 'drop', reason: 'Quiet hours', person });
    const step = fakeStep();
    const out = await runSend({ step, env: {}, runId: 'r' }, job);
    expect(out).toEqual({ sent: false, reason: 'Quiet hours' });
    expect(logSkip).toHaveBeenCalledWith({}, job, expect.any(Object), 'suppressed', 'Quiet hours');
    expect(claim).not.toHaveBeenCalled();
  });

  it('waits out a hold and decides again with the time already held', async () => {
    decide
      .mockResolvedValueOnce({
        action: 'hold',
        minutes: 15,
        reason: 'In the app 5 minutes ago',
        person,
      })
      .mockResolvedValueOnce({ action: 'send', person, facts: null });
    const step = fakeStep();
    await runSend({ step, env: {}, runId: 'r' }, job);
    expect(step.sleep).toHaveBeenCalledWith('hold-0', '15m');
    expect(decide.mock.calls[1][2]).toEqual({ heldSoFar: 15 });
    expect(step.order).toEqual(['decide-0', 'hold-0', 'decide-1', 'claim', 'write', 'push']);
  });

  it('gives up after too many holds and says so', async () => {
    decide.mockResolvedValue({ action: 'hold', minutes: 15, reason: 'In a meeting', person });
    const step = fakeStep();
    const out = await runSend({ step, env: {}, runId: 'r' }, job);
    expect(out.reason).toBe('Held 120 minutes and still not a good time');
    expect(logSkip).toHaveBeenCalledTimes(1);
  });

  it('logs a daily limit skip, but not a duplicate', async () => {
    claim.mockResolvedValueOnce({ ok: false, reason: 'daily limit reached', logId: null });
    await runSend({ step: fakeStep(), env: {}, runId: 'r' }, job);
    expect(logSkip).toHaveBeenCalledWith(
      {},
      job,
      expect.any(Object),
      'suppressed',
      'daily limit reached',
    );
    logSkip.mockClear();
    claim.mockResolvedValueOnce({ ok: false, reason: 'already decided', logId: 'log-0' });
    const out = await runSend({ step: fakeStep(), env: {}, runId: 'r' }, job);
    expect(out.reason).toBe('already decided');
    expect(logSkip).not.toHaveBeenCalled();
    expect(compose).not.toHaveBeenCalled();
  });

  it('marks it failed when the last phone went away before sending', async () => {
    loadDevices.mockResolvedValue([]);
    const out = await runSend({ step: fakeStep(), env: {}, runId: 'r' }, job);
    expect(out.sent).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(mockUpdates[0].patch).toMatchObject({ status: 'failed' });
  });
});

describe('the functions', () => {
  const made = [];
  const inngest = {
    createFunction: (config, trigger, handler) => {
      made.push({ config, trigger, handler });
      return config.id;
    },
  };
  createNotificationFunctions(inngest);
  const byId = (id) => made.find((m) => m.config.id === id);

  it('registers the send, the test send and the receipts reader', () => {
    expect(made.map((m) => m.config.id)).toEqual([
      'notifications-send',
      'notifications-test-send',
      'notifications-receipts',
    ]);
    expect(byId('notifications-send').trigger).toEqual({ event: SEND_EVENT });
    expect(byId('notifications-test-send').trigger).toEqual({ event: TEST_EVENT });
    expect(byId('notifications-receipts').trigger.cron).toBeTruthy();
  });

  it('keeps one send at a time per person, and can be cancelled', () => {
    const c = byId('notifications-send').config;
    expect(c.concurrency[0]).toEqual({ key: 'event.data.user_id', limit: 1 });
    expect(c.cancelOn).toHaveLength(CANCEL_ON.length);
    for (const rule of c.cancelOn) expect(rule.if).toMatch(/event\.data\.(user_id|dedupe_key)/);
    expect(typeof c.onFailure).toBe('function');
  });

  it('sleeps until the planned time before deciding', async () => {
    const step = fakeStep();
    await byId('notifications-send').handler({
      event: {
        data: {
          user_id: 'u1',
          moment: 'sweep',
          dedupe_key: 'k',
          planned_for: '2026-10-01T17:00:00Z',
        },
      },
      step,
      env: {},
      runId: 'r',
    });
    expect(step.sleepUntil).toHaveBeenCalledWith(
      'wait-for-its-time',
      new Date('2026-10-01T17:00:00Z'),
    );
    expect(step.order[0]).toBe('wait-for-its-time');
  });

  it('a test send is a canary by default, unique, and reads its own receipt', async () => {
    settleReceipts.mockResolvedValue({ settled: true, delivered: true });
    const step = fakeStep();
    const out = await byId('notifications-test-send').handler({
      event: { id: 'ev1', data: { user_id: 'u1' } },
      step,
      env: {},
      runId: 'r',
    });
    expect(decide.mock.calls[0][1]).toMatchObject({
      moment: 'canary',
      test: true,
      dedupe_key: 'test:u1:ev1',
      planned_for: null,
    });
    expect(step.sleep).toHaveBeenCalledWith('let-expo-deliver', '1m');
    expect(out.receipt).toEqual({ settled: true, delivered: true });
  });

  it('the receipts reader checks in with Sentry and alerts when many fail', async () => {
    settleDueReceipts.mockResolvedValue({ checked: 4, delivered: 1, failed: 3, waiting: 0 });
    const step = fakeStep();
    await byId('notifications-receipts').handler({ step, env: {} });
    expect(cronCheckIn.mock.calls.map((c) => c[2])).toEqual(['in_progress', 'ok']);
    expect(reportProblem).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ title: 'Notifications: 3 of 4 were not delivered' }),
    );
  });

  it('a send that gives up marks its row failed and reports it', async () => {
    await byId('notifications-send').config.onFailure({
      event: {
        data: { event: { data: { moment: 'brief', dedupe_key: 'u1:brief::2026-10-01:' } } },
      },
      error: new Error('Supabase down'),
      env: {},
    });
    expect(reportProblem).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ title: 'Notifications: a brief failed after retries' }),
    );
    expect(mockUpdates[0].path).toContain('status=in.(sending,planned)');
    expect(mockUpdates[0].patch).toMatchObject({
      status: 'failed',
      reason: 'Gave up: Supabase down',
    });
  });
});
