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

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('useDailyAppOpen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      // Mock today's date
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      mockAsyncStorage.getItem.mockResolvedValue(todayStr);

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
        '@gremly/last_app_open_date',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
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
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      mockAsyncStorage.getItem.mockResolvedValue(todayStr);

      const { result } = renderHook(() => useDailyAppOpen());

      await waitFor(() => {
        expect(result.current.isFirstOpenToday).toBe(false);
      });

      await act(async () => {
        await result.current.resetForTesting();
      });

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@gremly/last_app_open_date');
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
