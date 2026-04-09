/**
 * Tests for useCalendarService hooks
 */

import { renderHook } from '@testing-library/react-native';

const mockGetEventsForDate = jest.fn().mockReturnValue([]);
const mockGetEventsForRange = jest.fn().mockReturnValue([]);
jest.mock('../CalendarService', () => ({
  getEventsForDate: (...args: any[]) => mockGetEventsForDate(...args),
  getEventsForRange: (...args: any[]) => mockGetEventsForRange(...args),
}));

jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: (selector: (s: any) => any) =>
    selector({
      calendarEvents: {},
      userCalendarEvents: [],
      notes: [],
      todos: [],
      habits: [],
    }),
}));

import { useCalendarEvents, useCalendarEventsForRange } from '../useCalendarService';

describe('useCalendarService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('useCalendarEvents', () => {
    it('calls getEventsForDate with the given date', () => {
      renderHook(() => useCalendarEvents('2025-12-15'));
      expect(mockGetEventsForDate).toHaveBeenCalledWith('2025-12-15', undefined);
    });

    it('passes options through to getEventsForDate', () => {
      renderHook(() => useCalendarEvents('2025-12-15', { includeTodos: true }));
      expect(mockGetEventsForDate).toHaveBeenCalledWith('2025-12-15', { includeTodos: true });
    });

    it('returns the result from getEventsForDate', () => {
      const mockItems = [{ id: '1', title: 'Event' }];
      mockGetEventsForDate.mockReturnValue(mockItems);

      const { result } = renderHook(() => useCalendarEvents('2025-12-15'));
      expect(result.current).toBe(mockItems);
    });
  });

  describe('useCalendarEventsForRange', () => {
    it('calls getEventsForRange with start and end dates', () => {
      renderHook(() => useCalendarEventsForRange('2025-12-15', '2025-12-21'));
      expect(mockGetEventsForRange).toHaveBeenCalledWith('2025-12-15', '2025-12-21', undefined);
    });

    it('passes options through to getEventsForRange', () => {
      renderHook(() =>
        useCalendarEventsForRange('2025-12-15', '2025-12-21', { includeHabits: true }),
      );
      expect(mockGetEventsForRange).toHaveBeenCalledWith('2025-12-15', '2025-12-21', {
        includeHabits: true,
      });
    });

    it('returns the result from getEventsForRange', () => {
      const mockItems = [
        { id: '1', title: 'Event' },
        { id: '2', title: 'Event 2' },
      ];
      mockGetEventsForRange.mockReturnValue(mockItems);

      const { result } = renderHook(() => useCalendarEventsForRange('2025-12-15', '2025-12-21'));
      expect(result.current).toBe(mockItems);
    });
  });
});
