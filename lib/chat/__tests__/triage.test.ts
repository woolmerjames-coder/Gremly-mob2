/**
 * Tests for lib/chat/triage.ts
 *
 * Covers triageMessage, PRESET_TO_TRIAGE mapping, and fallback behavior.
 * Network calls are mocked — we test logic, not API availability.
 */

import { triageMessage, PRESET_TO_TRIAGE } from '../triage';
import type { TriageResult, TriageMode, TriageSearch } from '../triage';

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch
// ─────────────────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockNanoResponse(body: Record<string, string>) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: JSON.stringify(body) } }],
      }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const baseOptions = {
  userMessage: 'I feel overwhelmed today',
  previousExchange: null,
  chatType: 'space' as const,
  env: { OPENAI_API_KEY: 'test-key' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PRESET_TO_TRIAGE mapping', () => {
  it('maps break_down to action_ready/none', () => {
    expect(PRESET_TO_TRIAGE.break_down).toEqual({
      mode: 'action_ready',
      search: 'none',
      source: 'preset',
    });
  });

  it('maps research to research/required', () => {
    expect(PRESET_TO_TRIAGE.research).toEqual({
      mode: 'research',
      search: 'required',
      source: 'preset',
    });
  });

  it('maps think_through to exploratory/none', () => {
    expect(PRESET_TO_TRIAGE.think_through).toEqual({
      mode: 'exploratory',
      search: 'none',
      source: 'preset',
    });
  });

  it('maps whats_blocking to emotional/none', () => {
    expect(PRESET_TO_TRIAGE.whats_blocking).toEqual({
      mode: 'emotional',
      search: 'none',
      source: 'preset',
    });
  });

  it('covers all defined presets', () => {
    const expectedPresets = [
      'break_down',
      'action_steps',
      'research',
      'think_through',
      'whats_blocking',
      'expand',
      'stay_consistent',
      'approach',
    ];
    expectedPresets.forEach((preset) => {
      expect(PRESET_TO_TRIAGE[preset]).toBeDefined();
      expect(PRESET_TO_TRIAGE[preset].source).toBe('preset');
    });
  });
});

describe('triageMessage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('preset short-circuit', () => {
    it('returns preset result for entity chat with known preset', async () => {
      const result = await triageMessage({
        ...baseOptions,
        chatType: 'entity',
        preset: 'break_down',
      });

      expect(result).toEqual(PRESET_TO_TRIAGE.break_down);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does NOT short-circuit for space chat even with preset', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'emotional' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'none' }));

      const result = await triageMessage({
        ...baseOptions,
        chatType: 'space',
        preset: 'break_down',
      });

      expect(result.source).toBe('classifier');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does NOT short-circuit for unknown preset', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'exploratory' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'none' }));

      const result = await triageMessage({
        ...baseOptions,
        chatType: 'entity',
        preset: 'nonexistent_preset',
      });

      expect(result.source).toBe('classifier');
    });
  });

  describe('classifier mode', () => {
    it('makes two parallel API calls', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'emotional' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'required' }));

      const result = await triageMessage(baseOptions);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        mode: 'emotional',
        search: 'required',
        source: 'classifier',
      });
    });

    it('validates mode against allowed values', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'celebration' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'maybe' }));

      const result = await triageMessage(baseOptions);
      expect(result.mode).toBe('celebration');
      expect(result.search).toBe('maybe');
    });
  });

  describe('fallback behavior', () => {
    it('returns fallback values on network error', async () => {
      // callNano catches internally and returns null, so classifyMode/classifySearch
      // each fall back to defaults. Promise.all still resolves → source: 'classifier'
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await triageMessage(baseOptions);

      expect(result).toEqual({
        mode: 'exploratory',
        search: 'none',
        source: 'classifier',
      });
    });

    it('returns fallback mode for invalid mode from API', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'INVALID_MODE' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'none' }));

      const result = await triageMessage(baseOptions);

      // Invalid mode falls back to 'exploratory'
      expect(result.mode).toBe('exploratory');
      expect(result.search).toBe('none');
    });

    it('returns fallback search for invalid search from API', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'emotional' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'ALWAYS' }));

      const result = await triageMessage(baseOptions);

      expect(result.mode).toBe('emotional');
      // Invalid search falls back to 'none'
      expect(result.search).toBe('none');
    });
  });

  describe('context building', () => {
    it('includes space name in classifier input', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'exploratory' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'none' }));

      await triageMessage({
        ...baseOptions,
        spaceName: 'Work Projects',
      });

      // Verify the fetch body contains space context
      const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCallBody.messages[1].content).toContain('SPACE: Work Projects');
    });

    it('includes previous exchange in classifier input', async () => {
      mockFetch
        .mockResolvedValueOnce(mockNanoResponse({ mode: 'update' }))
        .mockResolvedValueOnce(mockNanoResponse({ search: 'none' }));

      await triageMessage({
        ...baseOptions,
        previousExchange: {
          userMsg: 'What should I do?',
          assistantMsg: 'Focus on the report first.',
        },
      });

      const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCallBody.messages[1].content).toContain('LAST EXCHANGE');
    });
  });
});
