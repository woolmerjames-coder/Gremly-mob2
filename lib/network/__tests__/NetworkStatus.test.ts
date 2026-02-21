/**
 * Tests for NetworkStatusManager — the singleton that tracks
 * online/offline state via @react-native-community/netinfo.
 *
 * The manager auto-subscribes to NetInfo in its constructor
 * (no start/stop lifecycle). It exposes:
 *   - isConnected (boolean, optimistic default = true)
 *   - ready() → Promise<void> (resolves after initial fetch)
 *   - subscribe(cb) → unsubscribe function
 */

let networkStatus: typeof import('../NetworkStatus').networkStatus;
let mockAddEventListener: jest.Mock;

beforeEach(() => {
  jest.resetModules();

  // Get fresh mock references BEFORE requiring the module
  // (constructor runs on require and calls addEventListener)
  const NetInfo = require('@react-native-community/netinfo').default;
  mockAddEventListener = NetInfo.addEventListener as jest.Mock;
  mockAddEventListener.mockClear();

  // Re-import to get a fresh singleton — constructor auto-subscribes
  networkStatus = require('../NetworkStatus').networkStatus;
});

// ═══════════════════════════════════════════════════════════════════════════════
// NetworkStatusManager
// ═══════════════════════════════════════════════════════════════════════════════

describe('NetworkStatusManager', () => {
  it('defaults to connected (optimistic)', () => {
    expect(networkStatus.isConnected).toBe(true);
  });

  it('auto-subscribes to NetInfo in the constructor', () => {
    // Constructor ran during require — should already be subscribed
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
  });

  it('constructor subscription is a single listener (no duplicates on re-require)', () => {
    // Each fresh require creates one new singleton that subscribes once
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
  });

  it('fires listeners when connectivity changes', () => {
    const listener = jest.fn();
    networkStatus.subscribe(listener);

    // Grab the callback registered with NetInfo by the constructor
    const netInfoCb = mockAddEventListener.mock.calls[0][0];

    // Go offline
    netInfoCb({ isConnected: false, isInternetReachable: false });
    expect(listener).toHaveBeenCalledWith(false);
    expect(networkStatus.isConnected).toBe(false);

    // Go online
    netInfoCb({ isConnected: true, isInternetReachable: true });
    expect(listener).toHaveBeenCalledWith(true);
    expect(networkStatus.isConnected).toBe(true);
  });

  it('de-duplicates — does NOT fire when state is unchanged', () => {
    const listener = jest.fn();
    networkStatus.subscribe(listener);

    const netInfoCb = mockAddEventListener.mock.calls[0][0];

    // Already connected (default), fire connected again → no listener call
    netInfoCb({ isConnected: true, isInternetReachable: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribe() returns an unsubscribe function', () => {
    const listener = jest.fn();
    const unsub = networkStatus.subscribe(listener);

    const netInfoCb = mockAddEventListener.mock.calls[0][0];

    unsub();

    netInfoCb({ isConnected: false, isInternetReachable: false });
    expect(listener).not.toHaveBeenCalled();
  });

  it('ready() resolves after initial NetInfo.fetch()', async () => {
    // The global mock resolves NetInfo.fetch() with { isConnected: true }
    await expect(networkStatus.ready()).resolves.toBeUndefined();
  });

  it('treats isInternetReachable=null as not-offline (connected)', () => {
    const listener = jest.fn();
    networkStatus.subscribe(listener);

    const netInfoCb = mockAddEventListener.mock.calls[0][0];

    // First go offline so a transition to connected is observable
    netInfoCb({ isConnected: false, isInternetReachable: false });
    listener.mockClear();

    // isInternetReachable null but isConnected true → treated as connected
    netInfoCb({ isConnected: true, isInternetReachable: null });
    expect(listener).toHaveBeenCalledWith(true);
    expect(networkStatus.isConnected).toBe(true);
  });
});
