/**
 * Integration Tests for NOW Empty States
 */

import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

// Create a variable to hold the mock now data
let mockNowData: Partial<UseNowDataReturn>;

// Mock useNowData to return our test data
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: () => mockNowData,
}));

// Mock useTodayInteractions
jest.mock('../../lib/today/useTodayInteractions', () => ({
  useTodayInteractions: () => ({
    openEntityOverlay: jest.fn(),
    toggleTodoComplete: jest.fn(),
    toggleHabitComplete: jest.fn(),
    undoLastCompletion: jest.fn(),
    completedHabitIds: new Set(),
    completedTodoIds: new Set(),
    undoState: null,
  }),
}));

// Mock the unified overlay controller
jest.mock('../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    state: { visible: false, mode: 'create' },
    openCreate: jest.fn(),
    openEdit: jest.fn(),
    openView: jest.fn(),
    close: jest.fn(),
  }),
}));

// Mock SweepDrawer component
jest.mock('../../components/today/v3/SweepDrawer', () => {
  const React = require('react');
  const { View } = require('react-native');

  return jest.fn(({ visible }: { visible: boolean }) => {
    if (!visible) return null;
    return <View testID="sweep-drawer" />;
  });
});

describe('NOW Empty States Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Empty Item List', () => {
    it('shows empty state when no locked or active items', () => {
      mockNowData = {
        greeting: 'Good Afternoon, test',
        dateTimeLabel: 'Monday, November 25 • 2:00 PM',
        progressState: {
          mode: 'dots',
          percent: 0,
          completedCount: 0,
          totalEligibleCount: 0,
          dots: [],
        },
        weekStatus: 'on_track',
        lockedItems: [],
        activeItems: [],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Empty state message should be visible
      expect(screen.getByText('Nothing scheduled for today.')).toBeTruthy();
      expect(screen.getByText('Enjoy a calmer day — or try a Sweep.')).toBeTruthy();
    });

    it('does not show empty state when items exist', () => {
      mockNowData = {
        greeting: 'Good Afternoon, test',
        dateTimeLabel: 'Monday, November 25 • 2:00 PM',
        progressState: {
          mode: 'dots',
          percent: 50,
          completedCount: 1,
          totalEligibleCount: 2,
          dots: [true, false],
        },
        weekStatus: 'on_track',
        lockedItems: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            locked: true,
            cadence: 'daily',
          },
        ],
        activeItems: [
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Empty state should NOT be visible
      expect(screen.queryByText('Nothing scheduled for today.')).toBeNull();
      expect(screen.queryByText('Enjoy a calmer day — or try a Sweep.')).toBeNull();

      // Items should be visible instead
      expect(screen.getByText('Morning Meditation')).toBeTruthy();
      expect(screen.getByText('Finish report')).toBeTruthy();
    });
  });

  describe('All Done Banner', () => {
    it('shows "All done!" banner when progressState.percent is 100', () => {
      mockNowData = {
        greeting: 'Good Afternoon, test',
        dateTimeLabel: 'Monday, November 25 • 2:00 PM',
        progressState: {
          mode: 'dots',
          percent: 100,
          completedCount: 2,
          totalEligibleCount: 2,
          dots: [true, true],
        },
        weekStatus: 'on_track',
        lockedItems: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            locked: true,
            cadence: 'daily',
            completedAt: new Date().toISOString(),
          },
        ],
        activeItems: [
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            completedAt: new Date().toISOString(),
          },
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            completedAt: new Date().toISOString(),
          },
        ],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // All done banner should be visible
      expect(screen.getByText('🎉 All done for today!')).toBeTruthy();
    });

    it('does not show banner when progress is less than 100%', () => {
      mockNowData = {
        greeting: 'Good Afternoon, test',
        dateTimeLabel: 'Monday, November 25 • 2:00 PM',
        progressState: {
          mode: 'dots',
          percent: 75,
          completedCount: 3,
          totalEligibleCount: 4,
          dots: [true, true, true, false],
        },
        weekStatus: 'on_track',
        lockedItems: [
          {
            id: 'habit-1',
            type: 'habit',
            name: 'Morning Meditation',
            locked: true,
            cadence: 'daily',
          },
        ],
        activeItems: [
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Banner should NOT be visible
      expect(screen.queryByText('🎉 All done for today!')).toBeNull();
    });

    it('does not show banner when item list is empty', () => {
      mockNowData = {
        greeting: 'Good Afternoon, test',
        dateTimeLabel: 'Monday, November 25 • 2:00 PM',
        progressState: {
          mode: 'dots',
          percent: 100,
          completedCount: 0,
          totalEligibleCount: 0,
          dots: [],
        },
        weekStatus: 'on_track',
        lockedItems: [],
        activeItems: [],
        futureItems: [],
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        weeklySummaries: [],
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Should show empty state, NOT all done banner
      expect(screen.queryByText('🎉 All done for today!')).toBeNull();
      expect(screen.getByText('Nothing scheduled for today.')).toBeTruthy();
    });
  });
});
