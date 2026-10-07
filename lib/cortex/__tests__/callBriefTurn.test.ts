/**
 * callBriefTurn (lib/cortex/CortexClient.ts): a message typed in today's
 * thread, asked of cortex as server-sent events. It is asked once: the
 * message is never posted a second time, and a line that goes quiet without
 * its answer counts as lost.
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

import { callBriefTurn, type BriefTurnRequest } from '../CortexClient';

const REQ = { text: 'move the dentist to Friday', date: '2026-10-04' } as BriefTurnRequest;
const ANSWER = { engine: 'agent', reply: 'Friday it is.', card: [], tasks: [] };

/** Start a call and wait until it is listening. */
async function start(opts?: Parameters<typeof callBriefTurn>[1]) {
  MockEventSource.last = null;
  const pending = callBriefTurn(REQ, opts);
  await Promise.resolve();
  await Promise.resolve();
  return { pending, es: MockEventSource.last as unknown as MockEventSource };
}

beforeEach(() => {
  mockToken = 'token-abc';
  mockDisabled = '';
});

describe('callBriefTurn', () => {
  it('sends the message once: a stream that ends is never posted again', async () => {
    const { pending, es } = await start();
    expect(es.options.method).toBe('POST');
    expect(JSON.parse(es.options.body as string)).toMatchObject({
      type: 'brief-turn',
      text: 'move the dentist to Friday',
    });
    // left at its default the stream library posts the request again every five seconds
    expect((es.options as { pollingInterval?: number }).pollingInterval).toBe(0);
    es.say({ done: true, ...ANSWER });
    await pending;
  });

  it('passes the status lines on and resolves with the answer', async () => {
    const lines: string[] = [];
    const { pending, es } = await start({ onStatus: (l) => lines.push(l) });
    es.say({ ping: true });
    es.say({ status: 'Looking at your day' });
    es.say({ ping: true });
    es.say({ done: true, ...ANSWER, hold: { question: 'Which Friday?' } });
    expect(await pending).toEqual({
      ok: true,
      data: { ...ANSWER, hold: { question: 'Which Friday?' } },
    });
    expect(lines).toEqual(['Looking at your day']);
    expect(es.closed).toBe(true);
  });

  it('says so when the turn failed, or the stream did', async () => {
    let c = await start();
    c.es.say({ done: true, error: 'failed' });
    expect(await c.pending).toEqual({ ok: false, error: 'failed' });

    c = await start();
    c.es.fail('network down');
    expect(await c.pending).toEqual({ ok: false, error: 'network down' });
  });

  it('counts a stream that ends without its answer as lost, well before its whole time', async () => {
    jest.useFakeTimers();
    const { pending, es } = await start();
    // the worker pings every five seconds while it works
    for (let i = 0; i < 2; i++) {
      jest.advanceTimersByTime(5000);
      es.say({ ping: true });
    }
    expect(es.closed).toBe(false);
    // ten seconds in the stream ends with no answer: nothing more is said, and
    // nothing is sent again. Fifteen quiet seconds later the call says so,
    // five seconds before its whole time would have been up.
    jest.advanceTimersByTime(14999);
    expect(es.closed).toBe(false);
    jest.advanceTimersByTime(2);
    expect(await pending).toEqual({ ok: false, error: 'the connection went quiet' });
    expect(es.closed).toBe(true);
    jest.useRealTimers();
  });

  it('gives up when its whole time is up, even with the line still open', async () => {
    jest.useFakeTimers();
    const { pending, es } = await start({ timeoutMs: 12000 });
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(4000);
      es.say({ ping: true });
    }
    expect(await pending).toEqual({ ok: false, error: 'timed out' });
    expect(es.closed).toBe(true);
    jest.useRealTimers();
  });

  it('hears nothing after it has settled', async () => {
    const lines: string[] = [];
    const { pending, es } = await start({ onStatus: (l) => lines.push(l) });
    es.say({ done: true, ...ANSWER });
    await pending;
    es.say({ status: 'late' });
    expect(lines).toEqual([]);
  });

  it('tells the app when the person can only read', async () => {
    const { pending, es } = await start();
    es.say({ error: 'read_only' });
    expect(await pending).toEqual({ ok: false, error: 'read_only' });
    expect(mockEmit).toHaveBeenCalledWith('cortex:read_only', {});
  });
});
