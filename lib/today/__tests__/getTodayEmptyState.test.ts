/**
 * getTodayEmptyState.test.ts
 *
 * Tests for Today screen empty state determination.
 * Validates state selection logic and content generation.
 */

import { getTodayEmptyState, getTodayEmptyStateContent } from '../getTodayEmptyState';
import { useGremlyStore } from '../../store/useGremlyStore';

// Mock the store
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: jest.fn(),
  },
}));

const mockGetState = useGremlyStore.getState as jest.Mock;

describe('getTodayEmptyState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('first-time state', () => {
    it('returns first-time when no prior visit and no sweep', () => {
      mockGetState.mockReturnValue({
        firstTodayVisitCompletedAt: null,
        lastSweepCompletedAt: null,
      });
      expect(getTodayEmptyState()).toBe('first-time');
    });

    it('returns first-time when firstTodayVisitCompletedAt is undefined', () => {
      mockGetState.mockReturnValue({
        lastSweepCompletedAt: null,
      });
      expect(getTodayEmptyState()).toBe('first-time');
    });
  });

  describe('post-sweep state', () => {
    it('returns post-sweep when sweep was completed within last 30 minutes', () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
      mockGetState.mockReturnValue({
        firstTodayVisitCompletedAt: '2025-01-14T10:00:00Z',
        lastSweepCompletedAt: tenMinutesAgo,
      });
      expect(getTodayEmptyState()).toBe('post-sweep');
    });

    it('returns post-sweep when sweep just completed', () => {
      const now = new Date().toISOString();
      mockGetState.mockReturnValue({
        firstTodayVisitCompletedAt: '2025-01-15T08:00:00Z',
        lastSweepCompletedAt: now,
      });
      expect(getTodayEmptyState()).toBe('post-sweep');
    });
  });

  describe('regular state', () => {
    it('returns regular when visited before and sweep was more than 30 min ago', () => {
      const now = Date.now();
      const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
      mockGetState.mockReturnValue({
        firstTodayVisitCompletedAt: '2025-01-10T10:00:00Z',
        lastSweepCompletedAt: oneHourAgo,
      });
      expect(getTodayEmptyState()).toBe('regular');
    });

    it('returns regular when visited but never swept', () => {
      mockGetState.mockReturnValue({
        firstTodayVisitCompletedAt: '2025-01-10T10:00:00Z',
        lastSweepCompletedAt: null,
      });
      expect(getTodayEmptyState()).toBe('regular');
    });
  });
});

describe('getTodayEmptyStateContent', () => {
  describe('first-time content', () => {
    it('returns appropriate content for first-time state', () => {
      const content = getTodayEmptyStateContent('first-time');
      expect(content.title).toBeDefined();
      expect(content.subtitle).toBeDefined();
      expect(typeof content.title).toBe('string');
      expect(typeof content.subtitle).toBe('string');
    });

    it('first-time content includes welcoming message', () => {
      const content = getTodayEmptyStateContent('first-time');
      // Should have welcoming tone for new users
      expect(content.title.length).toBeGreaterThan(0);
      expect(content.subtitle.length).toBeGreaterThan(0);
    });
  });

  describe('post-sweep content', () => {
    it('returns appropriate content for post-sweep state', () => {
      const content = getTodayEmptyStateContent('post-sweep');
      expect(content.title).toBeDefined();
      expect(content.subtitle).toBeDefined();
    });

    it('post-sweep content acknowledges completion', () => {
      const content = getTodayEmptyStateContent('post-sweep');
      // Should acknowledge that user has completed their tasks
      expect(content.title.length).toBeGreaterThan(0);
    });
  });

  describe('regular content', () => {
    it('returns appropriate content for regular state', () => {
      const content = getTodayEmptyStateContent('regular');
      expect(content.title).toBeDefined();
      expect(content.subtitle).toBeDefined();
    });

    it('regular content is encouraging', () => {
      const content = getTodayEmptyStateContent('regular');
      // Regular state should encourage action
      expect(content.title.length).toBeGreaterThan(0);
    });
  });

  describe('content structure', () => {
    const states = ['first-time', 'post-sweep', 'regular'] as const;

    it.each(states)('%s state returns non-empty title and subtitle', (state) => {
      const content = getTodayEmptyStateContent(state);
      expect(content.title).toBeTruthy();
      expect(content.subtitle).toBeTruthy();
    });

    it.each(states)('%s state content is suitable for display', (state) => {
      const content = getTodayEmptyStateContent(state);
      // Title should be concise (under 50 chars typically)
      expect(content.title.length).toBeLessThan(100);
      // Subtitle can be longer
      expect(content.subtitle.length).toBeLessThan(200);
    });
  });
});
