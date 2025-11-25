/**
 * Integration Tests for NOW Screen V1
 * Tests the full screen with mocked useNowData
 */

import React from 'react';
import { renderWithProviders, screen } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

// Create a variable to hold the mock now data so we can update it per test
let mockNowData: Partial<UseNowDataReturn>;

// Mock useNowData to return our test data
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: () => mockNowData,
}));

// Mock useTodayInteractions since NowScreenV1 uses it for interactions
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

describe('NowScreenV1 Integration Tests', () => {
  const mockDate = new Date('2025-11-25T10:30:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Full Data Scenario', () => {
    it('renders complete NOW screen with all sections', () => {
      // Set the mock NOW data for this test
      mockNowData = {
        greeting: 'Good Morning, test',
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
        progressState: {
          mode: 'dots',
          percent: 50,
          completedCount: 2,
          totalEligibleCount: 4,
          dots: [true, false, true, false],
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
            id: 'habit-2',
            type: 'habit',
            name: 'Evening Walk',
            locked: false,
            cadence: 'daily',
          },
          {
            id: 'todo-1',
            type: 'todo',
            name: 'Finish report',
            locked: false,
          },
        ],
        futureItems: [
          {
            id: 'todo-2',
            type: 'todo',
            name: 'Call dentist',
          },
        ],
        vaultSummary: {
          topThree: [
            { id: 'note-1', name: 'Groceries', itemCount: 3 },
            { id: 'note-2', name: 'Gift ideas', itemCount: 2 },
            { id: 'note-3', name: 'Mexico list', itemCount: 3 },
          ],
          overflowCount: 2,
          thisWeekStats: {
            journalCount: 5,
            ideaCount: 0,
            personCount: 0,
          },
        },
        completedToday: [],
        hasYesterdayCarryOver: false,
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Assert: Header renders greeting
      expect(screen.getByText(/Good Morning/i)).toBeTruthy();

      // Assert: Date/time label renders
      expect(screen.getByText(/Monday, November 25/i)).toBeTruthy();

      // Assert: Week indicator renders
      expect(screen.getByText('WEEK:')).toBeTruthy();

      // Assert: Mind Vault section renders
      expect(screen.getByText('📚 Mind Vault')).toBeTruthy();

      // Assert: Top 3 lists render
      expect(screen.getByText(/Groceries/)).toBeTruthy();
      expect(screen.getByText(/Gift ideas/)).toBeTruthy();
      expect(screen.getByText(/Mexico list/)).toBeTruthy();

      // Assert: Overflow count renders
      expect(screen.getByText('+2 more')).toBeTruthy();

      // Assert: NOW list section header
      expect(screen.getByText('NOW')).toBeTruthy();

      // Assert: Locked item appears
      expect(screen.getByText('Morning Meditation')).toBeTruthy();

      // Assert: Active items appear
      expect(screen.getByText('Evening Walk')).toBeTruthy();
      expect(screen.getByText('Finish report')).toBeTruthy();

      // Assert: Future divider appears
      expect(screen.getByText('Future')).toBeTruthy();

      // Assert: Future item appears
      expect(screen.getByText('Call dentist')).toBeTruthy();

      // Assert: Sweep bar should NOT show when hasYesterdayCarryOver=false
      expect(screen.queryByText('✨ Time to Sweep!')).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('renders empty state gracefully when no data', () => {
      // Set the mock NOW data for empty state
      mockNowData = {
        greeting: 'Good Morning, test',
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
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
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Assert: Header still renders
      expect(screen.getByText(/Good Morning/i)).toBeTruthy();

      // Assert: Date/time label still renders
      expect(screen.getByText(/Monday, November 25/i)).toBeTruthy();

      // Assert: Week indicator still renders
      expect(screen.getByText('WEEK:')).toBeTruthy();

      // Assert: NOW list section header still renders
      expect(screen.getByText('NOW')).toBeTruthy();

      // Assert: No items appear
      expect(screen.queryByText('Morning Meditation')).toBeNull();
      expect(screen.queryByText('Finish report')).toBeNull();

      // Assert: Future divider should NOT appear when no future items
      expect(screen.queryByText('Future')).toBeNull();

      // Assert: Sweep bar should NOT show
      expect(screen.queryByText('✨ Time to Sweep!')).toBeNull();

      // Assert: Mind Vault should not render when no notes
      expect(screen.queryByText('📚 Mind Vault')).toBeNull();
    });
  });

  describe('Week Status Indicators', () => {
    it('renders week indicator with on_track status', () => {
      mockNowData = {
        greeting: 'Good Morning, test',
        dateTimeLabel: 'Monday, November 25 • 10:30 AM',
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
        loading: false,
        reload: jest.fn().mockResolvedValue(undefined),
      };

      renderWithProviders(<NowScreenV1 />);

      // Assert: Week indicator renders
      expect(screen.getByText('WEEK:')).toBeTruthy();
      // Note: The actual symbol depends on calculateWeekStatus logic in NowWeekIndicator
      // This test validates the component renders the week indicator
    });
  });
});
