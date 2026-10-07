/**
 * The Worlds tab's "this week" card: its dates are the person's own week,
 * the seven days that end on their weekly day.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { WeeklySummaryCard } from '../WeeklySummaryCard';

let mockWeeklyDay = 0;
let mockKind: 'authored' | 'in_progress' = 'authored';

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: { weeklyDay: number }) => unknown) =>
    selector({ weeklyDay: mockWeeklyDay }),
}));
jest.mock('../../../lib/store/worldsSelectors', () => ({
  useWeeklySummaryCardState: () =>
    mockKind === 'authored'
      ? { kind: 'authored', summary: { headline: 'A steady week.' } }
      : { kind: 'in_progress', summary: { dropClause: '2 drops across 1 world this week.' } },
}));

describe('WeeklySummaryCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Wednesday 17 December 2025
    jest.setSystemTime(new Date('2025-12-17T12:00:00Z'));
    mockWeeklyDay = 0;
    mockKind = 'authored';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('dates the week Monday to Sunday for a Sunday person', () => {
    const r = render(<WeeklySummaryCard />);
    expect(r.getByText('THIS WEEK · Dec 15 to 21')).toBeTruthy();
    expect(r.getByText('A steady week.')).toBeTruthy();
  });

  it('dates the week Thursday to Wednesday for a Wednesday person', () => {
    mockWeeklyDay = 3;
    const r = render(<WeeklySummaryCard />);
    expect(r.getByText('THIS WEEK · Dec 11 to 17')).toBeTruthy();
  });

  it('dates the week the same way while it is still being counted', () => {
    mockWeeklyDay = 3;
    mockKind = 'in_progress';
    const r = render(<WeeklySummaryCard />);
    expect(r.getByText('THIS WEEK · Dec 11 to 17')).toBeTruthy();
    expect(r.getByText('2 drops across 1 world this week.')).toBeTruthy();
  });
});
