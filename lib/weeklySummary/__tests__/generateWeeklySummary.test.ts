/**
 * Tests for lib/weeklySummary/generateWeeklySummary.ts
 *
 * Tests the orchestrator that:
 * 1. Builds the payload from the store
 * 2. Calls the Cortex Worker
 * 3. Validates the response
 * 4. Saves the summary to the store
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockBuildPayload = jest.fn();
jest.mock('../buildWeeklySummaryPayload', () => ({
  buildWeeklySummaryPayload: (...args: any[]) => mockBuildPayload(...args),
}));

const mockBuildTrendContext = jest.fn();
jest.mock('../buildTrendContext', () => ({
  buildTrendContext: (...args: any[]) => mockBuildTrendContext(...args),
}));

const mockSaveWeeklySummary = jest.fn();
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => ({
      saveWeeklySummary: mockSaveWeeklySummary,
    }),
  },
}));

jest.mock('../../env', () => ({
  env: { cortexUrl: 'https://test-worker.example.com' },
}));

const MOCK_TODAY = '2025-12-15'; // Monday
jest.mock('../../date', () => ({
  getDateService: () => ({
    getCurrentDate: () => MOCK_TODAY,
    fromDateString: (str: string) => (str ? new Date(str + 'T00:00:00') : null),
    addDays: (dateStr: string, days: number) => {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    },
  }),
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { generateWeeklySummary } from '../generateWeeklySummary';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeValidPayload() {
  return {
    userId: 'user-1',
    stats: {
      todosCompleted: 5,
      habitsTracked: { Meditate: { targetDays: 7, completedDays: [true, true, false] } },
    },
  };
}

function makeValidContent() {
  return {
    weeklyCommentary: 'Great week!',
    highlightMoment: { title: 'Test', reason: 'Notable', gremlyComment: 'Nice!' },
    insights: [],
    weekAhead: { introduction: 'Next week...', highlights: [], busyDayWarnings: [], totalEventCount: 0 },
    keyThemes: ['productive'],
    mood: 'focused',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildPayload.mockResolvedValue(makeValidPayload());
  mockBuildTrendContext.mockReturnValue(null);
  mockSaveWeeklySummary.mockResolvedValue({ id: 'summary-1' });
});

describe('generateWeeklySummary', () => {
  // ── Payload phase ─────────────────────────────────────────────────────

  it('returns error when store is not initialized (payload is null)', async () => {
    mockBuildPayload.mockResolvedValue(null);

    const result = await generateWeeklySummary();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not initialized');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── Worker call ───────────────────────────────────────────────────────

  it('calls the Cortex Worker with correct payload shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeValidContent(),
    });

    await generateWeeklySummary();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test-worker.example.com');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.type).toBe('weekly-summary');
    expect(body.payload.userId).toBe('user-1');
  });

  it('includes trend context when available', async () => {
    const trendCtx = { priorWeek: { mood: 'stressed' } };
    mockBuildTrendContext.mockReturnValue(trendCtx);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeValidContent(),
    });

    await generateWeeklySummary();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.trendContext).toEqual(trendCtx);
  });

  // ── Error handling ────────────────────────────────────────────────────

  it('returns error on non-OK HTTP response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const result = await generateWeeklySummary();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Worker returned 500');
  });

  it('returns error when worker responds with error field', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'Rate limited', detail: 'Too many requests' }),
    });

    const result = await generateWeeklySummary();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
  });

  it('returns error on invalid response shape (missing weeklyCommentary)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ highlightMoment: { title: 'Test' } }),
    });

    const result = await generateWeeklySummary();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid response shape');
  });

  it('returns error on invalid response shape (missing highlightMoment)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ weeklyCommentary: 'Great week' }),
    });

    const result = await generateWeeklySummary();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid response shape');
  });

  it('handles fetch exceptions gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network timeout'));

    const result = await generateWeeklySummary();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network timeout');
  });

  // ── Success path ──────────────────────────────────────────────────────

  it('saves summary to store on success', async () => {
    const content = makeValidContent();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => content,
    });

    await generateWeeklySummary();

    expect(mockSaveWeeklySummary).toHaveBeenCalledTimes(1);
    const saved = mockSaveWeeklySummary.mock.calls[0][0];
    expect(saved.user_id).toBe('user-1');
    expect(saved.content).toEqual(content);
    expect(saved.key_themes).toEqual(['productive']);
    expect(saved.viewed).toBe(false);
  });

  it('computes correct week boundaries (Monday to Sunday)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeValidContent(),
    });

    await generateWeeklySummary();

    const saved = mockSaveWeeklySummary.mock.calls[0][0];
    // MOCK_TODAY = 2025-12-15 (Monday)
    expect(saved.week_start_date).toBe('2025-12-15');
    expect(saved.week_end_date).toBe('2025-12-21');
  });

  it('returns the saved summary on success', async () => {
    const savedSummary = { id: 'summary-42', week_start_date: '2025-12-15' };
    mockSaveWeeklySummary.mockResolvedValue(savedSummary);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeValidContent(),
    });

    const result = await generateWeeklySummary();

    expect(result.success).toBe(true);
    expect(result.summary).toEqual(savedSummary);
  });

  it('includes stats_snapshot from payload in saved summary', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => makeValidContent(),
    });

    await generateWeeklySummary();

    const saved = mockSaveWeeklySummary.mock.calls[0][0];
    expect(saved.stats_snapshot.todosCompleted).toBe(5);
  });

  // ── Edge: missing cortexUrl ───────────────────────────────────────────

  it('returns error when cortexUrl is missing', async () => {
    // Re-mock env with empty cortexUrl
    jest.resetModules();
    jest.doMock('../../env', () => ({ env: { cortexUrl: '' } }));
    jest.doMock('../buildWeeklySummaryPayload', () => ({
      buildWeeklySummaryPayload: () => Promise.resolve(makeValidPayload()),
    }));
    jest.doMock('../buildTrendContext', () => ({
      buildTrendContext: () => null,
    }));
    jest.doMock('../../store/useGremlyStore', () => ({
      useGremlyStore: { getState: () => ({ saveWeeklySummary: jest.fn() }) },
    }));
    jest.doMock('../../date', () => ({
      getDateService: () => ({
        getCurrentDate: () => MOCK_TODAY,
        fromDateString: (s: string) => new Date(s + 'T00:00:00'),
        addDays: (d: string, n: number) => {
          const dt = new Date(d + 'T00:00:00');
          dt.setDate(dt.getDate() + n);
          return dt.toISOString().slice(0, 10);
        },
      }),
    }));

    const { generateWeeklySummary: gen } = require('../generateWeeklySummary');
    const result = await gen();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cortex URL not configured');
  });
});
