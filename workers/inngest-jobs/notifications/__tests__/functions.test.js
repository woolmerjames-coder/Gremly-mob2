/**
 * @jest-environment node
 *
 * The Inngest functions with a pretend step runner: the order of steps, holds,
 * skips that are logged, tokens never stored in step results, reminders rolled
 * on, and a day's plan queued.
 */
import {
  jobFrom,
  runSend,
  createNotificationFunctions,
  CANCEL_ON,
  SEND_EVENT,
  TEST_EVENT,
  PLAN_EVENT,
} from '../functions';
import { decide, claim, compose, push, logSkip, loadDevices, settleReceipts } from '../send';
import { planPersonDay, rollReminder } from '../planner';
import { reportProblem } from '../alert';

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
  };
});
jest.mock('../planner', () => ({
  planPersonDay: jest.fn(),
  rollReminder: jest.fn(),
  SEND_EVENT: 'notifications/send.due',
  PLAN_EVENT: 'notifications/plan.day',
  CANCEL_EVENT: 'notifications/cancel',
}));
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
    sendEvent: jest.fn(async (id) => order.push(id)),
  };
}

const person = {
  userId: 'u1',
  today: '2026-10-01',
  state: 'engaged',
  devices: [{ id: 'd1', expo_token: TOKEN }],
};
const job = jobFrom({ user_id: 'u1', moment: 'sweep', dedupe_key: 'u1:sweep:-:2026-10-01:20:00' });

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
  it('accepts the canary', () => {
    expect(jobFrom({ user_id: 'u', moment: 'canary', dedupe_key: 'k' }).moment).toBe('canary');
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
    const out = await runSend({ step: fakeStep(), env: {}, runId: 'r' }, job);
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
    const out = await runSend({ step: fakeStep(), env: {}, runId: 'r' }, job);
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

  it('rolls a reminder on afterwards, sent or skipped', async () => {
    const rem = jobFrom({
      user_id: 'u1',
      moment: 'reminder',
      subject: 'todo:t1:r1',
      dedupe_key: 'k',
      planned_for: '2026-10-01T16:00:00Z',
    });
    const step = fakeStep();
    await runSend({ step, env: {}, runId: 'r' }, rem);
    expect(step.order.at(-1)).toBe('roll-reminder');
    expect(rollReminder).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ subject: 'todo:t1:r1', sent: true }),
    );
    rollReminder.mockClear();
    decide.mockResolvedValue({ action: 'drop', reason: 'Already done', person });
    await runSend({ step: fakeStep(), env: {}, runId: 'r' }, rem);
    expect(rollReminder).toHaveBeenCalledWith({}, expect.objectContaining({ sent: false }));
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

  it('registers the day planner, the send and the test send', () => {
    expect(made.map((m) => m.config.id)).toEqual([
      'notifications-plan-day',
      'notifications-send',
      'notifications-test-send',
    ]);
    expect(byId('notifications-plan-day').trigger).toEqual({ event: PLAN_EVENT });
    expect(byId('notifications-send').trigger).toEqual({ event: SEND_EVENT });
    expect(byId('notifications-test-send').trigger).toEqual({ event: TEST_EVENT });
  });

  it('keeps one send at a time per person, and can be cancelled by the planner', () => {
    const c = byId('notifications-send').config;
    expect(c.concurrency[0]).toEqual({ key: 'event.data.user_id', limit: 1 });
    expect(c.cancelOn).toEqual(CANCEL_ON);
    expect(CANCEL_ON[0].if).toBe('async.data.dedupe_key == event.data.dedupe_key');
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

  it('plans a day and queues its sends and cancellations together', async () => {
    planPersonDay.mockResolvedValue({
      events: [{ name: SEND_EVENT, id: 'a', data: {} }],
      cancels: [{ name: 'notifications/cancel', data: { dedupe_key: 'old' } }],
      state: 'engaged',
      planned: 1,
      skipped: 0,
    });
    const step = fakeStep();
    const out = await byId('notifications-plan-day').handler({
      event: { data: { user_id: 'u1', local_date: '2026-10-01' } },
      step,
      env: {},
    });
    expect(step.sendEvent).toHaveBeenCalledWith('queue-sends', [
      { name: 'notifications/cancel', data: { dedupe_key: 'old' } },
      { name: SEND_EVENT, id: 'a', data: {} },
    ]);
    expect(out).toMatchObject({ planned: 1, cancelled: 1 });
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
    expect(reportProblem).not.toHaveBeenCalled();
  });

  it('a canary that is not delivered alerts', async () => {
    settleReceipts.mockResolvedValue({ settled: true, delivered: false });
    await byId('notifications-test-send').handler({
      event: { id: 'ev2', data: { user_id: 'u1' } },
      step: fakeStep(),
      env: {},
      runId: 'r',
    });
    expect(reportProblem).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ title: 'Notifications canary was not delivered' }),
    );
  });

  it('a send that gives up marks its row failed and reports it', async () => {
    await byId('notifications-send').config.onFailure({
      event: {
        data: { event: { data: { moment: 'brief', dedupe_key: 'u1:brief:-:2026-10-01:08:00' } } },
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
