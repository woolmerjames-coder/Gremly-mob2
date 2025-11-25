/**
 * Integration Tests for NOW Mind Vault Expansion
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

describe('Mind Vault Expansion Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();

    // Set up mock data with vault summary
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
        topThree: [
          { id: 'list-1', name: 'Groceries', itemCount: 5 },
          { id: 'list-2', name: 'Work tasks', itemCount: 3 },
          { id: 'list-3', name: 'Weekend plans', itemCount: 2 },
        ],
        overflowCount: 2,
        thisWeekStats: {
          journalCount: 4,
          ideaCount: 7,
          personCount: 2,
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
  });

  describe('Collapsed State', () => {
    it('shows topThree pills in collapsed state', () => {
      renderWithProviders(<NowScreenV1 />);

      // Vault bar should be visible
      expect(screen.getByText('📚 Mind Vault')).toBeTruthy();

      // Top three pills should be visible
      expect(screen.getByText('Groceries • 5')).toBeTruthy();
      expect(screen.getByText('Work tasks • 3')).toBeTruthy();
      expect(screen.getByText('Weekend plans • 2')).toBeTruthy();

      // Overflow pill should be visible
      expect(screen.getByText('+2 more')).toBeTruthy();
    });

    it('shows expand icon when collapsed', () => {
      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('▶')).toBeTruthy();
      expect(screen.queryByText('▼')).toBeNull();
    });

    it('does not show expanded view initially', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expanded view content should not be visible
      expect(screen.queryByText('📚 MIND VAULT')).toBeNull();
      expect(screen.queryByText('Recent Lists')).toBeNull();
      expect(screen.queryByText('This Week')).toBeNull();
    });
  });

  describe('Expansion Behavior', () => {
    it('expands vault when tapping header', () => {
      renderWithProviders(<NowScreenV1 />);

      // Tap the header
      const header = screen.getByText('📚 Mind Vault');
      fireEvent.press(header);

      // Expanded view should now be visible
      expect(screen.getByText('📚 MIND VAULT')).toBeTruthy();
      expect(screen.getByText('Recent Lists')).toBeTruthy();
      expect(screen.getByText('This Week')).toBeTruthy();

      // Expand icon should change
      expect(screen.getByText('▼')).toBeTruthy();
      expect(screen.queryByText('▶')).toBeNull();
    });

    it('expands vault when tapping a pill', () => {
      renderWithProviders(<NowScreenV1 />);

      // Tap one of the pills
      fireEvent.press(screen.getByText('Groceries • 5'));

      // Expanded view should be visible
      expect(screen.getByText('📚 MIND VAULT')).toBeTruthy();
    });

    it('shows Recent Lists section with correct data', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Check Recent Lists section - text is "Recent Lists" not uppercase
      expect(screen.getByText('Recent Lists')).toBeTruthy();
      expect(screen.getByText('Groceries')).toBeTruthy();
      expect(screen.getByText('(5 left) →')).toBeTruthy();
      expect(screen.getByText('Work tasks')).toBeTruthy();
      expect(screen.getByText('(3 left) →')).toBeTruthy();
      expect(screen.getByText('Weekend plans')).toBeTruthy();
      expect(screen.getByText('(2 left) →')).toBeTruthy();
    });

    it('shows This Week section with correct stats', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Check This Week section - text is "This Week" not uppercase in component
      expect(screen.getByText('This Week')).toBeTruthy();

      // Stats values should be visible
      const allFours = screen.getAllByText('4');
      expect(allFours.length).toBeGreaterThan(0);

      const allSevens = screen.getAllByText('7');
      expect(allSevens.length).toBeGreaterThan(0);

      const allTwos = screen.getAllByText('2');
      expect(allTwos.length).toBeGreaterThan(0);

      expect(screen.getByText('Journal')).toBeTruthy();
      expect(screen.getByText('Ideas')).toBeTruthy();
      expect(screen.getByText('Person Notes')).toBeTruthy();
    });

    it('shows action buttons in expanded view', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Check for action buttons
      expect(screen.getByText('See all')).toBeTruthy();
      expect(screen.getByText('Collapse')).toBeTruthy();
    });
  });

  describe('Collapse Behavior', () => {
    it('collapses vault when tapping Collapse button', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));
      expect(screen.getByText('📚 MIND VAULT')).toBeTruthy();

      // Tap Collapse button
      fireEvent.press(screen.getByText('Collapse'));

      // Expanded view should be hidden
      expect(screen.queryByText('📚 MIND VAULT')).toBeNull();
      expect(screen.queryByText('Recent Lists')).toBeNull();

      // Expand icon should be back to collapsed state
      expect(screen.getByText('▶')).toBeTruthy();
      expect(screen.queryByText('▼')).toBeNull();
    });

    it('collapses vault when tapping header again', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      const header = screen.getByText('📚 Mind Vault');
      fireEvent.press(header);
      expect(screen.getByText('📚 MIND VAULT')).toBeTruthy();

      // Tap header again to collapse
      fireEvent.press(header);

      // Expanded view should be hidden
      expect(screen.queryByText('📚 MIND VAULT')).toBeNull();
    });
  });

  describe('List Press Behavior', () => {
    it('logs list ID when list is tapped (placeholder for overlay)', () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Tap on a list
      const groceriesText = screen.getByText('Groceries');
      const listRow = groceriesText.parent;
      if (listRow) {
        fireEvent.press(listRow);
      }

      // Verify console log was called (placeholder until list overlay is implemented)
      expect(consoleLogSpy).toHaveBeenCalledWith('[NOW] Opening list:', 'list-1');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Empty Vault State', () => {
    it('hides vault bar when topThree is empty', () => {
      mockNowData = {
        ...mockNowData,
        vaultSummary: {
          topThree: [],
          overflowCount: 0,
          thisWeekStats: {
            journalCount: 0,
            ideaCount: 0,
            personCount: 0,
          },
        },
      };

      renderWithProviders(<NowScreenV1 />);

      // Vault bar should not be visible
      expect(screen.queryByText('📚 Mind Vault')).toBeNull();
    });
  });
});
