/**
 * CalendarConnectionsCard.test.tsx
 *
 * Tests for the CalendarConnectionsCard component including ICS calendar support.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CalendarConnectionsCard from '../CalendarConnectionsCard';

// Mock Alert.alert
const mockAlertFn = jest.fn();
Alert.alert = mockAlertFn;

// Mock the store
const mockConnectCalendar = jest.fn();
const mockConnectIcsCalendar = jest.fn();
const mockDisconnectCalendar = jest.fn();
const mockRefreshCalendarConnections = jest.fn();

let mockConnections: Array<{
  provider: 'outlook' | 'google' | 'ics';
  isConnected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}> = [];
let mockLoading = false;

jest.mock('../../../lib/store/useGremlyStore', () => ({
  useGremlyStore: (selector: (state: unknown) => unknown) => {
    const state = {
      calendarConnections: mockConnections,
      calendarLoading: mockLoading,
      connectCalendar: mockConnectCalendar,
      connectIcsCalendar: mockConnectIcsCalendar,
      disconnectCalendar: mockDisconnectCalendar,
      refreshCalendarConnections: mockRefreshCalendarConnections,
    };
    return selector(state);
  },
}));

describe('CalendarConnectionsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnections = [];
    mockLoading = false;
    mockConnectIcsCalendar.mockResolvedValue({ success: true, calendarName: 'Test Calendar' });
    mockDisconnectCalendar.mockResolvedValue(undefined);
    mockRefreshCalendarConnections.mockResolvedValue(undefined);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Basic Rendering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('basic rendering', () => {
    it('renders the component title', () => {
      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText('Calendar Connections')).toBeTruthy();
    });

    it('renders helper text', () => {
      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText(/Connect your calendar/)).toBeTruthy();
    });

    it('refreshes connections on mount', () => {
      render(<CalendarConnectionsCard />);
      expect(mockRefreshCalendarConnections).toHaveBeenCalled();
    });

    it('shows loading state when loading with no connections', () => {
      mockLoading = true;
      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText('Loading connections...')).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Outlook Connection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Outlook connection', () => {
    it('shows Connect Outlook button when not connected', () => {
      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText('Connect Outlook')).toBeTruthy();
    });

    it('shows connected state with email when connected', () => {
      mockConnections = [
        {
          provider: 'outlook',
          isConnected: true,
          email: 'user@example.com',
          lastSyncedAt: null,
          lastError: null,
        },
      ];

      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText('Outlook')).toBeTruthy();
      expect(getByText('user@example.com')).toBeTruthy();
    });

    it('calls connectCalendar when Connect Outlook pressed', async () => {
      mockConnectCalendar.mockResolvedValue({ success: true });
      const { getByText } = render(<CalendarConnectionsCard />);

      await act(async () => {
        fireEvent.press(getByText('Connect Outlook'));
      });

      expect(mockConnectCalendar).toHaveBeenCalledWith('outlook');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Google Calendar Connection
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Google calendar connection', () => {
    it('shows Connect Google Calendar button when not connected', () => {
      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText('Connect Google Calendar')).toBeTruthy();
    });

    it('calls connectCalendar with google when pressed', async () => {
      mockConnectCalendar.mockResolvedValue({ success: true });
      const { getByText } = render(<CalendarConnectionsCard />);

      await act(async () => {
        fireEvent.press(getByText('Connect Google Calendar'));
      });

      expect(mockConnectCalendar).toHaveBeenCalledWith('google');
    });

    it('shows connected Google state with email', () => {
      mockConnections = [
        {
          provider: 'google',
          isConnected: true,
          email: 'user@gmail.com',
          lastSyncedAt: '2026-02-09T10:00:00Z',
          lastError: null,
        },
      ];

      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText('Google')).toBeTruthy();
      expect(getByText('user@gmail.com')).toBeTruthy();
    });

    it('shows Disconnect button for connected Google', () => {
      mockConnections = [
        {
          provider: 'google',
          isConnected: true,
          email: 'user@gmail.com',
          lastSyncedAt: null,
          lastError: null,
        },
      ];

      const { getByLabelText } = render(<CalendarConnectionsCard />);
      expect(getByLabelText('Disconnect Google Calendar')).toBeTruthy();
    });

    it('calls disconnectCalendar when Google disconnect pressed', async () => {
      mockConnections = [
        {
          provider: 'google',
          isConnected: true,
          email: 'user@gmail.com',
          lastSyncedAt: null,
          lastError: null,
        },
      ];

      const { getByLabelText } = render(<CalendarConnectionsCard />);

      await act(async () => {
        fireEvent.press(getByLabelText('Disconnect Google Calendar'));
      });

      expect(mockDisconnectCalendar).toHaveBeenCalledWith('google');
    });

    it('shows error alert on failed Google connection', async () => {
      mockConnectCalendar.mockResolvedValue({
        success: false,
        error: 'User cancelled the login',
      });

      const { getByText } = render(<CalendarConnectionsCard />);

      await act(async () => {
        fireEvent.press(getByText('Connect Google Calendar'));
      });

      await waitFor(() => {
        expect(mockAlertFn).toHaveBeenCalledWith('Connection Failed', 'User cancelled the login');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Multiple Connections
  // ═══════════════════════════════════════════════════════════════════════════

  describe('multiple connections', () => {
    it('shows both Outlook and Google when connected', () => {
      mockConnections = [
        {
          provider: 'outlook',
          isConnected: true,
          email: 'user@outlook.com',
          lastSyncedAt: null,
          lastError: null,
        },
        {
          provider: 'google',
          isConnected: true,
          email: 'user@gmail.com',
          lastSyncedAt: null,
          lastError: null,
        },
      ];

      const { getByText } = render(<CalendarConnectionsCard />);
      expect(getByText('Outlook')).toBeTruthy();
      expect(getByText('user@outlook.com')).toBeTruthy();
      expect(getByText('Google')).toBeTruthy();
      expect(getByText('user@gmail.com')).toBeTruthy();
    });
  });
});
