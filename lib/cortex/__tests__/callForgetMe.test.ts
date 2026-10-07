/**
 * callForgetMe (lib/cortex/CortexClient.ts): Forget Everything asks cortex to
 * forget, and only cortex's own answer that it has forgotten counts. Any other
 * answer leaves the screen as it was.
 */

let mockToken: string | null = 'token-abc';

jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://cortex.test', cortex: { model: 'x', timeoutMs: 5000 } },
  getEnv: (key: string) => (key === 'EXPO_PUBLIC_CORTEX_URL' ? 'https://cortex.test' : undefined),
}));
jest.mock('../getSessionToken', () => ({
  getSessionToken: async () => mockToken,
  getSessionTokenSync: () => mockToken,
}));
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({ now: () => new Date(), today: () => '2026-10-07', getHour: () => 15 }),
  nowTimestamp: () => '2026-10-07T15:10:00Z',
}));
jest.mock('../../events/EventBus', () => ({ eventBus: { emit: jest.fn() } }));

import { callForgetMe } from '../CortexClient';

const answer = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('callForgetMe', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    mockToken = 'token-abc';
  });

  it('asks cortex to forget, signed in as the person', async () => {
    const fetchMock = jest.fn(async () => answer(200, { ok: true, forgotten: { facts: 3 } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await callForgetMe();
    expect(out.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://cortex.test');
    expect(JSON.parse(String(init.body))).toEqual({ type: 'forget-me' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('does not take a chat answer from a cortex without the forget handler as forgotten', async () => {
    global.fetch = jest.fn(async () =>
      answer(200, { id: 'cmpl-1', content: 'Hello', model: 'm' }),
    ) as unknown as typeof fetch;
    const out = await callForgetMe();
    expect(out.ok).toBe(false);
  });

  it('fails on an error answer', async () => {
    global.fetch = jest.fn(async () =>
      answer(500, { error: 'forget failed' }),
    ) as unknown as typeof fetch;
    const out = await callForgetMe();
    expect(out).toMatchObject({ ok: false, error: 'forget failed' });
  });

  it('does not call cortex when no one is signed in', async () => {
    mockToken = null;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await callForgetMe();
    expect(out.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
