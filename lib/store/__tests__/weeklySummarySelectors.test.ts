/**
 * Tests for weekly summary selectors in lib/store/selectors.ts
 *
 * Tests selectCurrentWeekSummary, selectPastSummaries,
 * selectShouldShowSummaryBanner, and selectWeeklySummaryForChatContext.
 */

import type { WeeklySummary, WeeklySummaryContent } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock('../../date', () => ({
  getDateService: () => ({
    getCurrentDate: () => '2025-12-15', // Monday
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

function makeContent(overrides: Partial<WeeklySummaryContent> = {}): WeeklySummaryContent {
  return {
    weeklyCommentary: 'Good week overall.',
    highlightMoment: { title: 'Big Win', reason: 'Completed project', gremlyComment: 'Amazing!' },
    insights: [
      {
        type: 'productivity_pattern',
        headline: 'Morning person',
        body: 'You do best in AM',
        isActionable: false,
      },
    ],
    weekAhead: {
      introduction: 'Next week looks busy',
      highlights: [{ eventTitle: 'Meeting', day: 'Monday', time: '9:00 AM' }],
      busyDayWarnings: [],
      totalEventCount: 3,
    },
    keyThemes: ['focus', 'deep work'],
    mood: 'motivated',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<WeeklySummary> = {}): WeeklySummary {
  return {
    id: `summary-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    week_start_date: '2025-12-15',
    week_end_date: '2025-12-21',
    generated_at: '2025-12-15T18:00:00Z',
    content: makeContent(),
    stats_snapshot: {},
    trend_context: null,
    key_themes: ['focus'],
    cleanup_actions: [],
    viewed: false,
    viewed_at: null,
    completed_flow: false,
    banner_dismissed: false,
    created_at: '2025-12-15T18:00:00Z',
    updated_at: '2025-12-15T18:00:00Z',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeState(overrides: Record<string, any> = {}): any {
  return {
    weeklySummaries: [],
    weeklySummaryLoading: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('weekly summary selectors', () => {
  let selectCurrentWeekSummary: (state: ReturnType<typeof makeState>) => WeeklySummary | undefined;
  let selectPastSummaries: (state: ReturnType<typeof makeState>) => WeeklySummary[];
  let selectShouldShowSummaryBanner: (state: ReturnType<typeof makeState>) => boolean;
  let selectSummaryByWeek: (
    state: ReturnType<typeof makeState>,
    weekStartDate: string,
  ) => WeeklySummary | undefined;
  let selectWeeklySummaryForChatContext: (state: ReturnType<typeof makeState>) => string | null;

  beforeEach(() => {
    jest.clearAllMocks();
    // Import selectors fresh each test to pick up the mocked date service
    ({
      selectCurrentWeekSummary,
      selectPastSummaries,
      selectShouldShowSummaryBanner,
      selectSummaryByWeek,
      selectWeeklySummaryForChatContext,
    } = require('../selectors'));
  });

  // ── selectCurrentWeekSummary ─────────────────────────────────────────────

  describe('selectCurrentWeekSummary', () => {
    it('returns undefined when no summaries exist', () => {
      const state = makeState({ weeklySummaries: [] });
      expect(selectCurrentWeekSummary(state)).toBeUndefined();
    });

    it('returns summary matching current Monday', () => {
      const current = makeSummary({ week_start_date: '2025-12-15' });
      const state = makeState({ weeklySummaries: [current] });
      expect(selectCurrentWeekSummary(state)).toBe(current);
    });

    it('ignores summaries from other weeks', () => {
      const old = makeSummary({ week_start_date: '2025-12-08' });
      const state = makeState({ weeklySummaries: [old] });
      expect(selectCurrentWeekSummary(state)).toBeUndefined();
    });

    it('returns correct summary when multiple exist', () => {
      const current = makeSummary({ id: 'current', week_start_date: '2025-12-15' });
      const old = makeSummary({ id: 'old', week_start_date: '2025-12-08' });
      const state = makeState({ weeklySummaries: [old, current] });
      expect(selectCurrentWeekSummary(state)!.id).toBe('current');
    });
  });

  // ── selectPastSummaries ──────────────────────────────────────────────────

  describe('selectPastSummaries', () => {
    it('returns empty array when no summaries exist', () => {
      const state = makeState({ weeklySummaries: [] });
      expect(selectPastSummaries(state)).toEqual([]);
    });

    it('returns all summaries including current week (alias for selectAllSummaries)', () => {
      const current = makeSummary({ week_start_date: '2025-12-15' });
      const past = makeSummary({ week_start_date: '2025-12-08' });
      const state = makeState({ weeklySummaries: [current, past] });
      const result = selectPastSummaries(state);
      expect(result).toHaveLength(2);
      // Sorted newest first
      expect(result[0].week_start_date).toBe('2025-12-15');
      expect(result[1].week_start_date).toBe('2025-12-08');
    });

    it('returns all summaries sorted newest first', () => {
      const summaries = [
        makeSummary({ week_start_date: '2025-12-15' }),
        makeSummary({ week_start_date: '2025-12-08' }),
        makeSummary({ week_start_date: '2025-12-01' }),
        makeSummary({ week_start_date: '2025-11-24' }),
      ];
      const state = makeState({ weeklySummaries: summaries });
      const result = selectPastSummaries(state);
      expect(result).toHaveLength(4);
      expect(result[0].week_start_date).toBe('2025-12-15');
      expect(result[3].week_start_date).toBe('2025-11-24');
    });
  });

  // ── selectShouldShowSummaryBanner ────────────────────────────────────────

  describe('selectShouldShowSummaryBanner', () => {
    it('returns false when no current summary exists', () => {
      const state = makeState({ weeklySummaries: [] });
      expect(selectShouldShowSummaryBanner(state)).toBe(false);
    });

    it('returns true when summary exists, unviewed, and not dismissed', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({ week_start_date: '2025-12-15', viewed: false, banner_dismissed: false }),
        ],
      });
      expect(selectShouldShowSummaryBanner(state)).toBe(true);
    });

    it('returns false when summary has been viewed', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({ week_start_date: '2025-12-15', viewed: true, banner_dismissed: false }),
        ],
      });
      expect(selectShouldShowSummaryBanner(state)).toBe(false);
    });

    it('returns false when banner has been dismissed', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({ week_start_date: '2025-12-15', viewed: false, banner_dismissed: true }),
        ],
      });
      expect(selectShouldShowSummaryBanner(state)).toBe(false);
    });

    it('returns false for past week summaries even if unviewed', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({ week_start_date: '2025-12-08', viewed: false, banner_dismissed: false }),
        ],
      });
      expect(selectShouldShowSummaryBanner(state)).toBe(false);
    });
  });

  // ── selectSummaryByWeek ──────────────────────────────────────────────────

  describe('selectSummaryByWeek', () => {
    it('finds summary by week_start_date', () => {
      const target = makeSummary({ id: 'target', week_start_date: '2025-12-08' });
      const other = makeSummary({ id: 'other', week_start_date: '2025-12-15' });
      const state = makeState({ weeklySummaries: [target, other] });
      expect(selectSummaryByWeek(state, '2025-12-08')!.id).toBe('target');
    });

    it('returns undefined when no match', () => {
      const state = makeState({
        weeklySummaries: [makeSummary({ week_start_date: '2025-12-15' })],
      });
      expect(selectSummaryByWeek(state, '2025-11-01')).toBeUndefined();
    });
  });

  // ── selectWeeklySummaryForChatContext ─────────────────────────────────────

  describe('selectWeeklySummaryForChatContext', () => {
    it('returns null when no current summary exists', () => {
      const state = makeState({ weeklySummaries: [] });
      expect(selectWeeklySummaryForChatContext(state)).toBeNull();
    });

    it('returns null when summary has no content', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({
            week_start_date: '2025-12-15',
            content: null as unknown as WeeklySummaryContent,
          }),
        ],
      });
      expect(selectWeeklySummaryForChatContext(state)).toBeNull();
    });

    it('includes weekly commentary in context string', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({
            week_start_date: '2025-12-15',
            content: makeContent({ weeklyCommentary: 'Productive week!' }),
          }),
        ],
      });
      const result = selectWeeklySummaryForChatContext(state);
      expect(result).toContain('Productive week!');
    });

    it('includes highlight moment', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({
            week_start_date: '2025-12-15',
            content: makeContent({
              highlightMoment: {
                title: 'Shipped v2',
                reason: 'Major release',
                gremlyComment: 'Wow!',
              },
            }),
          }),
        ],
      });
      const result = selectWeeklySummaryForChatContext(state);
      expect(result).toContain('Shipped v2');
      expect(result).toContain('Major release');
    });

    it('includes insight headlines', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({
            week_start_date: '2025-12-15',
            content: makeContent({
              insights: [
                {
                  type: 'productivity_pattern',
                  headline: 'You complete 3x more tasks before noon',
                  body: '',
                  isActionable: false,
                },
              ],
            }),
          }),
        ],
      });
      const result = selectWeeklySummaryForChatContext(state);
      expect(result).toContain('You complete 3x more tasks before noon');
    });

    it('includes key themes', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({
            week_start_date: '2025-12-15',
            content: makeContent({ keyThemes: ['deep work', 'balance', 'focus'] }),
          }),
        ],
      });
      const result = selectWeeklySummaryForChatContext(state);
      expect(result).toContain('deep work');
      expect(result).toContain('balance');
      expect(result).toContain('focus');
    });

    it('includes week ahead highlights', () => {
      const state = makeState({
        weeklySummaries: [
          makeSummary({
            week_start_date: '2025-12-15',
            content: makeContent({
              weekAhead: {
                introduction: 'Busy week',
                highlights: [{ eventTitle: 'Team Retreat', day: 'Wednesday' }],
                busyDayWarnings: [],
                totalEventCount: 5,
              },
            }),
          }),
        ],
      });
      const result = selectWeeklySummaryForChatContext(state);
      expect(result).toContain('Team Retreat');
      expect(result).toContain('Wednesday');
    });
  });
});
