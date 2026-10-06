/**
 * callWeekRead (lib/cortex/CortexClient.ts): the weekly review's read, asked
 * of cortex as server-sent events. Pings keep the phone waiting while a read
 * is made; the answer settles the call once. callWeekSpread asks for the
 * week's spread the same way.
 */

type Listener = (event: { data?: string | null; message?: string }) => void;

class MockEventSource {
  static last: MockEventSource | null = null;
  url: string;
  options: { method?: string; headers?: Record<string, string>; body?: string };
  closed = false;
  private listeners: Record<string, Listener[]> = {};
  constructor(url: string, options: MockEventSource['options']) {
    this.url = url;
    this.options = options;
    MockEventSource.last = this;
  }
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ||= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  say(data: unknown) {
    for (const fn of this.listeners.message || []) fn({ data: JSON.stringify(data) });
  }
  fail(message: string) {
    for (const fn of this.listeners.error || []) fn({ message });
  }
}

let mockToken: string | null = 'token-abc';
let mockDisabled = '';
const mockEmit = jest.fn();

jest.mock('react-native-sse', () => ({
  __esModule: true,
  default: function EventSource(url: string, options: any) {
    return new MockEventSource(url, options);
  },
}));
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://cortex.test', cortex: { model: 'x', timeoutMs: 5000 } },
  getEnv: (key: string) => {
    if (key === 'EXPO_PUBLIC_CORTEX_URL') return 'https://cortex.test';
    if (key === 'EXPO_PUBLIC_DISABLE_AI') return mockDisabled;
    return undefined;
  },
}));
jest.mock('../getSessionToken', () => ({
  getSessionToken: async () => mockToken,
  getSessionTokenSync: () => mockToken,
}));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({ now: () => new Date(), today: () => '2026-10-04', getHour: () => 15 }),
  nowTimestamp: () => '2026-10-04T15:10:00Z',
}));
jest.mock('../../events/EventBus', () => ({
  eventBus: { emit: (...args: unknown[]) => mockEmit(...args) },
}));

import { callWeekRead, callWeekSpread } from '../CortexClient';

const REVIEW = {
  id: 'row-1',
  week_start: '2026-10-05',
  span_start: '2026-10-05',
  status: 'ready',
  kind: 'weekly',
  read: { challenge: { headline: 'A full week', why: 'Three things are due.' } },
};
const ON = {
  kind: 'weekly',
  promoted: true,
  fresh: false,
  week_start: '2026-10-05',
  span_start: '2026-10-05',
  span_end: '2026-10-11',
};

/** Start a call and wait until it is listening. */
async function start(opts?: { timeoutMs?: number; quietMs?: number }) {
  MockEventSource.last = null;
  const pending = callWeekRead({ date: '2026-10-04' }, opts);
  await Promise.resolve();
  await Promise.resolve();
  return { pending, es: MockEventSource.last as unknown as MockEventSource };
}

beforeEach(() => {
  mockToken = 'token-abc';
  mockDisabled = '';
});

describe('callWeekRead', () => {
  it('asks cortex for the read of a review opened today', async () => {
    const { pending, es } = await start();
    expect(es.url).toBe('https://cortex.test');
    expect(es.options.method).toBe('POST');
    expect(es.options.headers).toMatchObject({ Authorization: 'Bearer token-abc' });
    expect(JSON.parse(es.options.body as string)).toEqual({
      type: 'week-read',
      date: '2026-10-04',
    });
    es.say({ done: true, made: false, on: ON, review: REVIEW });
    await pending;
  });

  it('waits through the pings and hands back the week with its read', async () => {
    const { pending, es } = await start();
    es.say({ ping: true });
    es.say({ ping: true });
    es.say({ done: true, made: true, on: ON, review: REVIEW });
    expect(await pending).toEqual({ ok: true, data: { made: true, on: ON, review: REVIEW } });
    expect(es.closed).toBe(true);
  });

  it('says what went wrong, and that a week with no read is no answer', async () => {
    let c = await start();
    c.es.say({ done: true, error: 'the read came back without a challenge' });
    expect(await c.pending).toEqual({ ok: false, error: 'the read came back without a challenge' });

    c = await start();
    c.es.say({ done: true, made: false, on: ON, review: { ...REVIEW, read: null } });
    expect(await c.pending).toEqual({ ok: false, error: 'no read came back' });

    c = await start();
    c.es.fail('network down');
    expect(await c.pending).toEqual({ ok: false, error: 'network down' });
  });

  it('tells the app when the person can only read', async () => {
    const { pending, es } = await start();
    es.say({ error: 'read_only', message: 'Subscription required to use this feature.' });
    expect(await pending).toEqual({ ok: false, error: 'read_only' });
    expect(mockEmit).toHaveBeenCalledWith('cortex:read_only', {});
  });

  it('asks once: a stream that ends is never posted again', async () => {
    const { pending, es } = await start();
    expect((es.options as { pollingInterval?: number }).pollingInterval).toBe(0);
    es.say({ done: true, made: false, on: ON, review: REVIEW });
    await pending;
  });

  it('gives up after its time and stops listening', async () => {
    jest.useFakeTimers();
    const { pending, es } = await start({ timeoutMs: 1000, quietMs: 5000 });
    jest.advanceTimersByTime(1001);
    expect(await pending).toEqual({ ok: false, error: 'timed out' });
    expect(es.closed).toBe(true);
    jest.useRealTimers();
  });

  it('counts a line that goes quiet as lost, while pings keep it alive', async () => {
    jest.useFakeTimers();
    const { pending, es } = await start({ timeoutMs: 60000, quietMs: 1000 });
    // a ping every 800ms keeps it waiting well past the quiet time
    for (let i = 0; i < 4; i++) {
      jest.advanceTimersByTime(800);
      es.say({ ping: true });
    }
    expect(es.closed).toBe(false);
    // then the stream ends without its answer: nothing more is said
    jest.advanceTimersByTime(1001);
    expect(await pending).toEqual({ ok: false, error: 'the connection went quiet' });
    expect(es.closed).toBe(true);
    jest.useRealTimers();
  });

  it('asks nobody when signed out or when AI is switched off', async () => {
    mockToken = null;
    MockEventSource.last = null;
    expect(await callWeekRead({ date: '2026-10-04' })).toEqual({
      ok: false,
      error: 'not signed in',
    });
    mockToken = 'token-abc';
    mockDisabled = 'true';
    expect(await callWeekRead({ date: '2026-10-04' })).toEqual({ ok: false, error: 'AI disabled' });
    expect(MockEventSource.last).toBeNull();
  });
});

