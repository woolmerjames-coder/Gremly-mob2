/**
 * Integration Tests for NOW Sweep Bar
 */

import React from 'react';
import { renderWithProviders, screen, fireEvent } from '../utils/renderWithProviders';
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

// Spy on console.log
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('Sweep Bar Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();

    // Base mock data
    mockNowData = {
      greeting: 'Good Afternoon, test',
      dateTimeLabel: 'Monday, November 25 • 2:00 PM',
      progressState: {
        mode: 'dots',
        percent: 50,
        completedCount: 2,
        totalEligibleCount: 4,
        dots: [true, true, false, false],
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
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleLogSpy.mockClear();
  });

  describe('With Yesterday Carry-Over', () => {
    it('shows "Time to Sweep!" when hasYesterdayCarryOver is true', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: true,
      };

      renderWithProviders(<NowScreenV1 />);

      // Should show the urgent message
      expect(screen.getByText('✨ Time to Sweep!')).toBeTruthy();
    });

    it('triggers Quick Sweep action when tapped with carry-over', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: true,
      };

      renderWithProviders(<NowScreenV1 />);

      // Tap the sweep bar
      fireEvent.press(screen.getByText('✨ Time to Sweep!'));

      // Should log Quick Sweep action (placeholder for actual modal)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[NOW] Opening Quick Sweep for yesterday carry-over',
      );
    });
  });

  describe('Without Yesterday Carry-Over', () => {
    it('shows "Sweep available" when hasYesterdayCarryOver is false', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: false,
      };

      renderWithProviders(<NowScreenV1 />);

      // Should show the standard message
      expect(screen.getByText('🧹 Sweep available')).toBeTruthy();
    });

    it('triggers Sweep flow when tapped without carry-over', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: false,
      };

      renderWithProviders(<NowScreenV1 />);

      // Tap the sweep bar
      fireEvent.press(screen.getByText('🧹 Sweep available'));

      // Should log Sweep flow action (placeholder for actual navigation)
      expect(consoleLogSpy).toHaveBeenCalledWith('[NOW] Opening Sweep flow');
    });
  });

  describe('Sweep Bar Interactivity', () => {
    it('is always visible and pressable', () => {
      mockNowData = {
        ...mockNowData,
        hasYesterdayCarryOver: true,
      };

      renderWithProviders(<NowScreenV1 />);

      const sweepButton = screen.getByText('✨ Time to Sweep!');
      expect(sweepButton).toBeTruthy();

      // Should be pressable
      fireEvent.press(sweepButton);
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});
