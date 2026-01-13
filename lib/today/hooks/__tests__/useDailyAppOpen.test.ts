/**
 * useDailyAppOpen Tests
 *
 * Tests for the first-open detection hook used by Morning Brief.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDailyAppOpen } from '../useDailyAppOpen';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock getRitualDay to return predictable values
const mockGetRitualDay = jest.fn<string, [number, string | null]>(() => '2026-01-12');
jest.mock('../../../date/ritualDay', () => ({
  getRitualDay: (hour: number, tz: string | null) => mockGetRitualDay(hour, tz),
}));

// Mock the store
jest.mock('../../../store/useGremlyStore', () => ({
  useGremlyStore: {
    getState: () => ({
      dayBoundaryHour: 4,
      userTimezone: 'America/New_York',
    }),
  },
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Storage key v2 uses ritual day
const STORAGE_KEY = '@gremly/last_app_open_date_v2';

describe('useDailyAppOpen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRitualDay.mockReturnValue('2026-01-12');
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
    mockAsyncStorage.removeItem.mockResolvedValue(undefined);
  });

  describe('initial state', () => {
    it('starts with isChecking true', () => {
      const { result } = renderHook(() => useDailyAppOpen());
      expect(result.current.isChecking).toBe(true);
    });
  });

  describe('first open detection', () => {
    it('returns isFirstOpenToday true when no previous record', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isChecking).toBe(false);
      });

      expect(result.current.isFirstOpenToday).toBe(true);
    });

    it('returns isFirstOpenToday true when last open was a different day', async () => {
      // Use a date that is definitely not today
      mockAsyncStorage.getItem.mockResolvedValue('2020-01-01'); // Way in the past

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isChecking).toBe(false);
      });

      expect(result.current.isFirstOpenToday).toBe(true);
    });

    it('returns isFirstOpenToday false when opened same day', async () => {
      // Mock that today's ritual day was already opened
      mockAsyncStorage.getItem.mockResolvedValue('2026-01-12');

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isChecking).toBe(false);
      });

      expect(result.current.isFirstOpenToday).toBe(false);
    });
  });

  describe('markTodayOpened', () => {
    it('persists today date to AsyncStorage', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isChecking).toBe(false);
      });

      await act(async () => {
        await result.current.markTodayOpened();
      });

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        '2026-01-12', // The mocked ritual day
      );
    });

    it('sets isFirstOpenToday to false after marking', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isFirstOpenToday).toBe(true);
      });

      await act(async () => {
        await result.current.markTodayOpened();
      });

      expect(result.current.isFirstOpenToday).toBe(false);
    });
  });

  describe('resetForTesting', () => {
    it('clears AsyncStorage and sets isFirstOpenToday to true', async () => {
      // Start with today already opened
      mockAsyncStorage.getItem.mockResolvedValue('2026-01-12');

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isFirstOpenToday).toBe(false);
      });

      await act(async () => {
        await result.current.resetForTesting();
      });

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
      expect(result.current.isFirstOpenToday).toBe(true);
    });
  });

  describe('error handling', () => {
    it('handles AsyncStorage read error gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isChecking).toBe(false);
      });

      // Should default to false on error
      expect(result.current.isFirstOpenToday).toBe(false);
    });

    it('handles markTodayOpened error gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isChecking).toBe(false);
      });

      // Should not throw
      await act(async () => {
        await result.current.markTodayOpened();
      });
    });
  });
});
