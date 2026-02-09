/**
 * callJournalAnalyze.test.ts
 *
 * Tests for the callJournalAnalyze function in CortexClient.
 * Validates: AI-disabled guard, missing config guard, 30s timeout,
 * body truncation at 500 chars, request shape, error handling.
 *
 * Hub V2 (Feb 2026)
 */

// Save original env
const originalEnv = { ...process.env };

// Mock fetch globally
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// We need to test the exported function, so we configure env before import
beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  // Provide a valid CORTEX_URL and disable AI disabled flag
  process.env.EXPO_PUBLIC_CORTEX_URL = 'https://cortex.test/api';
  process.env.EXPO_PUBLIC_DISABLE_AI = '';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('callJournalAnalyze', () => {
  function getModule() {
    // Re-require to pick up fresh env
    return require('../CortexClient') as typeof import('../CortexClient');
  }

  const sampleEntries = [
    { date: '2026-02-01', body: 'Had a great day at work', mood: ['happy'] },
    { date: '2026-02-02', body: 'Feeling stressed about deadlines', mood: ['anxious'] },
  ];

  const sampleResponse = {
    analysis: {
      themes: [{ label: 'Work', description: 'Work related', mood_tendency: 'mixed', count: 2 }],
      patterns: [{ label: 'Routine', description: 'Regular journaling', sentiment: 'positive' as const }],
      journaling_habits: {
        frequency: 'daily',
        preferred_time: 'evening' as const,
        avg_length: 'medium' as const,
        observation: 'Consistent journaling habit',
      },
      suggestion: { text: 'Keep it up!', type: 'continue' as const },
    },
    entry_count: 2,
    latency_ms: 450,
  };

  describe('guard clauses', () => {
    it('returns error when CORTEX_URL is missing', async () => {
      process.env.EXPO_PUBLIC_CORTEX_URL = '';
      const { callJournalAnalyze } = getModule();
      const result = await callJournalAnalyze(sampleEntries, 'UTC');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Missing/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns error when AI is disabled', async () => {
      process.env.EXPO_PUBLIC_DISABLE_AI = 'on';
      const { callJournalAnalyze } = getModule();
      const result = await callJournalAnalyze(sampleEntries, 'UTC');
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/disabled/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('request shape', () => {
    it('sends POST with type "journal-analyze"', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      const { callJournalAnalyze } = getModule();
      await callJournalAnalyze(sampleEntries, 'America/New_York');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://cortex.test/api');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.type).toBe('journal-analyze');
      expect(body.timezone).toBe('America/New_York');
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0].date).toBe('2026-02-01');
    });

    it('caps per-entry body at 500 chars', async () => {
      const longBody = 'x'.repeat(600);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      const { callJournalAnalyze } = getModule();
      await callJournalAnalyze(
        [{ date: '2026-02-01', body: longBody, mood: [] }],
        'UTC',
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.entries[0].body.length).toBe(500);
    });

    it('includes authorization headers when anon key is set', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      const { callJournalAnalyze } = getModule();
      await callJournalAnalyze(sampleEntries, 'UTC');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-anon-key');
      expect(headers.apikey).toBe('test-anon-key');
    });

    it('uses AbortController for timeout signal', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      const { callJournalAnalyze } = getModule();
      await callJournalAnalyze(sampleEntries, 'UTC');

      const options = mockFetch.mock.calls[0][1];
      expect(options.signal).toBeDefined();
    });
  });

  describe('success response', () => {
    it('returns ok:true with analysis data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      });

      const { callJournalAnalyze } = getModule();
      const result = await callJournalAnalyze(sampleEntries, 'UTC');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.analysis.themes).toHaveLength(1);
        expect(result.data.entry_count).toBe(2);
      }
    });
  });

  describe('error handling', () => {
    it('returns error on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const { callJournalAnalyze } = getModule();
      const result = await callJournalAnalyze(sampleEntries, 'UTC');

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/500/);
    });

    it('returns error when response contains error field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'Rate limited' }),
      });

      const { callJournalAnalyze } = getModule();
      const result = await callJournalAnalyze(sampleEntries, 'UTC');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Rate limited');
    });

    it('returns timeout error when request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));

      const { callJournalAnalyze } = getModule();
      const result = await callJournalAnalyze(sampleEntries, 'UTC');

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/timed out/i);
    });

    it('returns generic error for unknown exceptions', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'));

      const { callJournalAnalyze } = getModule();
      const result = await callJournalAnalyze(sampleEntries, 'UTC');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network failure');
    });
  });
});
