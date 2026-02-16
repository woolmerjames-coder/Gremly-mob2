/**
 * Tests for lib/network/useNetworkStatus.ts
 *
 * Tests the React hook wrapper around NetworkStatusManager.
 */

import { renderHook, act } from '@testing-library/react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Mock NetworkStatus — create inline in factory (jest.mock is hoisted before
// module-level const/let, so those vars are in TDZ at factory time).
// ─────────────────────────────────────────────────────────────────────────────

let subscriberCallback: ((connected: boolean) => void) | null = null;

jest.mock('../NetworkStatus', () => ({
  networkStatus: {
    isConnected: true,
    subscribe: jest.fn((cb: (connected: boolean) => void) => {
      subscriberCallback = cb;
      return () => {
        subscriberCallback = null;
      };
    }),
  },
}));

// Get mutable reference via require (not hoisted)
const mockNetworkStatus = require('../NetworkStatus').networkStatus;

import { useNetworkStatus } from '../useNetworkStatus';

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockNetworkStatus.isConnected = true;
  subscriberCallback = null;
  // Restore subscribe implementation (resetMocks clears it)
  mockNetworkStatus.subscribe.mockImplementation(
    (cb: (connected: boolean) => void) => {
      subscriberCallback = cb;
      return () => {
        subscriberCallback = null;
      };
    },
  );
});

describe('useNetworkStatus', () => {
  it('returns current connection state', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isConnected).toBe(true);
  });

  it('subscribes to network changes on mount', () => {
    renderHook(() => useNetworkStatus());
    expect(mockNetworkStatus.subscribe).toHaveBeenCalledTimes(1);
  });

  it('updates when connectivity changes to offline', () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      subscriberCallback?.(false);
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('updates when connectivity is restored', () => {
    mockNetworkStatus.isConnected = false;
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      subscriberCallback?.(true);
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());

    expect(subscriberCallback).not.toBeNull();
    unmount();
    expect(subscriberCallback).toBeNull();
  });

  it('reflects initial offline state', () => {
    mockNetworkStatus.isConnected = false;
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isConnected).toBe(false);
  });
});
