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

describe('NowHeader', () => {
  it('mounts successfully', () => {
    render(
      <NowHeader
        greeting="Hi James — Good Morning"
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        weekStatus="on_track"
      />,
    );
    expect(screen.getByText(/Hi James/)).toBeTruthy();
  });

  it('displays greeting text', () => {
    render(
      <NowHeader
        greeting="Hi James — Good Morning"
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        weekStatus="on_track"
      />,
    );
    expect(screen.getByText(/Hi James/)).toBeTruthy();
    expect(screen.getByText(/Good Morning/)).toBeTruthy();
  });

  it('displays date and time placeholder', () => {
    render(
      <NowHeader
        greeting="Hi James — Good Morning"
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        weekStatus="on_track"
      />,
    );
    expect(screen.getByText(/Monday, November 25/)).toBeTruthy();
    expect(screen.getByText(/10:30 AM/)).toBeTruthy();
  });

  it('displays week indicator', () => {
    render(
      <NowHeader
        greeting="Hi James — Good Morning"
        dateTimeLabel="Monday, November 25 • 10:30 AM"
        progressState={mockProgressState}
        weekStatus="on_track"
      />,
    );
    expect(screen.getByText('WEEK:')).toBeTruthy();
    // Week indicator now uses a half-circle graphic instead of emoji
  });
});

describe('NowVaultBar', () => {
  it('mounts successfully', () => {
    render(<NowVaultBar summary={mockVaultSummary} expanded={false} onToggleExpand={jest.fn()} />);
    expect(screen.getByText('📚 Mind Vault')).toBeTruthy();
  });

  it('displays Mind Vault title', () => {
    render(<NowVaultBar summary={mockVaultSummary} expanded={false} onToggleExpand={jest.fn()} />);
    expect(screen.getByText('📚 Mind Vault')).toBeTruthy();
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
  it('mounts successfully', () => {
    render(
      <NowList lockedItems={[mockLockedItem]} activeItems={[mockActiveItem]} futureItems={[]} />,
    );
    expect(screen.getByText('NOW')).toBeTruthy();
  });

  it('displays NOW header', () => {
    render(
      <NowList lockedItems={[mockLockedItem]} activeItems={[mockActiveItem]} futureItems={[]} />,
    );
    expect(screen.getByText('NOW')).toBeTruthy();
  });

  it('displays locked item placeholder', () => {
    render(
      <NowList lockedItems={[mockLockedItem]} activeItems={[mockActiveItem]} futureItems={[]} />,
    );
    expect(screen.getByText('Placeholder locked item')).toBeTruthy();
  });

  it('displays active item placeholders', () => {
    render(
      <NowList
        lockedItems={[mockLockedItem]}
        activeItems={[mockActiveItem, { ...mockActiveItem, id: 'active-2' }]}
        futureItems={[]}
      />,
    );
    const activeItems = screen.getAllByText('Placeholder active item');
    expect(activeItems.length).toBeGreaterThan(0);
  });

  it('displays habit status placeholder', () => {
    render(
      <NowList lockedItems={[mockLockedItem]} activeItems={[mockActiveItem]} futureItems={[]} />,
    );
    expect(screen.getByText('On track')).toBeTruthy();
  });

  it('displays future divider', () => {
    render(
      <NowList
        lockedItems={[mockLockedItem]}
        activeItems={[mockActiveItem]}
        futureItems={[{ ...mockActiveItem, id: 'future-1' }]}
      />,
    );
    expect(screen.getByText('Future')).toBeTruthy();
  });
});

describe('NowSweepBar', () => {
  it('mounts successfully', () => {
    render(<NowSweepBar hasYesterdayCarryOver={true} onPress={jest.fn()} />);
    expect(screen.getByText('✨ Time to Sweep!')).toBeTruthy();
  });

  it('displays sweep button text', () => {
    render(<NowSweepBar hasYesterdayCarryOver={true} onPress={jest.fn()} />);
    expect(screen.getByText('✨ Time to Sweep!')).toBeTruthy();
  });

  it('displays sweep available when no carry over', () => {
    render(<NowSweepBar hasYesterdayCarryOver={false} onPress={jest.fn()} />);
    expect(screen.getByText('🧹 Sweep available')).toBeTruthy();
  });
});

describe('OverwhelmButton', () => {
  it('mounts successfully', () => {
    render(<OverwhelmButton onPress={jest.fn()} />);
    expect(screen.getByText('😮‍💨')).toBeTruthy();
  });

  it('displays emoji icon', () => {
    render(<OverwhelmButton onPress={jest.fn()} />);
    expect(screen.getByText('😮‍💨')).toBeTruthy();
  });

  it('displays stuck text', () => {
    render(<OverwhelmButton onPress={jest.fn()} />);
    expect(screen.getByText('Feeling stuck?')).toBeTruthy();
  });
});
