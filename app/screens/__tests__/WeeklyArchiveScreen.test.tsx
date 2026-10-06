/**
 * The weekly archive: each past week's summary, and beside it the weekly
 * review of that week when they did one.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockGoBack = jest.fn();
const mockNavigate = jest.fn();
let mockSummaries: Record<string, unknown>[] = [];
const mockStore: Record<string, unknown> = {};
const mockWeek: Record<string, unknown> = { weeklyDay: 0 };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: mockNavigate }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_t, name) => (props: Record<string, unknown>) =>
        React.createElement(Text, props, String(name)),
    },
  );
});
jest.mock('../../../lib/store/selectors', () => ({
  usePastSummaries: () => mockSummaries,
}));
jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: Object.assign(
    (pick: (s: Record<string, unknown>) => unknown) => pick(mockStore),
    { getState: () => mockStore },
  ),
}));
jest.mock('../../../lib/week/thisWeek', () => ({
  useThisWeek: (pick: (w: Record<string, unknown>) => unknown) => pick(mockWeek),
}));
jest.mock('../../../lib/date/DateService', () => ({
  getDateService: () => ({
    ritualDay: () => '2026-10-07',
    dayOf: (at: string | null) => (at ? at.slice(0, 10) : null),
  }),
}));
jest.mock('../../../lib/repo/weekReviewRepo', () => ({
  getDoneWeekReviews: jest.fn(),
}));

import WeeklyArchiveScreen from '../WeeklyArchiveScreen';
import { usePastWeeks } from '../../../lib/week/pastWeeks';
import { getDoneWeekReviews } from '../../../lib/repo/weekReviewRepo';

const summary = (start: string, end: string, headline: string) => ({
  id: `s-${start}`,
  week_start_date: start,
  week_end_date: end,
  viewed: true,
  content: { cards: [{ shape: 'hero', headline }] },
});

/** Let the read the screen starts on mount come back. */
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  usePastWeeks.setState({ owner: null, byWeek: {}, failed: false });
  mockWeek.weeklyDay = 0;
  // made up: two past weeks, newest first as the store lists them
  mockSummaries = [
    summary('2026-09-28', '2026-10-04', 'A steadier week'),
    summary('2026-09-21', '2026-09-27', 'A week of small starts'),
  ];
  Object.assign(mockStore, {
    userId: 'u1',
    todos: [
      {
        id: 't-1',
        title: 'Send the grant draft',
        due_day: '2026-09-28',
        completed_at: '2026-09-28T16:00:00Z',
      },
      { id: 't-2', title: 'Book the plumber', due_day: '2026-09-29', completed_at: null },
    ],
    habits: [{ id: 'h-1', name: 'Swim' }],
    habitPlans: [],
    habitProgress: [{ habit_id: 'h-1', occurred_day: '2026-09-29', count: 1 }],
  });
  (getDoneWeekReviews as jest.Mock).mockResolvedValue([
    {
      id: 'r-1',
      week_start: '2026-09-28',
      status: 'done',
      answers: {
        intention: 'Fewer things, finished.',
        priorities: [
          { text: 'The grant', item_ids: ['t-1'] },
          { text: 'Swimming', item_ids: ['h-1'] },
        ],
        planned: {
          todos: 2,
          later: 0,
          habit_days: 1,
          days: {
            '2026-09-28': { todos: ['t-1'], habits: [] },
            '2026-09-29': { todos: ['t-2'], habits: ['h-1'] },
          },
        },
      },
    },
  ]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('the weekly archive', () => {
  it('shows a planned week’s intention, what mattered most, and planned against done', async () => {
    const r = render(<WeeklyArchiveScreen />);
    await settle();
    // the reviews of the weeks listed, oldest to newest
    expect(getDoneWeekReviews).toHaveBeenCalledWith('u1', '2026-09-21', '2026-09-28');
    expect(r.getByTestId('archive-week-2026-09-28')).toBeTruthy();
    expect(r.getByText('“Fewer things, finished.”')).toBeTruthy();
    expect(r.getByText('Mattered most: The grant, Swimming')).toBeTruthy();
    // a todo done and a habit done, of the three things planned
    expect(r.getByText('Planned 3, done 2')).toBeTruthy();
    // the summary's own line is still there
    expect(r.getByText('A steadier week')).toBeTruthy();
  });

  it('shows a week with no review as its summary alone, and still opens it', async () => {
    const r = render(<WeeklyArchiveScreen />);
    await settle();
    expect(r.queryByTestId('archive-week-2026-09-21')).toBeNull();
    fireEvent.press(r.getByText('A week of small starts'));
    expect(mockNavigate).toHaveBeenCalledWith('WeeklySummary', { weekStartDate: '2026-09-21' });
  });

  it('says so when the reviews cannot be read, and keeps the summaries', async () => {
    (getDoneWeekReviews as jest.Mock).mockRejectedValue(new Error('offline'));
    const r = render(<WeeklyArchiveScreen />);
    expect(r.queryByTestId('archive-reviews-failed')).toBeNull();
    await settle();
    expect(r.getByTestId('archive-reviews-failed')).toBeTruthy();
    expect(r.getByText('A steadier week')).toBeTruthy();
    expect(r.queryByTestId('archive-week-2026-09-28')).toBeNull();
  });

  it('with no summaries yet, names their own weekly day and reads nothing', async () => {
    mockSummaries = [];
    mockWeek.weeklyDay = 3;
    const r = render(<WeeklyArchiveScreen />);
    await settle();
    expect(r.getByText('Your first summary will appear here on Wednesday.')).toBeTruthy();
    expect(getDoneWeekReviews).not.toHaveBeenCalled();
  });
});
