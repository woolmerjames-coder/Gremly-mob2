/**
 * useDayRollover Tests
 *
 * Tests for the day rollover hook that detects calendar-day changes
 * via AppState resume and midnight timer, then calls handleDayRollover.
 */

import { AppState } from 'react-native';

// Store original
const originalAddEventListener = AppState.addEventListener;

// Track AppState listeners
type AppStateCallback = (state: 'active' | 'background' | 'inactive') => void;
let appStateCallback: AppStateCallback | null = null;
const mockRemove = jest.fn();

// Mock getDateService
const mockGetCurrentDate = jest.fn(() => '2025-12-15');
jest.mock('../../../date', () => ({
  getDateService: () => ({
    today: () => mockGetCurrentDate(),
    ritualDay: () => mockGetCurrentDate(),
    now: () => new Date(),
    getDayBoundaryHour: () => 4,
    getHour: () => new Date().getHours(),
    addDays: (date: string, days: number) => {
      const d = new Date(date + 'T00:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    },
  }),
}));

// Mock the store
const mockHandleDayRollover = jest.fn();
const mockRefreshFromServer = jest.fn();
const mockFetchCalendarEventsForRange = jest.fn();
jest.mock('../../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => ({
      currentDate: mockStoreCurrentDate,
      handleDayRollover: mockHandleDayRollover,
      userId: 'user-1',
      refreshFromServer: mockRefreshFromServer,
      fetchCalendarEventsForRange: mockFetchCalendarEventsForRange,
    }),
  },
}));

let mockStoreCurrentDate = '2025-12-15';

// Import after mocks
import { useDayRollover } from '../useDayRollover';
import { renderHook } from '@testing-library/react-native';

describe('useDayRollover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    appStateCallback = null;
    mockStoreCurrentDate = '2025-12-15';
    mockGetCurrentDate.mockReturnValue('2025-12-15');

    // Mock AppState.addEventListener
    (AppState.addEventListener as jest.Mock) = jest.fn(
      (event: string, callback: AppStateCallback) => {
        appStateCallback = callback;
        return { remove: mockRemove };
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    AppState.addEventListener = originalAddEventListener;
  });

  describe('listener setup', () => {
    it('adds AppState change listener on mount', () => {
      renderHook(() => useDayRollover());

      expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('removes listener on unmount', () => {
      const { unmount } = renderHook(() => useDayRollover());

      unmount();

      expect(mockRemove).toHaveBeenCalled();
    });
  });

  describe('AppState resume detection', () => {
    it('does nothing when app becomes active and date has not changed', () => {
      renderHook(() => useDayRollover());

      // Simulate foreground — same day
      appStateCallback?.('active');

      expect(mockHandleDayRollover).not.toHaveBeenCalled();
    });

    it('calls handleDayRollover when date has changed on background→active', () => {
      renderHook(() => useDayRollover());

      // Simulate date change
      mockGetCurrentDate.mockReturnValue('2025-12-16');

      appStateCallback?.('active');

      expect(mockHandleDayRollover).toHaveBeenCalledWith('2025-12-16');
    });

    it('does nothing on background or inactive state changes', () => {
      renderHook(() => useDayRollover());

      mockGetCurrentDate.mockReturnValue('2025-12-16');

      appStateCallback?.('background');
      appStateCallback?.('inactive');

      expect(mockHandleDayRollover).not.toHaveBeenCalled();
    });
  });

  describe('midnight timer', () => {
    it('arms a timer on mount', () => {
      renderHook(() => useDayRollover());

      // Timer should be set (setTimeout was called at least once)
      expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);
    });

    it('clears timer on unmount', () => {
      const { unmount } = renderHook(() => useDayRollover());

      expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);

      unmount();

      // All timers should be cleared
      expect(jest.getTimerCount()).toBe(0);
    });

    it('calls checkAndRollover when timer fires and date changed', () => {
      renderHook(() => useDayRollover());

      // Simulate date change at midnight
      mockGetCurrentDate.mockReturnValue('2025-12-16');

      // Advance past the midnight timer
      jest.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);

      expect(mockHandleDayRollover).toHaveBeenCalledWith('2025-12-16');
    });
  });
});
