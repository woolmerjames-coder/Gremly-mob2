/**
 * @jest-environment node
 *
 * Talking to Expo: the message shape, reading every ticket inside a 200,
 * batching, and receipts.
 */
import {
  buildMessage,
  sendToExpo,
  getReceipts,
  DEAD_DEVICE_ERRORS,
  ALERT_ERRORS,
  RETRY_ERRORS,
} from '../expo';

const reply = (json, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(json),
});

describe('buildMessage', () => {
  it('builds an active message with a sound, a category and the route', () => {
    const m = buildMessage({
      to: 'T1',
      title: 'Hi',
      body: 'Body',
      route: 'brief',
      logId: 'L1',
      moment: 'brief',
      categoryId: 'GREMLY_BRIEF',
      interruption: 'active',
    });
    expect(m).toEqual({
      to: 'T1',
      title: 'Hi',
      body: 'Body',
      sound: 'default',
      categoryId: 'GREMLY_BRIEF',
      interruptionLevel: 'active',
      threadId: 'brief',
      priority: 'high',
      data: { route: 'brief', logId: 'L1', moment: 'brief' },
    });
  });

  it('keeps a passive message silent and normal priority, with no empty fields', () => {
    const m = buildMessage({
      to: 'T1',
      title: '',
      body: 'Quiet one',
      moment: 'nudge',
      interruption: 'passive',
      data: { subject: 'x' },
    });
    expect(m.sound).toBeUndefined();
    expect(m.title).toBeUndefined();
    expect('categoryId' in m).toBe(false);
    expect(m.priority).toBe('normal');
    expect(m.data).toEqual({ route: null, logId: null, moment: 'nudge', subject: 'x' });
  });
});

describe('sendToExpo', () => {
  it('reads each ticket: an error ticket inside a 200 is a failure', async () => {
    const fetchImpl = jest.fn(async () =>
      reply({
        data: [
          { status: 'ok', id: 'tk1' },
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    );
    const out = await sendToExpo({}, [{ to: 'a' }, { to: 'b' }], fetchImpl);
    expect(out).toEqual([
      { ok: true, ticketId: 'tk1' },
      { ok: false, error: 'DeviceNotRegistered', message: 'gone', retry: false },
    ]);
  });

  it('sends in batches of 100 and keeps the order', async () => {
    const fetchImpl = jest.fn(async (_url, init) => {
      const batch = JSON.parse(init.body);
      return reply({ data: batch.map((m) => ({ status: 'ok', id: `t-${m.to}` })) });
    });
    const msgs = Array.from({ length: 150 }, (_, i) => ({ to: String(i) }));
    const out = await sendToExpo({}, msgs, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(150);
    expect(out[149]).toEqual({ ok: true, ticketId: 't-149' });
  });

  it('marks a missing ticket as a failure and a rate limit as worth retrying', async () => {
    const fetchImpl = jest.fn(async () =>
      reply({ data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] }),
    );
    const out = await sendToExpo({}, [{ to: 'a' }, { to: 'b' }], fetchImpl);
    expect(out[0]).toMatchObject({ ok: false, error: 'MessageRateExceeded', retry: true });
    expect(out[1]).toMatchObject({ ok: false, error: 'NoTicket' });
  });

  it('throws when the whole request fails, so the step retries', async () => {
    await expect(
      sendToExpo({}, [{ to: 'a' }], async () => reply({ errors: [{ code: 'X' }] }, 500)),
    ).rejects.toThrow('Expo push 500');
    await expect(
      sendToExpo({}, [{ to: 'a' }], async () => reply({ errors: [{ code: 'PUSH_TOO_MANY' }] })),
    ).rejects.toThrow('rejected the request');
  });

  it('sends the access token when there is one', async () => {
    const fetchImpl = jest.fn(async () => reply({ data: [{ status: 'ok', id: 't' }] }));
    await sendToExpo({ EXPO_ACCESS_TOKEN: 'secret' }, [{ to: 'a' }], fetchImpl);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
    await sendToExpo({}, [{ to: 'a' }], fetchImpl);
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });
});

describe('getReceipts', () => {
  it('maps receipts and leaves unsettled tickets out', async () => {
    const fetchImpl = jest.fn(async () =>
      reply({
        data: {
          a: { status: 'ok' },
          b: { status: 'error', message: 'bad', details: { error: 'InvalidCredentials' } },
        },
      }),
    );
    const out = await getReceipts({}, ['a', 'b', 'c'], fetchImpl);
    expect(out).toEqual({
      a: { status: 'ok' },
      b: { status: 'error', error: 'InvalidCredentials', message: 'bad' },
    });
  });

  it('asks in batches of 1000', async () => {
    const fetchImpl = jest.fn(async () => reply({ data: {} }));
    await getReceipts(
      {},
      Array.from({ length: 1500 }, (_, i) => `id${i}`),
      fetchImpl,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

it('sorts the errors into what to do about them', () => {
  expect(DEAD_DEVICE_ERRORS.has('DeviceNotRegistered')).toBe(true);
  expect(ALERT_ERRORS.has('InvalidCredentials')).toBe(true);
  expect(RETRY_ERRORS.has('MessageRateExceeded')).toBe(true);
});
