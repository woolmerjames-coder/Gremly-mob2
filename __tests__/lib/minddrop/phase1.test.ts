/**
 * Phase 1 Classification Tests
 */

import { runPhase1 } from '../../../lib/minddrop/phase1';

// Mock env module
jest.mock('../../../lib/env', () => ({
  env: {
    cortexUrl: 'https://test.supabase.co/functions/v1/cortex-proxy',
    supabaseAnonKey: 'test-anon-key',
  },
  getEnv: jest.fn((key: string) => {
    if (key === 'EXPO_PUBLIC_CORTEX_URL')
      return 'https://test.supabase.co/functions/v1/cortex-proxy';
    if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') return 'test-anon-key';
    return undefined;
  }),
}));

// Mock feature flags
jest.mock('../../../lib/config/featureFlags', () => ({
  FEATURE_FLAGS: {
    HEURISTIC_LOGGING_ENABLED: false,
    PHASE2_ENRICHMENT_ENABLED: true,
    MIND_DROP_V4_ENABLED: true,
    USE_ZUSTAND_STORE: false,
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('runPhase1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('error fallback', () => {
    test('returns fallback with api-error classificationSource on fetch rejection', async () => {
      // Timeout is now handled by dropPhases.ts withTimeout(15s), not phase1.
      // Phase1 only produces fallback on actual API errors.
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await runPhase1('buy milk', {});

      expect(result.source).toBe('heuristic-fallback');
      expect(result.bucket).toBe('log');
      expect(result.subtype).toBe('general');
      expect(result.confidence).toBe(0.5);
      expect(result.classificationSource).toBe('api-error');
    });
  });

  describe('API confirmation', () => {
    test('returns API result with source from API', async () => {
      // Mock fetch to return classification
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            bucket: 'todo',
            confidence: 0.9,
            subtype: null,
            source: 'heuristic', // Worker may return heuristic or api source
            latency_ms: 150,
          }),
      });

      const result = await runPhase1('buy milk', {});

      // Should use source from API response
      expect(result.source).toBe('heuristic');
      expect(result.bucket).toBe('todo');
      expect(result.confidence).toBe(0.9);
      expect(result.subtype).toBeNull();
    });

    test('returns API result when API disagrees with heuristic', async () => {
      // Mock fetch to return different classification
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            bucket: 'log',
            confidence: 0.8,
            subtype: 'general',
            latency_ms: 200,
          }),
      });

      // 'buy milk' heuristic says todo, but API says log
      const result = await runPhase1('buy milk', {});

      // Should use API result
      expect(result.source).toBe('api');
      expect(result.bucket).toBe('log');
      expect(result.confidence).toBe(0.8);
      expect(result.subtype).toBe('general');
    });
  });

  describe('error handling', () => {
    test('falls back on API error', async () => {
      // Mock fetch to throw error
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await runPhase1('buy milk', {});

      // Should return fallback (log/general)
      expect(result.source).toBe('heuristic-fallback');
      expect(result.bucket).toBe('log');
      expect(result.subtype).toBe('general');
    });

    test('falls back on non-ok response', async () => {
      // Mock fetch to return non-ok status
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal error' }),
      });

      const result = await runPhase1('exercise daily', {});

      // Should return fallback (log/general)
      expect(result.source).toBe('heuristic-fallback');
      expect(result.bucket).toBe('log');
      expect(result.subtype).toBe('general');
    });

    test('falls back to heuristic when response missing bucket', async () => {
      // Mock fetch to return invalid response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: false,
            error: 'invalid_request',
          }),
      });

      const result = await runPhase1('I feel grateful today', {});

      // Should return heuristic fallback
      expect(result.source).toBe('heuristic-fallback');
      expect(result.bucket).toBe('log');
    });
  });

  describe('context handling', () => {
    test('sends hasAttachments in request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            bucket: 'log',
            confidence: 0.9,
            subtype: 'general',
          }),
      });

      await runPhase1('test text', { hasAttachments: true });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"hasAttachments":true'),
        }),
      );
    });

    test('sends correct request structure to classify-phase1-v2', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            bucket: 'todo',
            confidence: 0.9,
            subtype: null,
          }),
      });

      await runPhase1('buy milk', {});

      // New architecture uses classify-phase1-v2 endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"type":"classify-phase1-v2"'),
        }),
      );
    });
  });

  describe('subtype handling', () => {
    test('returns subtype only for log bucket', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            bucket: 'log',
            confidence: 0.85,
            subtype: 'journal',
          }),
      });

      const result = await runPhase1('I feel grateful today', {});

      expect(result.bucket).toBe('log');
      expect(result.subtype).toBe('journal');
    });

    test('returns null subtype for todo bucket', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            bucket: 'todo',
            confidence: 0.9,
            subtype: 'general', // API might still send this, should be ignored
          }),
      });

      const result = await runPhase1('buy milk', {});

      expect(result.bucket).toBe('todo');
      expect(result.subtype).toBeNull();
    });

    test('defaults to general subtype for log when API returns null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            bucket: 'log',
            confidence: 0.8,
            subtype: null,
          }),
      });

      const result = await runPhase1('some random text here', {});

      expect(result.bucket).toBe('log');
      expect(result.subtype).toBe('general');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Multi-Entity Response Handling
  // ─────────────────────────────────────────────────────────────────────────────

  describe('multi-entity response handling', () => {
    test('returns is_multi: true when API returns multi-entity response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            items: [
              { text: 'buy milk', bucket: 'todo', subtype: null, preview_title: 'Buy milk' },
              {
                text: 'start running',
                bucket: 'habit',
                subtype: null,
                habitSubtype: 'start_habit',
                preview_title: 'Running habit',
              },
            ],
            summary_title: 'Groceries + Running',
            confidence: 0.85,
          }),
      });

      const result = await runPhase1('buy milk and start running', {});

      expect(result.is_multi).toBe(true);
    });

    test('returns items array from API response', async () => {
      const mockItems = [
        { text: 'buy milk', bucket: 'todo', subtype: null, preview_title: 'Buy milk' },
        {
          text: 'feeling anxious',
          bucket: 'log',
          subtype: 'journal',
          preview_title: 'Anxiety reflection',
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            items: mockItems,
            summary_title: 'Task + Journal',
            confidence: 0.9,
          }),
      });

      const result = await runPhase1('buy milk and feeling anxious', {});

      expect(result.items).toBeDefined();
      expect(result.items).toHaveLength(2);
      expect(result.items![0].text).toBe('buy milk');
      expect(result.items![0].bucket).toBe('todo');
      expect(result.items![1].text).toBe('feeling anxious');
      expect(result.items![1].bucket).toBe('log');
      expect(result.items![1].subtype).toBe('journal');
    });

    test('returns summary_title from API response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            items: [
              { text: 'buy milk', bucket: 'todo', preview_title: 'Buy milk' },
              { text: 'exercise daily', bucket: 'habit', preview_title: 'Exercise' },
            ],
            summary_title: 'Groceries + Exercise Habit',
            confidence: 0.88,
          }),
      });

      const result = await runPhase1('buy milk and exercise daily', {});

      expect(result.summary_title).toBe('Groceries + Exercise Habit');
    });

    test('falls back to first item bucket for backward compatibility', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            items: [
              { text: 'buy milk', bucket: 'todo', subtype: null, preview_title: 'Buy milk' },
              {
                text: 'start running',
                bucket: 'habit',
                subtype: null,
                preview_title: 'Running',
              },
            ],
            summary_title: 'Multi items',
            confidence: 0.85,
          }),
      });

      const result = await runPhase1('buy milk and start running', {});

      // For backward compatibility, bucket should be first item's bucket
      expect(result.bucket).toBe('todo');
    });

    test('single-entity responses have is_multi: false', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            bucket: 'todo',
            confidence: 0.9,
            subtype: null,
          }),
      });

      const result = await runPhase1('buy milk', {});

      expect(result.is_multi).toBe(false);
      expect(result.items).toBeUndefined();
    });

    test('fallback has is_multi: false', async () => {
      // Simulate API error (timeout is now handled by dropPhases.ts, not phase1)
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await runPhase1('buy milk', {});

      expect(result.is_multi).toBe(false);
      expect(result.source).toBe('heuristic-fallback');
    });

    test('handles multi-entity with habit subtypes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            items: [
              {
                text: 'start meditating',
                bucket: 'habit',
                subtype: null,
                habitSubtype: 'start_habit',
                preview_title: 'Meditation habit',
              },
              {
                text: 'stop smoking',
                bucket: 'habit',
                subtype: null,
                habitSubtype: 'break_habit',
                preview_title: 'Quit smoking',
              },
            ],
            summary_title: 'New habits',
            confidence: 0.92,
          }),
      });

      const result = await runPhase1('start meditating and stop smoking', {});

      expect(result.is_multi).toBe(true);
      expect(result.items![0].habitSubtype).toBe('start_habit');
      expect(result.items![1].habitSubtype).toBe('break_habit');
    });
  });
});
