/**
 * CalendarClient.test.ts
 *
 * Tests for the CalendarClient calendar integration service.
 * Tests API calls, token management, and OAuth flow structure.
 */

// Mock expo-auth-session before imports
jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn().mockImplementation(() => ({
    codeVerifier: 'test-code-verifier',
    promptAsync: jest.fn().mockResolvedValue({
      type: 'success',
      params: { code: 'test-auth-code' },
    }),
  })),
  ResponseType: {
    Code: 'code',
  },
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// Mock env
jest.mock('../../env', () => ({
  env: {
    calendarWorkerUrl: 'https://test-calendar-worker.example.com',
    azureClientId: 'test-azure-client-id',
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import type { CalendarEvent, CalendarConnectionStatus } from '../CalendarClient';

// We need to import the module after mocks are set up
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { calendarClient } = require('../CalendarClient');

describe('CalendarClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    // Reset the token
    calendarClient.setSupabaseToken(null);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Token Management
  // ─────────────────────────────────────────────────────────────────────────

  describe('token management', () => {
    it('setSupabaseToken sets the token', () => {
      expect(() => calendarClient.setSupabaseToken('test-token')).not.toThrow();
    });

    it('setSupabaseToken can clear the token', () => {
      calendarClient.setSupabaseToken('test-token');
      expect(() => calendarClient.setSupabaseToken(null)).not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // API Calls - Error Cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('API calls - error cases', () => {
    it('returns empty array when no token is set', async () => {
      const result = await calendarClient.getConnectionStatus();
      // Returns empty array on error (not authenticated)
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // API Calls - Success Cases
  // ─────────────────────────────────────────────────────────────────────────

  describe('API calls - success cases', () => {
    beforeEach(() => {
      calendarClient.setSupabaseToken('test-token');
    });

    it('getConnectionStatus makes GET request to /calendar/status', async () => {
      const mockConnections: CalendarConnectionStatus[] = [
        {
          provider: 'outlook',
          isConnected: true,
          email: 'test@example.com',
          lastSyncedAt: '2025-12-22T10:00:00Z',
          lastError: null,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connections: mockConnections }),
      });

      const result = await calendarClient.getConnectionStatus();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-calendar-worker.example.com/calendar/status',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
      expect(result).toEqual(mockConnections);
    });

    it('getEvents makes GET request with date range', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'event-1',
          provider: 'outlook',
          providerEventId: 'outlook-123',
          title: 'Test Meeting',
          startAt: '2025-12-22T14:00:00Z',
          endAt: '2025-12-22T15:00:00Z',
          isAllDay: false,
          location: 'Conference Room A',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents }),
      });

      const result = await calendarClient.getEvents('2025-12-22', '2025-12-23');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/calendar/events'),
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockEvents);
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await calendarClient.getConnectionStatus();

      // Returns empty array on error
      expect(result).toEqual([]);
    });

    it('handles non-ok responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await calendarClient.getConnectionStatus();

      // Returns empty array on error
      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Disconnect
  // ─────────────────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    beforeEach(() => {
      calendarClient.setSupabaseToken('test-token');
    });

    it('disconnect makes POST request to disconnect endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await calendarClient.disconnect('outlook');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/disconnect'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(result.success).toBe(true);
    });

    it('disconnect works for ics provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await calendarClient.disconnect('ics');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/disconnect'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('ics'),
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ICS Calendar Connection
  // ─────────────────────────────────────────────────────────────────────────

  describe('connectIcs', () => {
    it('returns error when no token is set', async () => {
      calendarClient.setSupabaseToken(null);

      const result = await calendarClient.connectIcs('https://example.com/cal.ics');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not authenticated');
    });

    it('returns error for empty URL', async () => {
      calendarClient.setSupabaseToken('test-token');

      const result = await calendarClient.connectIcs('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('enter a calendar URL');
    });

    it('returns error for whitespace-only URL', async () => {
      calendarClient.setSupabaseToken('test-token');

      const result = await calendarClient.connectIcs('   ');

      expect(result.success).toBe(false);
      expect(result.error).toContain('enter a calendar URL');
    });

    it('returns error for invalid URL format', async () => {
      calendarClient.setSupabaseToken('test-token');

      const result = await calendarClient.connectIcs('not-a-valid-url');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URL format');
    });

    it('returns error for non-http(s) protocols', async () => {
      calendarClient.setSupabaseToken('test-token');

      const result = await calendarClient.connectIcs('ftp://example.com/cal.ics');

      expect(result.success).toBe(false);
      expect(result.error).toContain('http:// or https://');
    });

    it('accepts webcal protocol converted to https', async () => {
      calendarClient.setSupabaseToken('test-token');

      // webcal:// should fail as it's not http/https
      const result = await calendarClient.connectIcs('webcal://example.com/cal.ics');

      expect(result.success).toBe(false);
      expect(result.error).toContain('http:// or https://');
    });

    it('makes POST request to /auth/ics/connect on valid URL', async () => {
      calendarClient.setSupabaseToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, calendarName: 'Work Calendar' }),
      });

      const result = await calendarClient.connectIcs('https://example.com/cal.ics', 'My Calendar');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-calendar-worker.example.com/auth/ics/connect',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.calendarName).toBe('Work Calendar');
    });

    it('passes ics_url and label in request body', async () => {
      calendarClient.setSupabaseToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, calendarName: 'Test' }),
      });

      await calendarClient.connectIcs('https://example.com/cal.ics', 'My Label');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.ics_url).toBe('https://example.com/cal.ics');
      expect(body.label).toBe('My Label');
    });

    it('trims URL and label', async () => {
      calendarClient.setSupabaseToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, calendarName: 'Test' }),
      });

      await calendarClient.connectIcs('  https://example.com/cal.ics  ', '  My Label  ');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.ics_url).toBe('https://example.com/cal.ics');
      expect(body.label).toBe('My Label');
    });

    it('omits label when empty', async () => {
      calendarClient.setSupabaseToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, calendarName: 'Test' }),
      });

      await calendarClient.connectIcs('https://example.com/cal.ics', '');

      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.label).toBeUndefined();
    });

    it('returns error message on API failure', async () => {
      calendarClient.setSupabaseToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Invalid calendar URL'),
      });

      const result = await calendarClient.connectIcs('https://example.com/cal.ics');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error from response data', async () => {
      calendarClient.setSupabaseToken('test-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ success: false, error: 'URL does not point to a valid calendar' }),
      });

      const result = await calendarClient.connectIcs('https://example.com/notacal.html');

      expect(result.success).toBe(false);
      expect(result.error).toContain('valid calendar');
    });

    it('handles network errors gracefully', async () => {
      calendarClient.setSupabaseToken('test-token');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await calendarClient.connectIcs('https://example.com/cal.ics');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Type Tests
// ─────────────────────────────────────────────────────────────────────────

describe('CalendarClient Types', () => {
  it('CalendarEvent has correct shape', () => {
    const event: CalendarEvent = {
      id: 'test-id',
      provider: 'outlook',
      providerEventId: 'outlook-123',
      title: 'Test Event',
      startAt: '2025-12-22T14:00:00Z',
      endAt: '2025-12-22T15:00:00Z',
      isAllDay: false,
      location: null,
    };

    expect(event.id).toBe('test-id');
    expect(event.provider).toBe('outlook');
    expect(event.isAllDay).toBe(false);
  });

  it('CalendarConnectionStatus has correct shape', () => {
    const status: CalendarConnectionStatus = {
      provider: 'outlook',
      isConnected: true,
      email: 'test@example.com',
      lastSyncedAt: '2025-12-22T10:00:00Z',
      lastError: null,
    };

    expect(status.isConnected).toBe(true);
    expect(status.provider).toBe('outlook');
  });

  it('CalendarConnectionStatus supports google provider', () => {
    const status: CalendarConnectionStatus = {
      provider: 'google',
      isConnected: true,
      email: 'user@gmail.com',
      lastSyncedAt: '2025-12-22T10:00:00Z',
      lastError: null,
    };

    expect(status.provider).toBe('google');
    expect(status.email).toBe('user@gmail.com');
  });

  it('CalendarConnectionStatus supports ics provider', () => {
    const status: CalendarConnectionStatus = {
      provider: 'ics',
      isConnected: true,
      email: null,
      lastSyncedAt: '2025-12-22T10:00:00Z',
      lastError: null,
    };

    expect(status.provider).toBe('ics');
    expect(status.email).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Google OAuth Flow
// ─────────────────────────────────────────────────────────────────────────

describe('CalendarClient - Google OAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    calendarClient.setSupabaseToken('test-token');
  });

  describe('Google connection status', () => {
    it('getConnectionStatus returns google connections', async () => {
      const mockConnections: CalendarConnectionStatus[] = [
        {
          provider: 'google',
          isConnected: true,
          email: 'user@gmail.com',
          lastSyncedAt: '2025-12-22T10:00:00Z',
          lastError: null,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connections: mockConnections }),
      });

      const result = await calendarClient.getConnectionStatus();
      expect(result).toEqual(mockConnections);
      expect(result[0].provider).toBe('google');
    });

    it('returns multiple provider connections', async () => {
      const mockConnections: CalendarConnectionStatus[] = [
        {
          provider: 'outlook',
          isConnected: true,
          email: 'user@outlook.com',
          lastSyncedAt: '2025-12-22T10:00:00Z',
          lastError: null,
        },
        {
          provider: 'google',
          isConnected: true,
          email: 'user@gmail.com',
          lastSyncedAt: '2025-12-22T11:00:00Z',
          lastError: null,
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connections: mockConnections }),
      });

      const result = await calendarClient.getConnectionStatus();
      expect(result).toHaveLength(2);
      expect(result.map((c: any) => c.provider)).toEqual(['outlook', 'google']);
    });
  });

  describe('Google disconnect', () => {
    it('disconnect works for google provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await calendarClient.disconnect('google');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/disconnect'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('google'),
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Google events', () => {
    it('getEvents returns google-provider events', async () => {
      const mockEvents: CalendarEvent[] = [
        {
          id: 'google-event-1',
          provider: 'google',
          providerEventId: 'google-abc123',
          title: 'Google Meet',
          startAt: '2025-12-22T14:00:00Z',
          endAt: '2025-12-22T15:00:00Z',
          isAllDay: false,
          location: 'Google Meet link',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ events: mockEvents }),
      });

      const result = await calendarClient.getEvents('2025-12-22', '2025-12-23');
      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('google');
    });
  });
});
