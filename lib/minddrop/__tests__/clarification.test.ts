/**
 * clarification.ts tests: the Phase 1.5 helper must always resolve to a
 * usable question + options (worker answer or fixed fallback), within its
 * timeout, whatever the network does.
 */
jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test.cortex' },
  getEnv: (key: string) => (key === 'EXPO_PUBLIC_CORTEX_URL' ? 'https://test.cortex' : undefined),
}));
jest.mock('../../cortex/getSessionToken', () => ({
  getSessionToken: jest.fn().mockResolvedValue('tok'),
}));
jest.mock('../../date/DateService', () => ({
  dateService: { today: () => '2026-09-28' },
}));

import {
  CLARIFY_FALLBACKS,
  buildFallbackClarification,
  fetchClarification,
  hasUsableClarification,
  mapWorkerOptions,
  normalizeAmbiguityType,
} from '../clarification';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('fallback copy', () => {
  it('has at least two options for every ambiguity type', () => {
    for (const [type, cfg] of Object.entries(CLARIFY_FALLBACKS)) {
      expect(cfg.options.length).toBeGreaterThanOrEqual(2);
      expect(cfg.question.length).toBeGreaterThan(5);
      expect(buildFallbackClarification(type).options).toHaveLength(cfg.options.length);
    }
  });

  it('contains no em or en dashes (house rule)', () => {
    const all = JSON.stringify(CLARIFY_FALLBACKS);
    expect(all).not.toMatch(/[–—]/);
  });

  it('normalises unknown or missing types to bucket', () => {
    expect(normalizeAmbiguityType(null)).toBe('bucket');
    expect(normalizeAmbiguityType('nonsense')).toBe('bucket');
    expect(normalizeAmbiguityType('scope')).toBe('scope');
  });
});

describe('mapWorkerOptions', () => {
  it('maps worker shape to client shape', () => {
    const mapped = mapWorkerOptions([
      { id: 'opt_1', label: 'Booked', bucket: 'log', subtype: 'event', dateField: 'target_date' },
      { id: 'opt_2', label: 'Need to book', bucket: 'todo', subtype: null, habitSubtype: null },
    ]);
    expect(mapped).toEqual([
      expect.objectContaining({
        id: 'opt_1',
        action: expect.objectContaining({ bucket: 'log', subtype: 'event', target_date: true }),
      }),
      expect.objectContaining({
        id: 'opt_2',
        action: expect.objectContaining({ bucket: 'todo', target_date: false }),
      }),
    ]);
  });

  it('accepts already client-shaped options', () => {
    const mapped = mapWorkerOptions([
      { id: 'a', label: 'One', action: { bucket: 'todo', subtype: null } },
      { id: 'b', label: 'Two', action: { bucket: 'habit', habitSubtype: 'start_habit' } },
    ]);
    expect(mapped![1].action.habitSubtype).toBe('start_habit');
  });

  it('returns null for fewer than two usable options', () => {
    expect(mapWorkerOptions([{ id: 'a', label: 'Only one', bucket: 'todo' }])).toBeNull();
    expect(mapWorkerOptions(null)).toBeNull();
  });
});

describe('hasUsableClarification', () => {
  it('requires a question and two options', () => {
    expect(hasUsableClarification('Q?', [{}, {}])).toBe(true);
    expect(hasUsableClarification('', [{}, {}])).toBe(false);
    expect(hasUsableClarification('Q?', [{}])).toBe(false);
    expect(hasUsableClarification(null, null)).toBe(false);
  });
});

describe('fetchClarification', () => {
  it('returns the worker answer when valid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          clarification_question: 'Is yoga a regular thing?',
          options: [
            { id: 'opt_1', label: 'Just once', bucket: 'todo' },
            { id: 'opt_2', label: 'Every week', bucket: 'habit', habitSubtype: 'start_habit' },
          ],
        }),
    }) as any;
    const res = await fetchClarification({ text: 'Yoga', ambiguityType: 'habit_or_todo' });
    expect(res.source).toBe('worker');
    expect(res.question).toBe('Is yoga a regular thing?');
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toMatchObject({
      type: 'clarify-ambiguity',
      text: 'Yoga',
      ambiguityType: 'habit_or_todo',
    });
  });

  it('sends bucket when no type is given', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    await fetchClarification({ text: 'Vitamins' });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.ambiguityType).toBe('bucket');
  });

  it('falls back on timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => {})) as any;
    const p = fetchClarification({ text: 'Passport', ambiguityType: 'bucket', timeoutMs: 5000 });
    // let getSessionToken resolve and fetch start
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(5001);
    const res = await p;
    expect(res.source).toBe('fallback');
    expect(res.options.length).toBe(3);
  });

  it('falls back on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    const res = await fetchClarification({ text: 'Yoga', ambiguityType: 'commitment_level' });
    expect(res.source).toBe('fallback');
    expect(res.ambiguityType).toBe('commitment_level');
  });

  it('falls back without calling the network for empty text', async () => {
    global.fetch = jest.fn() as any;
    const res = await fetchClarification({ text: '   ' });
    expect(res.source).toBe('fallback');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
