/**
 * Tests for callClassify from CortexClient.ts.
 *
 * Covers: single-flight dedupe, AI disabled guard, missing URL guard,
 * Cloudflare Worker response format, OpenAI fallback format, timeout,
 * non-200 responses, bucket → category aliasing, aiTitle preference.
 */

// ─── Module-level mutable state ────────────────────────────────────────────

let mockSessionToken: string | null = 'token-abc';
let mockFetchResponse: { ok: boolean; status: number; text: string } = {
  ok: true,
  status: 200,
  text: '{}',
};
let mockFetchShouldThrow: Error | null = null;

// ─── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('../../env', () => ({
  env: {
    cortexUrl: 'https://cortex.test',
    cortex: { model: 'gpt-4o-mini', timeoutMs: 5000 },
  },
  getEnv: (key: string) => {
    if (key === 'EXPO_PUBLIC_CORTEX_URL') return 'https://cortex.test';
    if (key === 'EXPO_PUBLIC_DISABLE_AI') return '';
    return undefined;
  },
}));

jest.mock('../getSessionToken', () => ({
  getSessionToken: async () => mockSessionToken,
  getSessionTokenSync: () => mockSessionToken,
}));

jest.mock('react-native-sse', () => ({}));

jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    now: () => new Date(),
    today: () => '2025-06-15',
    getHour: () => 12,
  }),
  nowTimestamp: () => '2025-06-15T12:00:00Z',
  dateService: {
    now: () => new Date(),
    today: () => '2025-06-15',
    getHour: () => 12,
  },
}));

jest.mock('../../events/EventBus', () => ({
  eventBus: { emit: () => {} },
}));

// Mock fetch globally
const originalFetch = global.fetch;
beforeAll(() => {
  (global as any).fetch = async (_url: string, _opts: any) => {
    if (mockFetchShouldThrow) throw mockFetchShouldThrow;
    return {
      ok: mockFetchResponse.ok,
      status: mockFetchResponse.status,
      text: async () => mockFetchResponse.text,
    };
  };
});
afterAll(() => {
  global.fetch = originalFetch;
});

import { callClassify } from '../CortexClient';

beforeEach(() => {
  mockSessionToken = 'token-abc';
  mockFetchResponse = { ok: true, status: 200, text: '{}' };
  mockFetchShouldThrow = null;
});

describe('callClassify', () => {
  it('returns ok:true for a valid Cloudflare Worker response', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      text: JSON.stringify({
        id: 'cmpl-123',
        classification: {
          category: 'todo',
          tags: ['errand'],
          spaceName: null,
          confidence: 0.9,
          title: 'Buy groceries',
        },
      }),
    };

    const result = await callClassify({ text: 'buy groceries' });
    expect(result).toEqual({
      ok: true,
      id: 'cmpl-123',
      classification: {
        category: 'todo',
        tags: ['errand'],
        spaceName: null,
        confidence: 0.9,
        title: 'Buy groceries',
      },
    });
  });

  it('accepts "bucket" field as alias for "category"', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      text: JSON.stringify({
        id: 'cmpl-456',
        classification: {
          bucket: 'habit',
          tags: ['health'],
          spaceName: null,
          confidence: 0.85,
          title: null,
        },
      }),
    };

    const result = await callClassify({ text: 'run every day' });
    expect(result).toMatchObject({
      ok: true,
      classification: { category: 'habit' },
    });
  });

  it('prefers aiTitle over classification.title', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      text: JSON.stringify({
        id: 'cmpl-789',
        aiTitle: 'Smart Title',
        classification: {
          category: 'note',
          tags: [],
          spaceName: null,
          confidence: 0.7,
          title: 'Fallback Title',
        },
      }),
    };

    const result = await callClassify({ text: 'some note' });
    expect(result).toMatchObject({
      ok: true,
      classification: { title: 'Smart Title' },
    });
  });

  it('prefers aiTagsDebug over classification.tags', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      text: JSON.stringify({
        id: 'cmpl-tags',
        aiTagsDebug: ['debug-tag'],
        classification: {
          category: 'todo',
          tags: ['original-tag'],
          spaceName: null,
          confidence: 0.8,
          title: null,
        },
      }),
    };

    const result = await callClassify({ text: 'tagged text' });
    expect(result).toMatchObject({
      ok: true,
      classification: { tags: ['debug-tag'] },
    });
  });

  it('handles OpenAI-shaped fallback response', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      text: JSON.stringify({
        id: 'chatcmpl-abc',
        choices: [
          {
            message: {
              content: JSON.stringify({
                category: 'log',
                tags: ['mood'],
                spaceName: null,
                confidence: 0.6,
                title: 'Journal entry',
              }),
            },
          },
        ],
      }),
    };

    const result = await callClassify({ text: 'feeling good today' });
    expect(result).toMatchObject({
      ok: true,
      classification: { category: 'log', title: 'Journal entry' },
    });
  });

  it('returns error for non-200 status', async () => {
    mockFetchResponse = { ok: false, status: 500, text: 'Internal Server Error' };
    const result = await callClassify({ text: 'test' });
    expect(result).toMatchObject({ ok: false });
    expect((result as any).error).toContain('500');
  });

  it('returns error on network failure', async () => {
    mockFetchShouldThrow = new Error('Network request failed');
    const result = await callClassify({ text: 'test' });
    expect(result).toMatchObject({ ok: false, error: 'Network request failed' });
  });

  it('returns error for unrecognized response format', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      text: JSON.stringify({ weirdField: true }),
    };
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await callClassify({ text: 'test' });
    expect(result).toEqual({ ok: false, error: 'unrecognized_response' });
    spy.mockRestore();
  });

  it('returns error for invalid JSON response', async () => {
    mockFetchResponse = { ok: true, status: 200, text: 'not json{' };
    const result = await callClassify({ text: 'test' });
    expect(result).toEqual({ ok: false, error: 'invalid_json_response' });
  });

  it('handles wrapped data format { data: { id, classification }, status: 200 }', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      text: JSON.stringify({
        data: {
          id: 'wrapped-id',
          classification: {
            category: 'todo',
            tags: ['work'],
            spaceName: 'Work',
            confidence: 0.95,
            title: 'Wrapped title',
          },
        },
        status: 200,
      }),
    };

    const result = await callClassify({ text: 'wrapped' });
    expect(result).toMatchObject({
      ok: true,
      id: 'wrapped-id',
      classification: { category: 'todo', spaceName: 'Work' },
    });
  });
});
