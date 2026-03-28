/**
 * Detect Multi Tests
 *
 * Tests for Phase 0 multi-entity detection.
 * Verifies the API call and response parsing.
 */

import { detectMulti } from '../detectMulti';

// Mock env
jest.mock('../../env', () => ({
  env: {
    cortexUrl: 'https://test-cortex.example.com',
    supabaseAnonKey: 'test-anon-key',
  },
  getEnv: jest.fn((key: string) => {
    if (key === 'EXPO_PUBLIC_CORTEX_URL') return 'https://test-cortex.example.com';
    if (key === 'EXPO_PUBLIC_SUPABASE_ANON_KEY') return 'test-anon-key';
    return undefined;
  }),
}));

describe('detectMulti', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('API call', () => {
    it('sends correct request to cortex', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ is_multi: false }),
      });

      await detectMulti('buy milk and start running');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test-cortex.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-anon-key',
          },
          body: JSON.stringify({
            type: 'detect-multi',
            text: 'buy milk and start running',
          }),
        }),
      );
    });
  });

  describe('single-entity detection', () => {
    it('returns is_multi: false for single item', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ is_multi: false }),
      });

      const result = await detectMulti('buy groceries');

      expect(result.is_multi).toBe(false);
      expect(result.segments).toBeUndefined();
    });
  });

  describe('multi-entity detection', () => {
    it('returns segments for multi-item input', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            segments: [
              { text: 'buy milk', likely_bucket: 'todo' },
              { text: 'start running every morning', likely_bucket: 'habit' },
            ],
            summary: 'Groceries + Running Habit',
            confidence: 0.92,
            dominant_bucket: 'todo',
            dominant_subtype: null,
          }),
      });

      const result = await detectMulti('buy milk and start running every morning');

      expect(result.is_multi).toBe(true);
      expect(result.segments).toHaveLength(2);
      expect(result.segments?.[0].text).toBe('buy milk');
      expect(result.segments?.[0].likely_bucket).toBe('todo');
      expect(result.segments?.[1].likely_bucket).toBe('habit');
      expect(result.summary).toBe('Groceries + Running Habit');
      expect(result.dominant_bucket).toBe('todo');
    });

    it('extracts dominant_subtype for journal entries', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            segments: [
              { text: 'feeling happy today', likely_bucket: 'log', likely_subtype: 'journal' },
              { text: 'call mom', likely_bucket: 'todo' },
            ],
            dominant_bucket: 'log',
            dominant_subtype: 'journal',
          }),
      });

      const result = await detectMulti('feeling happy today. call mom');

      expect(result.dominant_bucket).toBe('log');
      expect(result.dominant_subtype).toBe('journal');
    });
  });

  describe('error handling', () => {
    it('returns is_multi: false on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await detectMulti('buy milk and run');

      expect(result.is_multi).toBe(false);
    });

    it('returns is_multi: false on non-OK response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await detectMulti('buy milk and run');

      expect(result.is_multi).toBe(false);
    });

    it('returns is_multi: false on JSON parse error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const result = await detectMulti('buy milk and run');

      expect(result.is_multi).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty segments array', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            segments: [],
          }),
      });

      const result = await detectMulti('something');

      expect(result.is_multi).toBe(true);
      expect(result.segments).toEqual([]);
    });

    it('handles missing optional fields', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            is_multi: true,
            segments: [{ text: 'test', likely_bucket: 'todo' }],
            // No summary, confidence, dominant_bucket, dominant_subtype
          }),
      });

      const result = await detectMulti('test');

      expect(result.is_multi).toBe(true);
      expect(result.segments).toHaveLength(1);
      expect(result.summary).toBeUndefined();
      expect(result.confidence).toBeUndefined();
      expect(result.dominant_bucket).toBeUndefined();
    });
  });
});
