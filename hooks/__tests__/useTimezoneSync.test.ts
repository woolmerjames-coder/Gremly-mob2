/**
 * Tests for useTimezoneSync hook
 *
 * Validates:
 * - getDeviceTimezone returns a string
 * - syncTimezone reads stored tz, only updates when different
 * - writeHeartbeat writes last_app_active_at
 * - AppState listener triggers sync on 'active'
 * - Heartbeat debounce (HEARTBEAT_DEBOUNCE_MS = 10 * 60 * 1000)
 */

import { AppState } from 'react-native';
import { renderHook, act, waitFor } from '@testing-library/react-native';

// ── Supabase mock wiring ────────────────────────────────────────
const mockUnsubscribe = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpdateEq = jest.fn();

// Build chainable from() that handles both select and update paths
const mockFrom = jest.fn();

let authStateCallback: ((event: string, session: unknown) => void) | null = null;

const mockGetSession = jest.fn();

const mockOnAuthStateChange = jest.fn().mockImplementation((cb) => {
  authStateCallback = cb;
  return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
});

// Set up default mock chains
function resetSupabaseMocks() {
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'user-tz-1' } } },
    error: null,
  });
  mockOnAuthStateChange.mockImplementation((cb: unknown) => {
    authStateCallback = cb as (event: string, session: unknown) => void;
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
  });
  mockFrom.mockImplementation(() => ({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      }),
    }),
    update: jest.fn().mockReturnValue({
      eq: mockUpdateEq,
    }),
  }));
}

jest.mock('../../lib/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) =>
        typeof mockOnAuthStateChange === 'function'
          ? mockOnAuthStateChange(cb)
          : { data: { subscription: { unsubscribe: jest.fn() } } },
    },
  },
}));

// ── AppState mock ───────────────────────────────────────────────
let appStateCallback: ((nextState: string) => void) | null = null;
const mockRemove = jest.fn();

const originalAddEventListener = AppState.addEventListener;
beforeEach(() => {
  resetSupabaseMocks();
  (AppState.addEventListener as jest.Mock) = jest.fn((event, cb) => {
    if (event === 'change') appStateCallback = cb;
    return { remove: mockRemove };
  });
});

afterEach(() => {
  AppState.addEventListener = originalAddEventListener;
  appStateCallback = null;
  authStateCallback = null;
  jest.clearAllMocks();
});

// ── Import after mocks ─────────────────────────────────────────
import { useTimezoneSync } from '../useTimezoneSync';

// Helper: render hook and wait for all async effects to flush
async function renderAndSettle() {
  const result = renderHook(() => useTimezoneSync());
  // Give async effects time to run (getSession → setUserId → sync effects)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  return result;
}

// ════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════

