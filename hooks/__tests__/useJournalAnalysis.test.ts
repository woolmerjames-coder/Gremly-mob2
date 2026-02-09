/**
 * useJournalAnalysis.test.ts
 *
 * Tests for the useJournalAnalysis hook.
 * Validates: AsyncStorage caching, 7-day cooldown enforcement,
 * loading/error states, calls callJournalAnalyze, cached-on-mount behavior.
 *
 * Hub V2 (Feb 2026)
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

// ═══════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════

const mockAsyncStorage: Record<string, string> = {};

// NOTE: We use plain arrow fns (not jest.fn with impl) so `resetMocks: true`
// doesn't strip the implementation between tests.  Call-tracking is done via
// jest.spyOn after import.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => Promise.resolve(mockAsyncStorage[key] ?? null),
  setItem: (key: string, value: string) => {
    mockAsyncStorage[key] = value;
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    delete mockAsyncStorage[key];
    return Promise.resolve();
  },
}));

const mockCallJournalAnalyze = jest.fn();
jest.mock('../../lib/cortex/CortexClient', () => ({
  callJournalAnalyze: (...args: any[]) => mockCallJournalAnalyze(...args),
}));

import { useJournalAnalysis } from '../useJournalAnalysis';

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS (mirror the hook's internal constants)
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = '@gremly/journal-analysis-cache';
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const sampleAnalysis = {
  themes: [{ label: 'Work', description: 'Work', mood_tendency: 'mixed', count: 3 }],
  patterns: [{ label: 'Routine', description: 'Routine', sentiment: 'positive' as const }],
  journaling_habits: {
    frequency: 'daily',
    preferred_time: 'evening' as const,
    avg_length: 'medium' as const,
    observation: 'Good habits',
  },
  suggestion: { text: 'Keep going', type: 'continue' as const },
};

const sampleEntries = [
  { date: '2026-02-01', body: 'Great day', mood: ['happy'] },
  { date: '2026-02-02', body: 'Stressed', mood: ['anxious'] },
];

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe('useJournalAnalysis', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear mock storage
    Object.keys(mockAsyncStorage).forEach((key) => delete mockAsyncStorage[key]);
  });

  describe('initial state', () => {
    it('starts with null analysis and not loading', () => {
      const { result } = renderHook(() => useJournalAnalysis());
      expect(result.current.analysis).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.onCooldown).toBe(false);
      expect(result.current.entryCount).toBe(0);
    });
  });

  describe('cache loading on mount', () => {
    it('loads cached analysis from AsyncStorage on mount', async () => {
      const cached = {
        analysis: sampleAnalysis,
        entryCount: 5,
        analyzedAt: new Date().toISOString(),
      };
      mockAsyncStorage[STORAGE_KEY] = JSON.stringify(cached);

      const { result } = renderHook(() => useJournalAnalysis());

      await waitFor(() => {
        expect(result.current.analysis).not.toBeNull();
      });

      expect(result.current.analysis).toEqual(sampleAnalysis);
      expect(result.current.entryCount).toBe(5);
    });

    it('sets cooldown state when cached analysis is recent', async () => {
      const cached = {
        analysis: sampleAnalysis,
        entryCount: 5,
        analyzedAt: new Date().toISOString(), // Just now = on cooldown
      };
      mockAsyncStorage[STORAGE_KEY] = JSON.stringify(cached);

      const { result } = renderHook(() => useJournalAnalysis());

      await waitFor(() => {
        expect(result.current.onCooldown).toBe(true);
      });

      expect(result.current.nextAvailableAt).not.toBeNull();
      expect(result.current.nextAvailableLabel).toMatch(/Available/);
    });

    it('does not set cooldown when cached analysis is older than 7 days', async () => {
      const oldDate = new Date(Date.now() - COOLDOWN_MS - 1000).toISOString();
      const cached = {
        analysis: sampleAnalysis,
        entryCount: 5,
        analyzedAt: oldDate,
      };
      mockAsyncStorage[STORAGE_KEY] = JSON.stringify(cached);

      const { result } = renderHook(() => useJournalAnalysis());

      await waitFor(() => {
        expect(result.current.analysis).not.toBeNull();
      });

      expect(result.current.onCooldown).toBe(false);
      expect(result.current.nextAvailableAt).toBeNull();
    });

    it('handles empty cache gracefully', async () => {
      // No cached data
      const { result } = renderHook(() => useJournalAnalysis());

      // Wait for the async mount effect to settle
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.analysis).toBeNull();
      expect(result.current.onCooldown).toBe(false);
    });
  });

  describe('analyze()', () => {
    it('calls callJournalAnalyze and updates state on success', async () => {
      mockCallJournalAnalyze.mockResolvedValue({
        ok: true,
        data: { analysis: sampleAnalysis, entry_count: 2, latency_ms: 300 },
      });

      const { result } = renderHook(() => useJournalAnalysis());

      await act(async () => {
        await result.current.analyze(sampleEntries, 'UTC');
      });

      expect(mockCallJournalAnalyze).toHaveBeenCalledWith(sampleEntries, 'UTC');
      expect(result.current.analysis).toEqual(sampleAnalysis);
      expect(result.current.entryCount).toBe(2);
      expect(result.current.loading).toBe(false);
    });

    it('caches the result in AsyncStorage after success', async () => {
      mockCallJournalAnalyze.mockResolvedValue({
        ok: true,
        data: { analysis: sampleAnalysis, entry_count: 2, latency_ms: 300 },
      });

      const { result } = renderHook(() => useJournalAnalysis());

      await act(async () => {
        await result.current.analyze(sampleEntries, 'UTC');
      });

      // Verify cache was written (our mock setItem stores into mockAsyncStorage)
      expect(mockAsyncStorage[STORAGE_KEY]).toBeDefined();
      expect(mockAsyncStorage[STORAGE_KEY]).toContain('"analysis"');
    });

    it('sets cooldown after successful analysis', async () => {
      mockCallJournalAnalyze.mockResolvedValue({
        ok: true,
        data: { analysis: sampleAnalysis, entry_count: 2, latency_ms: 300 },
      });

      const { result } = renderHook(() => useJournalAnalysis());

      await act(async () => {
        await result.current.analyze(sampleEntries, 'UTC');
      });

      expect(result.current.onCooldown).toBe(true);
      expect(result.current.nextAvailableAt).not.toBeNull();
    });

    it('sets error state when callJournalAnalyze returns ok:false', async () => {
      mockCallJournalAnalyze.mockResolvedValue({
        ok: false,
        error: 'Server error: 500',
      });

      const { result } = renderHook(() => useJournalAnalysis());

      await act(async () => {
        await result.current.analyze(sampleEntries, 'UTC');
      });

      expect(result.current.error).toBe('Server error: 500');
      expect(result.current.analysis).toBeNull();
    });

    it('sets error when no entries provided', async () => {
      const { result } = renderHook(() => useJournalAnalysis());

      await act(async () => {
        await result.current.analyze([], 'UTC');
      });

      expect(result.current.error).toMatch(/No journal entries/);
      expect(mockCallJournalAnalyze).not.toHaveBeenCalled();
    });

    it('catches exceptions and sets error state', async () => {
      mockCallJournalAnalyze.mockRejectedValue(new Error('Network fail'));

      const { result } = renderHook(() => useJournalAnalysis());

      await act(async () => {
        await result.current.analyze(sampleEntries, 'UTC');
      });

      expect(result.current.error).toBe('Network fail');
      expect(result.current.loading).toBe(false);
    });

    it('skips analysis when on cooldown', async () => {
      // Seed cache with recent analysis to trigger cooldown
      const cached = {
        analysis: sampleAnalysis,
        entryCount: 5,
        analyzedAt: new Date().toISOString(),
      };
      mockAsyncStorage[STORAGE_KEY] = JSON.stringify(cached);

      const { result } = renderHook(() => useJournalAnalysis());

      await waitFor(() => {
        expect(result.current.onCooldown).toBe(true);
      });

      await act(async () => {
        await result.current.analyze(sampleEntries, 'UTC');
      });

      expect(mockCallJournalAnalyze).not.toHaveBeenCalled();
    });
  });
});
