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
});
