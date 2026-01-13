/**
 * useDayBoundaryWatcher Tests
 *
 * Tests for the day boundary detection hook that refreshes ritual progress
 * when the app is foregrounded after crossing a day boundary.
 */

import { AppState } from 'react-native';

// Store the original addEventListener to restore later
const originalAddEventListener = AppState.addEventListener;

// Track AppState listeners
type AppStateCallback = (state: 'active' | 'background' | 'inactive') => void;
let appStateCallback: AppStateCallback | null = null;
const mockRemove = jest.fn();

// Mock getRitualDay
const mockGetRitualDay = jest.fn<string, [number, string]>(() => '2026-01-12');
jest.mock('../../../date/ritualDay', () => ({
  getRitualDay: (hour: number, tz: string) => mockGetRitualDay(hour, tz),
}));

// Mock the store
const mockRefreshRitualProgress = jest.fn();
const mockStoreState: {
  todayRitualDay: string | null;
  dayBoundaryHour: number;
  userTimezone: string;
  refreshRitualProgress: jest.Mock;
} = {
  todayRitualDay: '2026-01-12',
  dayBoundaryHour: 4,
  userTimezone: 'America/New_York',
  refreshRitualProgress: mockRefreshRitualProgress,
};

jest.mock('../../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => mockStoreState,
  },
}));

// Import after mocks
import useDayBoundaryWatcher from '../useDayBoundaryWatcher';
import { renderHook } from '@testing-library/react-native';

describe('useDayBoundaryWatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateCallback = null;
    mockGetRitualDay.mockReturnValue('2026-01-12');
    mockStoreState.todayRitualDay = '2026-01-12';
    mockStoreState.dayBoundaryHour = 4;
    mockStoreState.userTimezone = 'America/New_York';

    // Mock AppState.addEventListener before each test
    (AppState.addEventListener as jest.Mock) = jest.fn(
      (event: string, callback: AppStateCallback) => {
        appStateCallback = callback;
        return { remove: mockRemove };
      },
    );
  });

  afterEach(() => {
    // Restore original
    AppState.addEventListener = originalAddEventListener;
  });

  describe('listener setup', () => {
    it('adds AppState change listener on mount', () => {
      renderHook(() => useDayBoundaryWatcher());

      expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('removes listener on unmount', () => {
      const { unmount } = renderHook(() => useDayBoundaryWatcher());

      unmount();

      expect(mockRemove).toHaveBeenCalled();
    });
  });

  describe('day boundary detection', () => {
    it('does nothing when app becomes active and day has not changed', () => {
      renderHook(() => useDayBoundaryWatcher());

      // Simulate app coming to foreground - same day
      appStateCallback?.('active');

      expect(mockRefreshRitualProgress).not.toHaveBeenCalled();
    });

    it('calls refreshRitualProgress when day has changed', () => {
      // Store has old day
      mockStoreState.todayRitualDay = '2026-01-11';
      // getRitualDay returns new day
      mockGetRitualDay.mockReturnValue('2026-01-12');

      renderHook(() => useDayBoundaryWatcher());

      // Simulate app coming to foreground
      appStateCallback?.('active');

      expect(mockRefreshRitualProgress).toHaveBeenCalled();
    });

    it('does nothing when todayRitualDay is null/undefined', () => {
      mockStoreState.todayRitualDay = null;
      mockGetRitualDay.mockReturnValue('2026-01-12');

      renderHook(() => useDayBoundaryWatcher());

      appStateCallback?.('active');

      expect(mockRefreshRitualProgress).not.toHaveBeenCalled();
    });

    it('does nothing when app state is background', () => {
      mockStoreState.todayRitualDay = '2026-01-11';
      mockGetRitualDay.mockReturnValue('2026-01-12');

      renderHook(() => useDayBoundaryWatcher());

      appStateCallback?.('background');

      expect(mockRefreshRitualProgress).not.toHaveBeenCalled();
    });

    it('does nothing when app state is inactive', () => {
      mockStoreState.todayRitualDay = '2026-01-11';
      mockGetRitualDay.mockReturnValue('2026-01-12');

      renderHook(() => useDayBoundaryWatcher());

      appStateCallback?.('inactive');

      expect(mockRefreshRitualProgress).not.toHaveBeenCalled();
    });

    it('uses dayBoundaryHour and userTimezone from store', () => {
      mockStoreState.dayBoundaryHour = 5;
      mockStoreState.userTimezone = 'Europe/London';

      renderHook(() => useDayBoundaryWatcher());

      appStateCallback?.('active');

      expect(mockGetRitualDay).toHaveBeenCalledWith(5, 'Europe/London');
    });
  });

  describe('console logging', () => {
    it('logs when day boundary is crossed', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockStoreState.todayRitualDay = '2026-01-11';
      mockGetRitualDay.mockReturnValue('2026-01-12');

      renderHook(() => useDayBoundaryWatcher());

      appStateCallback?.('active');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DayBoundaryWatcher] Day changed from 2026-01-11 to 2026-01-12, refreshing...',
      );

      consoleSpy.mockRestore();
    });
  });
});
