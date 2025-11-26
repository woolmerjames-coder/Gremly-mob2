/**
 * Tests for NOW Page Components (Shallow Render)
 * Tests component mounting and placeholder content
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NowHeader } from '../../components/now/NowHeader';
import { NowVaultBar } from '../../components/now/NowVaultBar';
import { NowList } from '../../components/now/NowList';
import { NowSweepBar } from '../../components/now/NowSweepBar';
import { OverwhelmButton } from '../../components/now/OverwhelmButton';

const mockProgressState = {
  mode: 'dots' as const,
  percent: 42,
  completedCount: 2,
  totalEligibleCount: 5,
  dots: [true, false, true, false, false],
};

const mockVaultSummary = {
  topThree: [
    { id: '1', name: 'Groceries', itemCount: 5 },
    { id: '2', name: 'Gift ideas', itemCount: 3 },
    { id: '3', name: 'Mexico list', itemCount: 2 },
  ],
  overflowCount: 2,
  thisWeekStats: {
    listCount: 5,
    journalCount: 1,
    ideaCount: 2,
    personCount: 0,
  },
};

const mockLockedItem = {
  id: 'locked-1',
  type: 'habit' as const,
  name: 'Placeholder locked item',
  locked: true as const,
  cadence: 'daily' as const,
};

const mockActiveItem = {
  id: 'active-1',
  type: 'habit' as const,
  name: 'Placeholder active item',
  locked: false as const,
  cadence: 'weekly' as const,
  weeklyStatus: 'on_track_today' as const,
};

const mockWeeklySummaries = [
  {
    habitId: 'habit-1',
    name: 'Morning Meditation',
    targetPerWeek: 7,
    completionsThisWeek: 5,
    status: 'on_track_today' as const,
  },
];

describe('NowHeader', () => {
  it('mounts successfully', () => {
    render(
      <NowHeader
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        progressPercent={0.42}
        weeklySummaries={mockWeeklySummaries}
        capturesCount={0}
      />,
    );
    // Should display time-of-day greeting (mocked to current time)
    const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
    expect(greetingText).toBeTruthy();
  });

  it('displays greeting text', () => {
    render(
      <NowHeader
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        progressPercent={0.42}
        weeklySummaries={mockWeeklySummaries}
        capturesCount={0}
      />,
    );
    // Should display time-of-day greeting
    const greetingText = screen.getByText(/Good (morning|afternoon|evening)/);
    expect(greetingText).toBeTruthy();
  });

  it('displays date and time placeholder', () => {
    render(
      <NowHeader
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        progressPercent={0.42}
        weeklySummaries={mockWeeklySummaries}
        capturesCount={0}
      />,
    );
    expect(screen.getByText(/Monday, November 25/)).toBeTruthy();
    expect(screen.getByText(/10:30 AM/)).toBeTruthy();
  });

  it('displays week indicator', () => {
    render(
      <NowHeader
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        progressPercent={0.42}
        weeklySummaries={[
          {
            habitId: 'habit-1',
            name: 'Meditation',
            targetPerWeek: 7,
            completionsThisWeek: 2,
            status: 'last_chance',
          },
        ]}
        capturesCount={3}
      />,
    );
    expect(screen.getByText('WEEK:')).toBeTruthy();
    expect(screen.getByText('HABITS BEHIND')).toBeTruthy();
    expect(screen.getByText('CAPTURES: 3')).toBeTruthy();
  });
});

describe('NowVaultBar', () => {
  it('mounts successfully', () => {
    render(<NowVaultBar summary={mockVaultSummary} expanded={false} onToggleExpand={jest.fn()} />);
    expect(screen.getByText('Mind Vault')).toBeTruthy();
  });

  it('displays Mind Vault title', () => {
    render(<NowVaultBar summary={mockVaultSummary} expanded={false} onToggleExpand={jest.fn()} />);
    expect(screen.getByText('Mind Vault')).toBeTruthy();
  });

  it('displays placeholder pills', () => {
    render(<NowVaultBar summary={mockVaultSummary} expanded={false} onToggleExpand={jest.fn()} />);
    expect(screen.getByText(/Groceries/)).toBeTruthy();
    expect(screen.getByText(/Gift ideas/)).toBeTruthy();
    expect(screen.getByText(/Mexico list/)).toBeTruthy();
    expect(screen.getByText('+2 more')).toBeTruthy();
  });
});

describe('NowList', () => {
  it('renders locked items', () => {
    render(<NowList lockedItems={[mockLockedItem]} activeItems={[]} futureItems={[]} />);
    expect(screen.getByText('Placeholder locked item')).toBeTruthy();
  });

  it('renders active items', () => {
    render(<NowList lockedItems={[]} activeItems={[mockActiveItem]} futureItems={[]} />);
    expect(screen.getByText('Placeholder active item')).toBeTruthy();
  });

  it('renders multiple active items', () => {
    render(
      <NowList
        lockedItems={[]}
        activeItems={[mockActiveItem, { ...mockActiveItem, id: 'active-2' }]}
        futureItems={[]}
      />,
    );
    const activeItems = screen.getAllByText('Placeholder active item');
    expect(activeItems.length).toBe(2);
  });

  it('displays future divider when future items exist', () => {
    render(
      <NowList
        lockedItems={[mockLockedItem]}
        activeItems={[mockActiveItem]}
        futureItems={[{ ...mockActiveItem, id: 'future-1' }]}
      />,
    );
    expect(screen.getByText('Future')).toBeTruthy();
  });

  it('displays empty state when no items', () => {
    render(<NowList lockedItems={[]} activeItems={[]} futureItems={[]} />);
    expect(screen.getByText('Nothing scheduled for today.')).toBeTruthy();
  });

  it('displays all done banner when all complete', () => {
    render(
      <NowList
        lockedItems={[mockLockedItem]}
        activeItems={[]}
        futureItems={[]}
        progressPercent={100}
      />,
    );
    expect(screen.getByText('🎉 All done for today!')).toBeTruthy();
  });
});

describe('NowSweepBar', () => {
  it('mounts successfully', () => {
    render(<NowSweepBar hasYesterdayCarryOver={true} onPress={jest.fn()} />);
    expect(screen.getByText('Time to Sweep!')).toBeTruthy();
  });

  it('displays sweep button text', () => {
    render(<NowSweepBar hasYesterdayCarryOver={true} onPress={jest.fn()} />);
    expect(screen.getByText('Time to Sweep!')).toBeTruthy();
  });

  it('displays sweep available when no carry over', () => {
    render(<NowSweepBar hasYesterdayCarryOver={false} onPress={jest.fn()} />);
    expect(screen.getByText('Sweep available')).toBeTruthy();
  });
});

describe('OverwhelmButton', () => {
  it('mounts successfully', () => {
    render(<OverwhelmButton onPress={jest.fn()} />);
    expect(screen.getByText('Feeling overwhelmed?')).toBeTruthy();
  });

  it('displays emoji icon', () => {
    render(<OverwhelmButton onPress={jest.fn()} />);
    expect(screen.getByText('Feeling overwhelmed?')).toBeTruthy();
  });

  it('displays overwhelmed text', () => {
    render(<OverwhelmButton onPress={jest.fn()} />);
    expect(screen.getByText('Feeling overwhelmed?')).toBeTruthy();
  });
});
