/**
 * Tests for lib/weeklySummary/buildTrendContext.ts
 *
 * Tests the trend analysis logic that compares prior weekly summaries
 * to determine rolling trends (completion, habits, capture ratio, etc.).
 */

import type { TrendContext } from '../buildTrendContext';
import type { WeeklySummary } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockGetState = jest.fn();
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockGetState(),
  },
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSummary(overrides: Partial<WeeklySummary> = {}): WeeklySummary {
  return {
    id: `summary-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    week_start_date: '2025-12-08',
    week_end_date: '2025-12-14',
    generated_at: '2025-12-14T20:00:00Z',
    content: {
      weeklyCommentary: 'Good week!',
      highlightMoment: { title: 'Highlight', reason: 'Because', gremlyComment: 'Nice!' },
      insights: [],
      weekAhead: {
        introduction: 'Next week...',
        highlights: [],
        busyDayWarnings: [],
        totalEventCount: 0,
      },
      keyThemes: ['productivity'],
      mood: 'positive',
    },
    stats_snapshot: {
      todosCompleted: 5,
      journalEntries: 2,
      mindDropsSwept: 8,
      mindDropsCreated: 10,
    },
    trend_context: null,
    key_themes: ['productivity'],
    cleanup_actions: [],
    viewed: true,
    viewed_at: '2025-12-14T21:00:00Z',
    completed_flow: true,
    banner_dismissed: false,
    created_at: '2025-12-14T20:00:00Z',
    updated_at: '2025-12-14T20:00:00Z',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildTrendContext', () => {
  let buildTrendContext: () => TrendContext | null;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ buildTrendContext } = require('../buildTrendContext'));
  });

  // ── Null returns ─────────────────────────────────────────────────────────

  it('returns null when no prior summaries exist', () => {
    mockGetState.mockReturnValue({ weeklySummaries: [] });
    expect(buildTrendContext()).toBeNull();
  });

  it('returns null when only current week summary exists', () => {
    // Current Monday = 2025-12-15, so a summary with that week_start_date is current
    mockGetState.mockReturnValue({
      weeklySummaries: [makeSummary({ week_start_date: '2025-12-15' })],
    });
    expect(buildTrendContext()).toBeNull();
  });

  // ── Prior week highlights ────────────────────────────────────────────────

  it('returns prior week highlights from past summaries', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({ week_start_date: '2025-12-08', key_themes: ['focus'] }),
        makeSummary({ week_start_date: '2025-12-01', key_themes: ['planning'] }),
      ],
    });
    const result = buildTrendContext();
    expect(result).not.toBeNull();
    expect(result!.priorWeekHighlights).toHaveLength(2);
    expect(result!.priorWeekHighlights[0].weekStart).toBe('2025-12-08');
  });

  it('limits prior weeks to 4', () => {
    const summaries = Array.from({ length: 6 }, (_, i) =>
      makeSummary({ week_start_date: `2025-${String(11 - i).padStart(2, '0')}-01` }),
    );
    mockGetState.mockReturnValue({ weeklySummaries: summaries });
    const result = buildTrendContext();
    expect(result!.priorWeekHighlights).toHaveLength(4);
  });

  it('extracts key themes from content when available', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-12-08',
          content: {
            weeklyCommentary: 'Great!',
            highlightMoment: { title: 'H', reason: 'R', gremlyComment: 'G' },
            insights: [],
            weekAhead: {
              introduction: '',
              highlights: [],
              busyDayWarnings: [],
              totalEventCount: 0,
            },
            keyThemes: ['deep work', 'balance'],
            mood: 'positive',
          },
          key_themes: ['fallback theme'],
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.priorWeekHighlights[0].keyThemes).toEqual(['deep work', 'balance']);
  });

  it('falls back to top-level key_themes when content themes empty', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-12-08',
          content: {
            weeklyCommentary: 'Great!',
            highlightMoment: { title: 'H', reason: 'R', gremlyComment: 'G' },
            insights: [],
            weekAhead: {
              introduction: '',
              highlights: [],
              busyDayWarnings: [],
              totalEventCount: 0,
            },
            keyThemes: [],
            mood: 'positive',
          },
          key_themes: ['fallback theme'],
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.priorWeekHighlights[0].keyThemes).toEqual(['fallback theme']);
  });

  // ── Cleanup action counts ────────────────────────────────────────────────

  it('tallies cleanup actions by type', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-12-08',
          cleanup_actions: [
            { itemId: '1', action: 'keep', actedAt: '2025-12-14T10:00:00Z' },
            { itemId: '2', action: 'keep', actedAt: '2025-12-14T10:00:00Z' },
            { itemId: '3', action: 'park', actedAt: '2025-12-14T10:00:00Z' },
            { itemId: '4', action: 'drop', actedAt: '2025-12-14T10:00:00Z' },
          ],
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.priorWeekHighlights[0].cleanupActions).toEqual({
      kept: 2,
      parked: 1,
      dropped: 1,
    });
  });

  // ── Rolling trends ───────────────────────────────────────────────────────

  it('detects increasing completion trend', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-11-24',
          stats_snapshot: { todosCompleted: 3, journalEntries: 1, mindDropsSwept: 5 },
        }),
        makeSummary({
          week_start_date: '2025-12-01',
          stats_snapshot: { todosCompleted: 5, journalEntries: 2, mindDropsSwept: 8 },
        }),
        makeSummary({
          week_start_date: '2025-12-08',
          stats_snapshot: { todosCompleted: 8, journalEntries: 3, mindDropsSwept: 12 },
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.rollingTrends.completionTrend).toBe('increasing');
  });

  it('detects declining completion trend', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-11-24',
          stats_snapshot: { todosCompleted: 10, journalEntries: 3, mindDropsSwept: 12 },
        }),
        makeSummary({
          week_start_date: '2025-12-01',
          stats_snapshot: { todosCompleted: 7, journalEntries: 2, mindDropsSwept: 8 },
        }),
        makeSummary({
          week_start_date: '2025-12-08',
          stats_snapshot: { todosCompleted: 3, journalEntries: 1, mindDropsSwept: 5 },
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.rollingTrends.completionTrend).toBe('declining');
  });

  it('detects stable completion trend', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-11-24',
          stats_snapshot: { todosCompleted: 5, journalEntries: 2, mindDropsSwept: 8 },
        }),
        makeSummary({
          week_start_date: '2025-12-01',
          stats_snapshot: { todosCompleted: 5, journalEntries: 2, mindDropsSwept: 8 },
        }),
        makeSummary({
          week_start_date: '2025-12-08',
          stats_snapshot: { todosCompleted: 5, journalEntries: 2, mindDropsSwept: 8 },
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.rollingTrends.completionTrend).toBe('stable');
  });

  it('detects widening capture-to-sweep gap', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-11-24',
          stats_snapshot: {
            todosCompleted: 5,
            journalEntries: 1,
            mindDropsSwept: 10,
            mindDropsCreated: 10,
          },
        }),
        makeSummary({
          week_start_date: '2025-12-01',
          stats_snapshot: {
            todosCompleted: 5,
            journalEntries: 1,
            mindDropsSwept: 8,
            mindDropsCreated: 12,
          },
        }),
        makeSummary({
          week_start_date: '2025-12-08',
          stats_snapshot: {
            todosCompleted: 5,
            journalEntries: 1,
            mindDropsSwept: 5,
            mindDropsCreated: 15,
          },
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.rollingTrends.captureToSweepTrend).toBe('widening');
  });

  // ── Insight frequency ────────────────────────────────────────────────────

  it('tallies insight type frequencies across weeks', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-12-01',
          content: {
            weeklyCommentary: 'W1',
            highlightMoment: { title: 'H', reason: 'R', gremlyComment: 'G' },
            insights: [
              { type: 'stale_cleanup', headline: 'H', body: 'B', isActionable: true },
              { type: 'balance', headline: 'H', body: 'B', isActionable: false },
            ],
            weekAhead: {
              introduction: '',
              highlights: [],
              busyDayWarnings: [],
              totalEventCount: 0,
            },
            keyThemes: [],
            mood: 'neutral',
          },
        }),
        makeSummary({
          week_start_date: '2025-12-08',
          content: {
            weeklyCommentary: 'W2',
            highlightMoment: { title: 'H', reason: 'R', gremlyComment: 'G' },
            insights: [
              { type: 'stale_cleanup', headline: 'H', body: 'B', isActionable: true },
              { type: 'productivity_pattern', headline: 'H', body: 'B', isActionable: false },
            ],
            weekAhead: {
              introduction: '',
              highlights: [],
              busyDayWarnings: [],
              totalEventCount: 0,
            },
            keyThemes: [],
            mood: 'neutral',
          },
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.rollingTrends.insightFrequency).toEqual({
      stale_cleanup: 2,
      balance: 1,
      productivity_pattern: 1,
    });
  });

  // ── Stats snapshot extraction ────────────────────────────────────────────

  it('safely reads stats from loose JSONB snapshot', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-12-08',
          stats_snapshot: {
            todosCompleted: 7,
            journalEntries: 'invalid', // wrong type
            mindDropsSwept: null, // null
            // missing other keys
          } as unknown as Record<string, unknown>,
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.priorWeekHighlights[0].statsSnapshot).toEqual({
      todosCompleted: 7,
      journalEntries: 0, // falls back to 0
      mindDropsSwept: 0, // falls back to 0
    });
  });

  // ── Single week ──────────────────────────────────────────────────────────

  it('returns stable trends with only one prior week', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [makeSummary({ week_start_date: '2025-12-08' })],
    });
    const result = buildTrendContext();
    expect(result).not.toBeNull();
    expect(result!.rollingTrends.completionTrend).toBe('stable');
    expect(result!.rollingTrends.habitConsistencyTrend).toBe('stable');
    expect(result!.rollingTrends.captureToSweepTrend).toBe('stable');
  });

  // ── Newer insight types ──────────────────────────────────────────────────

  it('tallies life_event and week_rhythm insight types in frequency map', () => {
    mockGetState.mockReturnValue({
      weeklySummaries: [
        makeSummary({
          week_start_date: '2025-12-01',
          content: {
            weeklyCommentary: 'W1',
            highlightMoment: { title: 'H', reason: 'R', gremlyComment: 'G' },
            insights: [
              { type: 'life_event', headline: 'Birthday week', body: 'Celebrations', isActionable: false },
              { type: 'week_rhythm', headline: 'Slow start', body: 'Energy built through the week', isActionable: false },
            ],
            weekAhead: {
              introduction: '',
              highlights: [],
              busyDayWarnings: [],
              totalEventCount: 0,
            },
            keyThemes: [],
            mood: 'neutral',
          },
        }),
        makeSummary({
          week_start_date: '2025-12-08',
          content: {
            weeklyCommentary: 'W2',
            highlightMoment: { title: 'H', reason: 'R', gremlyComment: 'G' },
            insights: [
              { type: 'life_event', headline: 'Travel week', body: 'On the road', isActionable: false },
              { type: 'stale_cleanup', headline: 'H', body: 'B', isActionable: true },
            ],
            weekAhead: {
              introduction: '',
              highlights: [],
              busyDayWarnings: [],
              totalEventCount: 0,
            },
            keyThemes: [],
            mood: 'neutral',
          },
        }),
      ],
    });
    const result = buildTrendContext();
    expect(result!.rollingTrends.insightFrequency).toEqual({
      life_event: 2,
      week_rhythm: 1,
      stale_cleanup: 1,
    });
  });
});
