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
  optionFollowUp,
  optionKind,
} from '../clarification';
import { AMBIGUITY_TYPES, CLARIFY_TYPE_CONFIGS } from '../../../workers/cortex/classifyV3.js';

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

describe("the writer's own words (stage 4)", () => {
  const reply = (extra: Record<string, unknown>) =>
    (global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        clarification_question: 'Booked, or still to book?',
        options: [
          { id: 'opt_1', label: 'Booked', bucket: 'log', subtype: 'event' },
          { id: 'opt_2', label: 'To book', bucket: 'todo' },
        ],
        ...extra,
      }),
    }) as any);

  it("says so when the Worker says the question or labels are the model's", async () => {
    reply({ question_source: 'model', labels_source: 'fallback' });
    expect((await fetchClarification({ text: 'dentist' })).writerWords).toBe(true);
    reply({ question_source: 'fallback', labels_source: 'mixed' });
    expect((await fetchClarification({ text: 'dentist' })).writerWords).toBe(true);
  });

  it('does not when the Worker used its fixed copy, or does not say', async () => {
    reply({ question_source: 'fallback', labels_source: 'fallback' });
    expect((await fetchClarification({ text: 'dentist' })).writerWords).toBe(false);
    reply({});
    expect((await fetchClarification({ text: 'dentist' })).writerWords).toBe(false);
  });
});

describe('parity with the Worker', () => {
  it('has fixed copy for every Worker question type', () => {
    for (const t of AMBIGUITY_TYPES) expect(CLARIFY_FALLBACKS[t]).toBeDefined();
  });

  it('files each fixed answer exactly as the Worker does', () => {
    for (const t of AMBIGUITY_TYPES) {
      const worker = (CLARIFY_TYPE_CONFIGS as Record<string, any>)[t].options;
      const app = CLARIFY_FALLBACKS[t].options;
      expect(app.map((o) => o.id)).toEqual(worker.map((o: any) => o.id));
      app.forEach((o, i) => {
        const w = worker[i];
        expect([
          t,
          o.bucket,
          o.subtype ?? null,
          o.kind ?? null,
          o.dateField ?? null,
          o.followUp ?? null,
        ]).toEqual([
          t,
          w.bucket,
          w.subtype ?? null,
          w.kind ?? null,
          w.dateField ?? null,
          w.followUp ?? null,
        ]);
        if (!w.habitFromDirection) expect(o.habitSubtype ?? null).toEqual(w.habitSubtype ?? null);
      });
    }
  });
});

describe('answers that do not file the drop', () => {
  it('offers chat and discard for a drop addressed to Gremly', () => {
    const c = buildFallbackClarification('conversation');
    expect(c.ambiguityType).toBe('conversation');
    expect(c.options.map((o) => optionKind(o))).toEqual(['chat', 'discard', null]);
  });

  it('offers chat, later and keep for a question to answer', () => {
    const c = buildFallbackClarification('open_question');
    expect(c.options.map((o) => [optionKind(o), o.action.bucket])).toEqual([
      ['chat', 'log'],
      [null, 'todo'],
      [null, 'log'],
    ]);
  });

  it('carries the kind through from the Worker shape', () => {
    const mapped = mapWorkerOptions([
      { id: 'opt_1', label: 'Chat with Gremly', bucket: 'log', subtype: 'general', kind: 'chat' },
      { id: 'opt_2', label: 'Keep it', bucket: 'log', subtype: 'general' },
    ]);
    expect(mapped?.map((o) => o.action.kind)).toEqual(['chat', null]);
    expect(optionKind(mapped?.[0])).toBe('chat');
    expect(optionKind({ id: 'x', label: 'y', kind: 'nonsense' })).toBeNull();
  });
});

describe('appointments', () => {
  it('asks when after "it is booked", and files it as an event', () => {
    const c = buildFallbackClarification('booking');
    expect(c.ambiguityType).toBe('booking');
    expect(c.options.map((o) => [o.action.bucket, o.action.subtype, optionFollowUp(o)])).toEqual([
      ['log', 'event', 'when'],
      ['todo', null, null],
      ['log', 'general', null],
    ]);
  });

  it('carries the follow up through from the Worker shape', () => {
    const mapped = mapWorkerOptions([
      { id: 'opt_1', label: 'Already booked', bucket: 'log', subtype: 'event', followUp: 'when' },
      { id: 'opt_2', label: 'Need to book', bucket: 'todo', subtype: null },
    ]);
    expect(mapped?.map((o) => o.action.followUp)).toEqual(['when', null]);
  });
});
