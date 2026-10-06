/**
 * Tests for components/WeeklySummaryBanner.tsx: the banner that says a new
 * weekly summary is ready, and Plan your week on it or in its place.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, addListener: jest.fn(() => jest.fn()) }),
}));

const mockDismissBanner = jest.fn();
let mockShouldShow = true;
const mockCurrentSummary = {
  id: 'summary-1',
  week_start_date: '2025-12-15',
  content: { weeklyCommentary: 'Great week!' },
  viewed: false,
  banner_dismissed: false,
};
let mockCurrentSummaryValue: typeof mockCurrentSummary | null = mockCurrentSummary;

jest.mock('../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      dismissSummaryBanner: mockDismissBanner,
    }),
}));

jest.mock('../../lib/store/selectors', () => ({
  useShouldShowSummaryBanner: () => mockShouldShow,
  useCurrentWeekSummary: () => mockCurrentSummaryValue,
}));

jest.mock('lucide-react-native', () => ({
  CalendarRange: 'CalendarRange',
  ChevronRight: 'ChevronRight',
  X: 'X',
  Sparkles: 'Sparkles',
}));

jest.mock('../../design/brand', () => ({
  BRAND: { radius: { lg: 12 } },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

import WeeklySummaryBanner from '../../components/WeeklySummaryBanner';

describe('WeeklySummaryBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldShow = true;
    mockCurrentSummaryValue = mockCurrentSummary;
  });

  it('renders banner text when summary is available', () => {
    const { getByText } = render(<WeeklySummaryBanner />);
    expect(getByText('Your week in review is ready')).toBeTruthy();
  });

  it('returns null when shouldShow is false', () => {
    mockShouldShow = false;
    const { toJSON } = render(<WeeklySummaryBanner />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when currentSummary is null', () => {
    mockCurrentSummaryValue = null;
    const { toJSON } = render(<WeeklySummaryBanner />);
    expect(toJSON()).toBeNull();
  });

  it('navigates to WeeklySummary screen on press', () => {
    const { getByText } = render(<WeeklySummaryBanner />);
    fireEvent.press(getByText('Your week in review is ready'));
    expect(mockNavigate).toHaveBeenCalledWith('WeeklySummary', {
      weekStartDate: '2025-12-15',
    });
  });

  it('puts the banner away from its X, without opening the summary', () => {
    const { getByTestId } = render(<WeeklySummaryBanner />);
    fireEvent.press(getByTestId('summary-banner-dismiss'));
    expect(mockDismissBanner).toHaveBeenCalledWith('summary-1');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Plan your week at the top of Today', () => {
  const planWeek = {
    label: 'Plan your week',
    note: 'Ten minutes with Gremly to set up the week ahead.',
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockShouldShow = true;
    mockCurrentSummaryValue = mockCurrentSummary;
  });

  it('is a button on the banner while the summary is waiting, not a second card', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <WeeklySummaryBanner planWeek={planWeek} />,
    );
    expect(getByText('Your week in review is ready')).toBeTruthy();
    expect(queryByTestId('plan-week-card')).toBeNull();
    fireEvent.press(getByTestId('summary-banner-plan-week'));
    expect(planWeek.onPress).toHaveBeenCalledTimes(1);
    // the button opens the review, not the summary
    expect(mockNavigate).not.toHaveBeenCalled();
    // and the banner itself still opens the summary
    fireEvent.press(getByText('Your week in review is ready'));
    expect(mockNavigate).toHaveBeenCalledWith('WeeklySummary', { weekStartDate: '2025-12-15' });
  });

  it('is a card of its own once the summary is put away or there is none', () => {
    mockShouldShow = false;
    const put = render(<WeeklySummaryBanner planWeek={planWeek} />);
    expect(put.queryByText('Your week in review is ready')).toBeNull();
    expect(put.getByText('Plan your week')).toBeTruthy();
    expect(put.getByText('Ten minutes with Gremly to set up the week ahead.')).toBeTruthy();
    fireEvent.press(put.getByTestId('plan-week-card'));
    expect(planWeek.onPress).toHaveBeenCalledTimes(1);

    mockShouldShow = true;
    mockCurrentSummaryValue = null;
    const none = render(<WeeklySummaryBanner planWeek={planWeek} />);
    expect(none.getByTestId('plan-week-card')).toBeTruthy();
  });

  it('is not there on a screen that does not ask for it', () => {
    const { queryByTestId, getByText } = render(<WeeklySummaryBanner />);
    expect(getByText('Your week in review is ready')).toBeTruthy();
    expect(queryByTestId('summary-banner-plan-week')).toBeNull();
    expect(queryByTestId('plan-week-card')).toBeNull();
  });
});
