import { callChat, callComplete } from '../lib/cortex/CortexClient';
import { env } from '../lib/env';

describe('CortexClient', () => {
  const origFetch = global.fetch;
  const origUrl = env.cortexUrl;

  beforeEach(() => {
    // @ts-expect-error override readonly in test
    env.cortexUrl = 'https://example.com/proxy';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'test-id', content: 'test response' }),
      json: async () => ({ id: 'test-id', content: 'test response' }),
    }) as any;
  });

  afterEach(() => {
    // @ts-expect-error restore
    env.cortexUrl = origUrl;
    global.fetch = origFetch as any;
    jest.useRealTimers();
  });

  it('posts chat payload and returns data', async () => {
    const res = await callChat([{ role: 'user', content: 'hi' }]);
    expect(res).toEqual({
      ok: true,
      data: { id: 'test-id', content: 'test response', model: undefined, usage: undefined },
    });
  });

  it('posts complete payload and returns data', async () => {
    const res = await callComplete('say hi');
    expect(res).toEqual({
      ok: true,
      data: { id: 'test-id', content: 'test response', model: undefined, usage: undefined },
    });
  });
});
