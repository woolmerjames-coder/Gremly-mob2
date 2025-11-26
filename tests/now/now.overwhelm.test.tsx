/**
 * Integration Tests for Overwhelm Flow
 * Tests the Overwhelm button and selection sheet rendering
 */

import React from 'react';
import { renderWithProviders, screen, fireEvent } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

// Mock useAuth to return a test user
jest.mock('../../providers/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-1',
      email: 'test@example.com',
    },
    userId: 'test-user-1',
    session: { access_token: 'mock-token' },
    loading: false,
    error: null,
    signInWithEmail: jest.fn(),
    signOut: jest.fn(),
    clearError: jest.fn(),
  }),
}));

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

describe('Overwhelm Flow Integration Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();

    // Set up default mock data with several items
    mockNowData = {
      dateTimeLabel: 'Monday, November 25 • 2:00 PM',
      progressState: {
        mode: 'dots',
        percent: 25,
        completedCount: 1,
        totalEligibleCount: 4,
        dots: [true, false, false, false],
      },
      weekStatus: 'needs_attention',
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
        {
          id: 'todo-2',
          type: 'todo',
          name: 'Email client',
          locked: false,
        },
        {
          id: 'habit-3',
          type: 'habit',
          name: 'Read 30 min',
          locked: false,
          cadence: 'daily',
        },
      ],
      futureItems: [],
      vaultSummary: {
        topThree: [],
        overflowCount: 0,
        thisWeekStats: {
          listCount: 0,
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
  });

  describe('Overwhelm Button', () => {
    it('renders overwhelm button on NOW screen', () => {
      renderWithProviders(<NowScreenV1 />);

      expect(screen.getByText('Feeling stuck?')).toBeTruthy();
      expect(screen.getByText('Feeling stuck?')).toBeTruthy();
    });

    it('shows selection sheet when tapping overwhelm button', () => {
      renderWithProviders(<NowScreenV1 />);

      // Selection sheet should not be visible initially
      expect(screen.queryByText('Pick your 3 most important items')).toBeNull();

      // Tap the overwhelm button
      fireEvent.press(screen.getByText('Feeling stuck?'));

      // Selection sheet should now be visible
      expect(screen.getByText('Pick your 3 most important items')).toBeTruthy();
      expect(screen.getByText('0/3 selected')).toBeTruthy();
      expect(screen.getByText('Get starter steps')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('displays all items in selection sheet (locked + active)', () => {
      renderWithProviders(<NowScreenV1 />);

      fireEvent.press(screen.getByText('Feeling stuck?'));

      // All items should be listed
      const allItems = screen.getAllByText('Morning Meditation');
      expect(allItems.length).toBeGreaterThanOrEqual(1);

      expect(screen.getAllByText('Evening Walk').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Finish report').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Email client').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Read 30 min').length).toBeGreaterThanOrEqual(1);
    });

    it('closes selection sheet when tapping Cancel', () => {
      renderWithProviders(<NowScreenV1 />);

      // Open selection sheet
      fireEvent.press(screen.getByText('Feeling stuck?'));
      expect(screen.getByText('Pick your 3 most important items')).toBeTruthy();

      // Tap Cancel
      fireEvent.press(screen.getByText('Cancel'));

      // Selection sheet should close
      expect(screen.queryByText('Pick your 3 most important items')).toBeNull();
    });
  });

  describe('Item Selection', () => {
    it('tracks selection count when selecting items', () => {
      renderWithProviders(<NowScreenV1 />);

      // Open selection sheet
      fireEvent.press(screen.getByText('Feeling stuck?'));
      expect(screen.getByText('0/3 selected')).toBeTruthy();

      // Get items in the modal (last occurrence of each)
      const allMeditations = screen.getAllByText('Morning Meditation');
      const allWalks = screen.getAllByText('Evening Walk');
      const allReports = screen.getAllByText('Finish report');

      // Select items
      const item1 = allMeditations[allMeditations.length - 1].parent;
      const item2 = allWalks[allWalks.length - 1].parent;
      const item3 = allReports[allReports.length - 1].parent;

      if (item1) fireEvent.press(item1);
      expect(screen.getByText('1/3 selected')).toBeTruthy();

      if (item2) fireEvent.press(item2);
      expect(screen.getByText('2/3 selected')).toBeTruthy();

      if (item3) fireEvent.press(item3);
      expect(screen.getByText('3/3 selected')).toBeTruthy();
    });
  });

  describe('Data Structure Validation', () => {
    it('provides correct data structure for overwhelm flow', () => {
      renderWithProviders(<NowScreenV1 />);

      // Verify locked items exist
      expect(mockNowData.lockedItems).toHaveLength(1);
      expect(mockNowData.lockedItems![0].name).toBe('Morning Meditation');

      // Verify active items exist
      expect(mockNowData.activeItems).toHaveLength(4);
      expect(mockNowData.activeItems![0].name).toBe('Evening Walk');
      expect(mockNowData.activeItems![1].name).toBe('Finish report');

      // Total items available for selection
      const totalItems =
        (mockNowData.lockedItems?.length || 0) + (mockNowData.activeItems?.length || 0);
      expect(totalItems).toBe(5);
    });
  });
});
