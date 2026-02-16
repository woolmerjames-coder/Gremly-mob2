/**
 * Tests for NetworkStatusManager — the singleton that tracks
 * online/offline state via @react-native-community/netinfo.
 */

// Reset the module between tests so each test gets a fresh singleton
let networkStatus: typeof import('../NetworkStatus').networkStatus;
let mockAddEventListener: jest.Mock;

beforeEach(() => {
  jest.resetModules();
  // Re-import to get a fresh singleton
  networkStatus = require('../NetworkStatus').networkStatus;
  // Get fresh mock reference
  const NetInfo = require('@react-native-community/netinfo').default;
  mockAddEventListener = NetInfo.addEventListener as jest.Mock;
});

// ═══════════════════════════════════════════════════════════════════════════════
// NetworkStatusManager
// ═══════════════════════════════════════════════════════════════════════════════

describe('NetworkStatusManager', () => {
  it('defaults to connected', () => {
    expect(networkStatus.isConnected).toBe(true);
  });

  it('start() subscribes to NetInfo', () => {
    networkStatus.start();
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
  });

  it('start() is idempotent (only subscribes once)', () => {
    networkStatus.start();
    networkStatus.start();
    expect(mockAddEventListener).toHaveBeenCalledTimes(1);
  });

  it('fires listeners when connectivity changes', () => {
    const listener = jest.fn();
    networkStatus.subscribe(listener);
    networkStatus.start();

    // Grab the callback registered with NetInfo
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
    networkStatus.start();

    const netInfoCb = mockAddEventListener.mock.calls[0][0];

    // Already connected, fire connected again → no listener call
    netInfoCb({ isConnected: true, isInternetReachable: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it('subscribe() returns an unsubscribe function', () => {
    const listener = jest.fn();
    const unsub = networkStatus.subscribe(listener);
    networkStatus.start();

    const netInfoCb = mockAddEventListener.mock.calls[0][0];

    unsub();

    netInfoCb({ isConnected: false, isInternetReachable: false });
    expect(listener).not.toHaveBeenCalled();
  });

  it('stop() cleans up the NetInfo subscription', () => {
    const mockUnsub = jest.fn();
    mockAddEventListener.mockReturnValue(mockUnsub);

    networkStatus.start();
    networkStatus.stop();

    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });

  it('treats isInternetReachable=null as not-offline (connected)', () => {
    const listener = jest.fn();
    networkStatus.subscribe(listener);
    networkStatus.start();

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