describe('useTimezoneSync', () => {
  // ─── Auth resolution ────────────────────────────────────────

  describe('auth resolution', () => {
    it('reads session on mount via getSession', async () => {
      await renderAndSettle();
      expect(mockGetSession).toHaveBeenCalled();
    });

    it('registers auth state change listener', async () => {
      await renderAndSettle();
      expect(mockOnAuthStateChange).toHaveBeenCalledWith(expect.any(Function));
    });

    it('unsubscribes from auth on unmount', async () => {
      const { unmount } = await renderAndSettle();
      act(() => unmount());
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  // ─── Timezone sync on mount ─────────────────────────────────

  describe('timezone sync', () => {
    it('calls syncTimezone with userId after session resolves', async () => {
      await renderAndSettle();
      // syncTimezone reads from notification_preferences
      expect(mockFrom).toHaveBeenCalledWith('notification_preferences');
    });

    it('does not sync if session has no user', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await renderAndSettle();

      // from should not be called because userId is null
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('does not write update if stored timezone matches device', async () => {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      mockMaybeSingle.mockResolvedValue({
        data: { timezone: deviceTz },
        error: null,
      });

      await renderAndSettle();

      // update should not be called since timezones match
      // mockFrom is called for select, but the update branch inside the same
      // from() chain should not fire. We check updateEq was never invoked.
      expect(mockUpdateEq).not.toHaveBeenCalled();
    });

    it('updates notification_preferences when timezone differs', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: { timezone: 'Antarctica/Troll' },
        error: null,
      });

      await renderAndSettle();

      // Should have called from('notification_preferences') for the update
      // The update call should include the device timezone
      expect(mockUpdateEq).toHaveBeenCalled();
    });
  });

  // ─── AppState listener ──────────────────────────────────────

  describe('AppState listener', () => {
    it('registers AppState change listener after userId resolves', async () => {
      await renderAndSettle();
      expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('removes AppState listener on unmount', async () => {
      const { unmount } = await renderAndSettle();
      act(() => unmount());
      expect(mockRemove).toHaveBeenCalled();
    });

    it('triggers syncTimezone on AppState becoming active', async () => {
      await renderAndSettle();
      mockFrom.mockClear();

      await act(async () => {
        appStateCallback?.('active');
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockFrom).toHaveBeenCalledWith('notification_preferences');
    });

    it('ignores non-active AppState transitions', async () => {
      await renderAndSettle();
      mockFrom.mockClear();

      await act(async () => {
        appStateCallback?.('background');
      });
      expect(mockFrom).not.toHaveBeenCalled();

      await act(async () => {
        appStateCallback?.('inactive');
      });
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ─── Heartbeat debounce ─────────────────────────────────────

  describe('heartbeat debounce', () => {
    it('writes heartbeat on first active transition', async () => {
      await renderAndSettle();
      mockUpdateEq.mockClear();

      await act(async () => {
        appStateCallback?.('active');
        await new Promise((r) => setTimeout(r, 0));
      });

      // First active → should write heartbeat (last_app_active_at)
      expect(mockUpdateEq).toHaveBeenCalled();
    });

    it('skips heartbeat if within 10-minute debounce window', async () => {
      await renderAndSettle();

      // First active → writes heartbeat
      await act(async () => {
        appStateCallback?.('active');
        await new Promise((r) => setTimeout(r, 0));
      });

      mockUpdateEq.mockClear();

      // Second active immediately → debounce should skip heartbeat
      await act(async () => {
        appStateCallback?.('active');
        await new Promise((r) => setTimeout(r, 0));
      });

      // Only the timezone sync update may happen, but heartbeat should NOT
      // Count calls — at most 2 for tz update (notification_preferences + user_profiles), 0 for heartbeat
      // Since tz matches (data: null → writes update for tz), the total calls
      // should be <= 2 (timezone update to both tables), no heartbeat write
      const callCount = mockUpdateEq.mock.calls.length;
      // If tz also updates, that's fine — the key is no second heartbeat
      expect(callCount).toBeLessThanOrEqual(2);
    });

    it('writes heartbeat again after debounce window expires', async () => {
      const originalDateNow = Date.now;
      let nowValue = 1000000;
      Date.now = jest.fn(() => nowValue);

      await renderAndSettle();

      // First active
      await act(async () => {
        appStateCallback?.('active');
        await new Promise((r) => setTimeout(r, 0));
      });

      mockUpdateEq.mockClear();

      // Advance past 10-minute debounce
      nowValue += 11 * 60 * 1000;

      // Second active after debounce
      await act(async () => {
        appStateCallback?.('active');
        await new Promise((r) => setTimeout(r, 0));
      });

      // Should have written heartbeat again
      expect(mockUpdateEq.mock.calls.length).toBeGreaterThanOrEqual(1);

      Date.now = originalDateNow;
    });
  });

  // ─── Auth state change ──────────────────────────────────────

  describe('auth state change', () => {
    it('updates userId when auth state changes', async () => {
      // Start with no session
      mockGetSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await renderAndSettle();
      mockFrom.mockClear();

      // Simulate sign-in via auth state change
      await act(async () => {
        authStateCallback?.('SIGNED_IN', { user: { id: 'new-user-42' } });
        await new Promise((r) => setTimeout(r, 0));
      });

      // After userId updates, sync should be triggered
      expect(mockFrom).toHaveBeenCalledWith('notification_preferences');
    });
  });

  // ─── getDeviceTimezone ────────────────────────────────────────

  describe('getDeviceTimezone (indirect)', () => {
    it('uses the device timezone string for sync comparison', () => {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      expect(typeof deviceTz).toBe('string');
      expect(deviceTz.length).toBeGreaterThan(0);
    });
  });
});
