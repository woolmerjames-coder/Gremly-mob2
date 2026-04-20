/**
 * Tests for getSessionToken and getSessionTokenSync.
 *
 * Covers: async fetch + cache, sync read, auth state change updates,
 * error fallback to cached value, and null before first auth event.
 */

// Capture the onAuthStateChange callback when the module loads
let authChangeCallback: (event: string, session: { access_token: string } | null) => void;

const mockGetSession = jest.fn();

jest.mock('../../supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: jest.fn(
        (cb: (event: string, session: { access_token: string } | null) => void) => {
          authChangeCallback = cb;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        },
      ),
    },
  },
}));

// Now import — this triggers the module-level onAuthStateChange call
import { getSessionToken, getSessionTokenSync } from '../getSessionToken';

describe('getSessionToken', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    // Reset cache state
    authChangeCallback('SIGNED_OUT', null);
  });

  describe('getSessionToken (async)', () => {
    it('returns the session access_token from supabase', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'jwt-token-abc' } },
      });

      const token = await getSessionToken();
      expect(token).toBe('jwt-token-abc');
    });

    it('returns null when no session exists', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: null },
      });

      const token = await getSessionToken();
      expect(token).toBeNull();
    });

    it('falls back to cached token on error', async () => {
      // First call: populate cache
      mockGetSession.mockResolvedValueOnce({
        data: { session: { access_token: 'cached-token' } },
      });
      await getSessionToken();

      // Second call: error
      mockGetSession.mockRejectedValueOnce(new Error('Network error'));
      const token = await getSessionToken();
      expect(token).toBe('cached-token');
    });

    it('returns null on error when no cached token', async () => {
      mockGetSession.mockRejectedValue(new Error('Network error'));
      const token = await getSessionToken();
      expect(token).toBeNull();
    });
  });

  describe('getSessionTokenSync', () => {
    it('returns cached token after auth state change', () => {
      authChangeCallback('SIGNED_IN', { access_token: 'sync-token-xyz' });
      expect(getSessionTokenSync()).toBe('sync-token-xyz');
    });

    it('returns null after sign-out auth state change', () => {
      authChangeCallback('SIGNED_OUT', null);
      expect(getSessionTokenSync()).toBeNull();
    });

    it('reflects token from last getSessionToken call', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'async-fetched-token' } },
      });

      await getSessionToken();
      expect(getSessionTokenSync()).toBe('async-fetched-token');
    });
  });
});
