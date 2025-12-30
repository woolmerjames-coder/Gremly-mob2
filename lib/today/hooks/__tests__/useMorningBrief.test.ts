/**
 * Tests for useMorningBrief hook
 *
 * Validates Morning Brief sequence management functionality.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useMorningBrief } from '../useMorningBrief';
import { useGremlyStore } from '../../../store/useGremlyStore';
import type { DailyBrief, SequencedItem } from '../../../types';

// Mock the store
jest.mock('../../../store/useGremlyStore');

const mockUseGremlyStore = useGremlyStore as jest.MockedFunction<typeof useGremlyStore>;

// Helper to get today's date string
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

describe('useMorningBrief', () => {
  const mockSaveBrief = jest.fn();
  const mockClearBrief = jest.fn();
  const mockFetchTodayBrief = jest.fn();

  const mockSequencedItem: SequencedItem = {
    id: 'test-item-1',
    type: 'todo',
  };

  const mockBrief: DailyBrief = {
    id: 'brief-1',
    owner_id: 'user-1',
    date: getTodayDateString(),
    one_thing_id: null,
    one_thing_type: null,
    morning_sequence: [mockSequencedItem],
    day_sequence: [],
    evening_sequence: [],
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default store mock implementation
    mockUseGremlyStore.mockImplementation((selector: any) => {
      const state = {
        dailyBrief: null as DailyBrief | null,
        dailyBriefLoading: false,
        saveBrief: mockSaveBrief,
        clearBrief: mockClearBrief,
        fetchTodayBrief: mockFetchTodayBrief,
      };
      return selector(state);
    });
  });

  describe('initial state', () => {
    it('returns null brief when no brief exists', () => {
      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.brief).toBeNull();
      expect(result.current.loading).toBe(false);
      expect(result.current.hasCompletedBriefToday).toBe(false);
    });

    it('returns empty sequences when no brief exists', () => {
      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.morningSequence).toEqual([]);
      expect(result.current.daySequence).toEqual([]);
      expect(result.current.eveningSequence).toEqual([]);
    });

    it('returns loading true when store is loading', () => {
      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          dailyBrief: null,
          dailyBriefLoading: true,
          saveBrief: mockSaveBrief,
          clearBrief: mockClearBrief,
          fetchTodayBrief: mockFetchTodayBrief,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.loading).toBe(true);
    });
  });

  describe('hasCompletedBriefToday', () => {
    it('returns true when brief date matches today', () => {
      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          dailyBrief: mockBrief, // Has today's date
          dailyBriefLoading: false,
          saveBrief: mockSaveBrief,
          clearBrief: mockClearBrief,
          fetchTodayBrief: mockFetchTodayBrief,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.hasCompletedBriefToday).toBe(true);
    });

    it('returns false when brief date is different from today', () => {
      const oldBrief: DailyBrief = {
        ...mockBrief,
        date: '2020-01-01', // Way in the past
      };

      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          dailyBrief: oldBrief,
          dailyBriefLoading: false,
          saveBrief: mockSaveBrief,
          clearBrief: mockClearBrief,
          fetchTodayBrief: mockFetchTodayBrief,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.hasCompletedBriefToday).toBe(false);
    });

    it('returns false when brief is null', () => {
      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.hasCompletedBriefToday).toBe(false);
    });
  });

  describe('sequences', () => {
    it('returns morning sequence from brief', () => {
      const briefWithMorning: DailyBrief = {
        ...mockBrief,
        morning_sequence: [
          { id: 'item-1', type: 'todo' },
          { id: 'item-2', type: 'habit' },
        ],
      };

      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          dailyBrief: briefWithMorning,
          dailyBriefLoading: false,
          saveBrief: mockSaveBrief,
          clearBrief: mockClearBrief,
          fetchTodayBrief: mockFetchTodayBrief,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.morningSequence).toHaveLength(2);
      expect(result.current.morningSequence[0].id).toBe('item-1');
    });

    it('returns day sequence from brief', () => {
      const briefWithDay: DailyBrief = {
        ...mockBrief,
        day_sequence: [{ id: 'day-item', type: 'todo' }],
      };

      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          dailyBrief: briefWithDay,
          dailyBriefLoading: false,
          saveBrief: mockSaveBrief,
          clearBrief: mockClearBrief,
          fetchTodayBrief: mockFetchTodayBrief,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.daySequence).toHaveLength(1);
      expect(result.current.daySequence[0].id).toBe('day-item');
    });

    it('returns evening sequence from brief', () => {
      const briefWithEvening: DailyBrief = {
        ...mockBrief,
        evening_sequence: [{ id: 'evening-item', type: 'habit' }],
      };

      mockUseGremlyStore.mockImplementation((selector: any) => {
        const state = {
          dailyBrief: briefWithEvening,
          dailyBriefLoading: false,
          saveBrief: mockSaveBrief,
          clearBrief: mockClearBrief,
          fetchTodayBrief: mockFetchTodayBrief,
        };
        return selector(state);
      });

      const { result } = renderHook(() => useMorningBrief());

      expect(result.current.eveningSequence).toHaveLength(1);
      expect(result.current.eveningSequence[0].id).toBe('evening-item');
    });
  });

  describe('saveBrief', () => {
    it('calls store saveBrief with provided sequences', async () => {
      mockSaveBrief.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMorningBrief());

      await act(async () => {
        await result.current.saveBrief({
          morning_sequence: [mockSequencedItem],
          day_sequence: [],
          evening_sequence: [],
        });
      });

      expect(mockSaveBrief).toHaveBeenCalledWith({
        morning_sequence: [mockSequencedItem],
        day_sequence: [],
        evening_sequence: [],
      });
    });

    it('uses empty arrays for omitted sequences', async () => {
      mockSaveBrief.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMorningBrief());

      await act(async () => {
        await result.current.saveBrief({
          morning_sequence: [mockSequencedItem],
        });
      });

      expect(mockSaveBrief).toHaveBeenCalledWith({
        morning_sequence: [mockSequencedItem],
        day_sequence: [],
        evening_sequence: [],
      });
    });
  });

  describe('clearBrief', () => {
    it('calls store clearBrief action', async () => {
      mockClearBrief.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMorningBrief());

      await act(async () => {
        await result.current.clearBrief();
      });

      expect(mockClearBrief).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('calls store fetchTodayBrief action', async () => {
      mockFetchTodayBrief.mockResolvedValue(undefined);

      const { result } = renderHook(() => useMorningBrief());

      await act(async () => {
        await result.current.refresh();
      });

      expect(mockFetchTodayBrief).toHaveBeenCalled();
    });
  });
});