describe('callWeekSpread', () => {
  const SPREAD = {
    version: 'week-spread-test',
    made_at: '2026-10-04T19:45:00.000Z',
    made_on: '2026-10-04',
    first: '2026-10-05',
    last: '2026-10-11',
    basis: 'basis',
    place: [{ id: 'todo-1', day: '2026-10-05' }],
    later: [],
    habit_days: [],
    notes: [],
  };
  const BOARD = {
    placed: [{ id: 'todo-2', day: '2026-10-07' }],
    later: [],
    habit_days: [{ id: 'habit-1', days: ['2026-10-05'] }],
  };

  async function spread(board?: typeof BOARD, opts?: { timeoutMs?: number; quietMs?: number }) {
    MockEventSource.last = null;
    const pending = callWeekSpread({ date: '2026-10-04', board }, opts);
    await Promise.resolve();
    await Promise.resolve();
    return { pending, es: MockEventSource.last as unknown as MockEventSource };
  }

  it('asks cortex once for the week’s spread, with their own moves on the board', async () => {
    const { pending, es } = await spread(BOARD);
    expect(es.options.headers).toMatchObject({ Authorization: 'Bearer token-abc' });
    expect((es.options as { pollingInterval?: number }).pollingInterval).toBe(0);
    expect(JSON.parse(es.options.body as string)).toEqual({
      type: 'week-spread',
      date: '2026-10-04',
      board: BOARD,
    });
    es.say({ ping: true });
    es.say({ done: true, on: ON, spread: SPREAD });
    expect(await pending).toEqual({ ok: true, data: { on: ON, spread: SPREAD } });
    expect(es.closed).toBe(true);
  });

  it('sends no board when they have moved nothing', async () => {
    const { pending, es } = await spread();
    expect(JSON.parse(es.options.body as string).board).toBeNull();
    es.say({ done: true, on: ON, spread: SPREAD });
    await pending;
  });

  it('says what went wrong, and that an answer with no spread is no answer', async () => {
    let c = await spread();
    c.es.say({ done: true, error: 'there is no review with a read to spread' });
    expect(await c.pending).toEqual({
      ok: false,
      error: 'there is no review with a read to spread',
    });

    c = await spread();
    c.es.say({ done: true, on: ON, spread: null });
    expect(await c.pending).toEqual({ ok: false, error: 'no spread came back' });
  });

  it('counts a line that goes quiet as lost, and asks nobody when signed out', async () => {
    jest.useFakeTimers();
    const { pending, es } = await spread(BOARD, { timeoutMs: 60000, quietMs: 1000 });
    jest.advanceTimersByTime(800);
    es.say({ ping: true });
    expect(es.closed).toBe(false);
    jest.advanceTimersByTime(1001);
    expect(await pending).toEqual({ ok: false, error: 'the connection went quiet' });
    jest.useRealTimers();
    mockToken = null;
    MockEventSource.last = null;
    expect(await callWeekSpread({ date: '2026-10-04' })).toEqual({
      ok: false,
      error: 'not signed in',
    });
    expect(MockEventSource.last).toBeNull();
  });
});
