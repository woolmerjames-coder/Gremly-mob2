import { hashString, logCatchallDecision } from '../../../lib/telemetry/catchallLogger';

// Minimal mock for env access
jest.mock('../../../lib/env', () => ({
  getEnv: (k: string) => {
    if (k === 'EXPO_PUBLIC_CORTEX_LOGS') return 'on';
    if (k === 'EXPO_PUBLIC_CORTEX_LOGS_URL')
      return 'http://localhost:54321/functions/v1/cortex-logs-collector';
    return undefined;
  },
}));

describe('hashString', () => {
  test('stable output', () => {
    const a = hashString('hello');
    const b = hashString('hello');
    expect(a).toBe(b);
  });

  test('different for different inputs', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });
});

describe('logCatchallDecision', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any;
  });

  test('sends POST with hashed fields', async () => {
    await logCatchallDecision({
      userId: 'user-123',
      text: 'Buy milk tomorrow',
      surface: 'catchall',
      engine: 'LLM',
      intent: 'todo',
      confidence: 0.92,
      mode: 'auto',
      decision: 'auto_create',
    });
    expect(global.fetch).toHaveBeenCalled();
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('cortex-logs-collector');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.user_id_hash).toBeDefined();
    expect(body.text_hash).toBeDefined();
    expect(body.text_hash).not.toBe('Buy milk tomorrow'); // not raw
  });
});
