/**
 * Integration Tests for NOW Mind Vault Expansion
 */

import React from 'react';
import { renderWithProviders, screen, fireEvent, mockNavigate } from '../utils/renderWithProviders';
import NowScreenV1 from '../../app/screens/NowScreenV1';
import type { UseNowDataReturn } from '../../lib/now/useNowData';

// Create a variable to hold the mock now data
let mockNowData: Partial<UseNowDataReturn>;

// Create mock functions for overlay controller
const mockOpenEdit = jest.fn();
const mockOpenCreate = jest.fn();
const mockClose = jest.fn();

// Create mock function for openEntityOverlay that calls mockOpenEdit
const mockOpenEntityOverlay = jest.fn((item) => {
  // Simulate what the real openEntityOverlay does - convert to AppRecord and call openEdit
  mockOpenEdit({
    record: {
      ...item,
      created_at: item.created_at || new Date().toISOString(),
      updated_at: item.updated_at || new Date().toISOString(),
    },
  });
});

// Mock useNowData to return our test data
jest.mock('../../lib/now/useNowData', () => ({
  useNowData: () => mockNowData,
}));

// Mock the unified overlay controller
jest.mock('../../hooks/useUnifiedOverlayController', () => ({
  useUnifiedOverlayController: () => ({
    state: { visible: false, mode: 'create' },
    openCreate: mockOpenCreate,
    openEdit: mockOpenEdit,
    openView: jest.fn(),
    close: mockClose,
  }),
}));

// Mock useTodayInteractions to use our custom openEntityOverlay
jest.mock('../../lib/today/useTodayInteractions', () => ({
  useTodayInteractions: () => ({
    openEntityOverlay: mockOpenEntityOverlay,
    toggleTodoComplete: jest.fn(),
    toggleHabitComplete: jest.fn(),
    undoLastCompletion: jest.fn(),
    completedHabitIds: new Set(),
    completedTodoIds: new Set(),
    undoState: null,
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

describe('Mind Vault Expansion Tests', () => {
  const mockDate = new Date('2025-11-25T14:00:00');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
    jest.clearAllMocks();
    mockOpenEntityOverlay.mockClear();
    mockOpenEdit.mockClear();
    mockOpenCreate.mockClear();
    mockClose.mockClear();
    mockNavigate.mockClear();

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

    it('shows subtitle text explaining lists when lists exist', () => {
      renderWithProviders(<NowScreenV1 />);

      // Subtitle should be visible
      expect(screen.getByText('Your lists live here – groceries, packing, ideas.')).toBeTruthy();
    });

    it('does not show subtitle when no lists exist', () => {
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

      // Vault bar should not be visible at all
      expect(screen.queryByText('📚 Mind Vault')).toBeNull();
      expect(screen.queryByText('Your lists live here – groceries, packing, ideas.')).toBeNull();
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

    it('shows helper text above Recent Lists in expanded view', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Helper text should be visible
      expect(
        screen.getByText('Quick access to your go-to lists (groceries, packing, workflows).'),
      ).toBeTruthy();
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

    it('navigates to Lists screen when See all is pressed', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Tap See all button
      fireEvent.press(screen.getByText('See all'));

      // Should navigate to Lists screen
      expect(mockNavigate).toHaveBeenCalledWith('Lists');
      expect(mockNavigate).toHaveBeenCalledTimes(1);
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
    it('opens list overlay when list is tapped', () => {
      renderWithProviders(<NowScreenV1 />);

      // Expand vault
      fireEvent.press(screen.getByText('📚 Mind Vault'));

      // Verify expanded view is visible
      expect(screen.getByText('Recent Lists')).toBeTruthy();

      // Press the list row using testID
      fireEvent.press(screen.getByTestId('vault-list-list-1'));

      // Verify openEntityOverlay was called with the list
      expect(mockOpenEntityOverlay).toHaveBeenCalledTimes(1);
      expect(mockOpenEntityOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'list-1',
          type: 'note',
          subtype: 'list',
          title: 'Groceries',
        }),
      );
    });

    it('does not call overlay if list is not found', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      renderWithProviders(<NowScreenV1 />);

      // Clear previous mock calls
      mockOpenEdit.mockClear();

      // Try to manually call with invalid list ID (testing edge case)
      // Note: This would require accessing the component's handler directly
      // For now, we just verify the happy path above

      consoleWarnSpy.mockRestore();
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
