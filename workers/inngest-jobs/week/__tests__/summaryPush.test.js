/**
 * @jest-environment node
 */
import {
  REVIEW_UNREAD,
  SUMMARY_PUSH_TITLE,
  reviewAheadStatus,
  summaryPushData,
} from '../summaryPush';

let mockRows;
let mockPaths;
jest.mock('../../context/db', () => ({
  db: () => ({
    select: async (path) => {
      mockPaths.push(path);
      return mockRows;
    },
  }),
}));

beforeEach(() => {
  mockRows = [];
  mockPaths = [];
});

describe('the one push of their weekly day', () => {
  it('is for the summary and the review together while the review is still to do', () => {
    for (const status of [null, 'ready', 'started']) {
      expect(summaryPushData(status)).toEqual({
        title: SUMMARY_PUSH_TITLE,
        facts: {
          ready: [
            'their week in review',
            'planning the week ahead with Gremly, in their weekly review',
          ],
        },
      });
    }
  });

  it('is about the summary alone once the review is done, or they said not this week', () => {
    // and when the review could not be read: it may already be planned
    for (const status of ['done', 'skipped', REVIEW_UNREAD]) {
      expect(summaryPushData(status)).toEqual({
        title: SUMMARY_PUSH_TITLE,
        facts: { ready: 'their week in review' },
      });
    }
  });

  it('reads the review of the week that starts the day after the summary week ends', async () => {
    // the summary covers Monday 28 September to Sunday 4 October
    expect(await reviewAheadStatus({}, 'user-1', '2026-10-04')).toBeNull();
    expect(mockPaths[0]).toBe(
      'weekly_reviews?owner_id=eq.user-1&week_start=eq.2026-10-05&select=status&limit=1',
    );
    mockRows = [{ status: 'done' }];
    expect(await reviewAheadStatus({}, 'user-1', '2026-10-04')).toBe('done');
  });
});
