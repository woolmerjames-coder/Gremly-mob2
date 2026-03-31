/**
 * Tests for lib/network/offlineSync.ts
 *
 * Tests the offline sync system: reconnection triggers pipeline processing,
 * app resume handling, and reclassification of degraded entities.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks (must be before imports)
// ─────────────────────────────────────────────────────────────────────────────

const mockSubscribe = jest.fn<() => void, [(connected: boolean) => void]>();
const mockNetworkStatus = {
  isConnected: true,
  subscribe: mockSubscribe,
};
jest.mock('../NetworkStatus', () => ({
  networkStatus: mockNetworkStatus,
}));

const mockTriggerProcessing = jest.fn().mockResolvedValue(undefined);
const mockReclassifyDegradedEntities = jest.fn().mockResolvedValue(undefined);
jest.mock('../../minddrop/dropPipeline', () => ({
  triggerProcessing: (...args: any[]) => mockTriggerProcessing(...args),
  reclassifyDegradedEntities: (...args: any[]) => mockReclassifyDegradedEntities(...args),
}));

const mockRefreshFromServer = jest.fn().mockResolvedValue(undefined);
const mockGetState = jest.fn(() => ({
  isInitialized: true,
  refreshFromServer: mockRefreshFromServer,
}));
jest.mock('../../store/useGremlyStore', () => ({
  useGremlyStore: { getState: () => mockGetState() },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Import after mocks
// ─────────────────────────────────────────────────────────────────────────────

// Re-require in each test to reset module-level state
function loadModule() {
  return require('../offlineSync') as typeof import('../offlineSync');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockNetworkStatus.isConnected = true;
  mockTriggerProcessing.mockResolvedValue(undefined);
  mockReclassifyDegradedEntities.mockResolvedValue(undefined);
  mockGetState.mockReturnValue({
    isInitialized: true,
    refreshFromServer: mockRefreshFromServer,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('offlineSync', () => {
  describe('initOfflineSync', () => {
    it('subscribes to network status changes', () => {
      const mod = loadModule();
      mod.initOfflineSync();
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(typeof mockSubscribe.mock.calls[0][0]).toBe('function');
    });

    it('schedules initial flush after 5s if already connected', async () => {
      const mod = loadModule();
      mod.initOfflineSync();

      expect(mockTriggerProcessing).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockTriggerProcessing).toHaveBeenCalled();
    });

    it('does NOT schedule initial flush if offline', async () => {
      mockNetworkStatus.isConnected = false;
      const mod = loadModule();
      mod.initOfflineSync();

      jest.advanceTimersByTime(10000);
      await jest.runAllTimersAsync();

      expect(mockTriggerProcessing).not.toHaveBeenCalled();
    });

    it('triggers flush 2s after reconnection', async () => {
      mockNetworkStatus.isConnected = false;
      const mod = loadModule();
      mod.initOfflineSync();

      const subscriberCb = mockSubscribe.mock.calls[0][0];
      mockNetworkStatus.isConnected = true;
      subscriberCb(true);

      expect(mockTriggerProcessing).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2000);
      await jest.runAllTimersAsync();

      expect(mockTriggerProcessing).toHaveBeenCalled();
    });

    it('calls reclassifyDegradedEntities after reconnection flush', async () => {
      mockNetworkStatus.isConnected = false;
      const mod = loadModule();
      mod.initOfflineSync();

      const subscriberCb = mockSubscribe.mock.calls[0][0];
      mockNetworkStatus.isConnected = true;
      subscriberCb(true);

      jest.advanceTimersByTime(2000);
      await jest.runAllTimersAsync();

      expect(mockReclassifyDegradedEntities).toHaveBeenCalled();
    });
  });

  describe('flushOfflineQueue behavior', () => {
    it('calls refreshFromServer after triggerProcessing', async () => {
      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockRefreshFromServer).toHaveBeenCalledTimes(1);
    });

    it('skips flush when offline', async () => {
      mockNetworkStatus.isConnected = false;
      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(10000);
      await jest.runAllTimersAsync();

      expect(mockTriggerProcessing).not.toHaveBeenCalled();
    });

    it('does not call refreshFromServer if store is not initialized', async () => {
      mockGetState.mockReturnValue({
        isInitialized: false,
        refreshFromServer: mockRefreshFromServer,
      });

      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockRefreshFromServer).not.toHaveBeenCalled();
    });
  });
});
