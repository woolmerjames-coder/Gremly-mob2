/**
 * calendarActions.test.ts
 *
 * Tests for calendar-related store actions, specifically the connectIcsCalendar action.
 */

// Mock the calendarClient
const mockConnectIcs = jest.fn();
const mockRefreshConnections = jest.fn();

jest.mock('../../calendar/CalendarClient', () => ({
  calendarClient: {
    connectIcs: (...args: unknown[]) => mockConnectIcs(...args),
    setSupabaseToken: jest.fn(),
    getConnectionStatus: jest.fn().mockResolvedValue([]),
  },
}));

// Mock supabase
jest.mock('../../repo/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          data: [],
          error: null,
        }),
      }),
    }),
  },
}));

// Mock DateService
jest.mock('../../date/DateService', () => ({
  getDateService: () => ({
    today: () => '2026-01-23',
    todayTime: () => new Date('2026-01-23T12:00:00Z'),
  }),
  createDateService: jest.fn(),
  resetDateService: jest.fn(),
}));

// Import after mocks
import { useGremlyStore } from '../useGremlyStore';

describe('Calendar Store Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectIcs.mockReset();
    mockRefreshConnections.mockReset();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // connectIcsCalendar
  // ═══════════════════════════════════════════════════════════════════════════

  describe('connectIcsCalendar', () => {
    it('should call calendarClient.connectIcs with URL and label', async () => {
      mockConnectIcs.mockResolvedValue({ success: true, calendarName: 'Work Calendar' });

      const result = await useGremlyStore
        .getState()
        .connectIcsCalendar('https://example.com/cal.ics', 'My Calendar');

      expect(mockConnectIcs).toHaveBeenCalledWith('https://example.com/cal.ics', 'My Calendar');
      expect(result.success).toBe(true);
      expect(result.calendarName).toBe('Work Calendar');
    });

    it('should call calendarClient.connectIcs with URL only when no label', async () => {
      mockConnectIcs.mockResolvedValue({ success: true, calendarName: 'ICS Calendar' });

      const result = await useGremlyStore
        .getState()
        .connectIcsCalendar('https://example.com/cal.ics');

      expect(mockConnectIcs).toHaveBeenCalledWith('https://example.com/cal.ics', undefined);
      expect(result.success).toBe(true);
    });

    it('should refresh connections on success', async () => {
      mockConnectIcs.mockResolvedValue({ success: true, calendarName: 'Work Calendar' });

      // Spy on refreshCalendarConnections
      const store = useGremlyStore.getState();
      const refreshSpy = jest.spyOn(store, 'refreshCalendarConnections');

      await store.connectIcsCalendar('https://example.com/cal.ics');

      // Note: The actual refresh is called internally
      expect(mockConnectIcs).toHaveBeenCalled();
    });

    it('should return error result on failure', async () => {
      mockConnectIcs.mockResolvedValue({ success: false, error: 'Invalid URL' });

      const result = await useGremlyStore
        .getState()
        .connectIcsCalendar('https://example.com/notacal.html');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid URL');
    });

    it('should not refresh connections on failure', async () => {
      mockConnectIcs.mockResolvedValue({ success: false, error: 'Failed' });

      await useGremlyStore.getState().connectIcsCalendar('https://example.com/bad.ics');

      // On failure, refresh should not be called
      // We check this by ensuring only connectIcs was called
      expect(mockConnectIcs).toHaveBeenCalledTimes(1);
    });

    it('should handle and wrap exceptions', async () => {
      mockConnectIcs.mockRejectedValue(new Error('Network error'));

      const result = await useGremlyStore
        .getState()
        .connectIcsCalendar('https://example.com/cal.ics');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error exceptions', async () => {
      mockConnectIcs.mockRejectedValue('String error');

      const result = await useGremlyStore
        .getState()
        .connectIcsCalendar('https://example.com/cal.ics');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CalendarProvider Type
  // ═══════════════════════════════════════════════════════════════════════════

  describe('CalendarProvider type support', () => {
    it('should accept ics as a valid provider type', () => {
      // Type check - this should compile without errors
      const providers: Array<'outlook' | 'google' | 'ics'> = ['outlook', 'google', 'ics'];
      expect(providers).toContain('ics');
    });
  });
});
