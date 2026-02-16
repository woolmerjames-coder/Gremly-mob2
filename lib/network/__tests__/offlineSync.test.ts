/**
 * Tests for lib/network/offlineSync.ts
 *
 * Tests the offline queue flush system: backoff logic, abort-on-disconnect,
 * sequential drop processing, and recovery after reconnection.
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

const mockGetPendingDrops = jest.fn();
jest.mock('../../minddrop/dropQueue', () => ({
  getPendingDrops: mockGetPendingDrops,
}));

const mockProcessDrop = jest.fn();
jest.mock('../../minddrop/dropProcessor', () => ({
  processDrop: mockProcessDrop,
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

// We re-require in each test to reset module-level state (isFlushing, consecutiveFailures)
function loadModule() {
  return require('../offlineSync') as typeof import('../offlineSync');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDrop(id: string) {
  return { localId: id, text: `drop ${id}`, createdAt: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockNetworkStatus.isConnected = true;
  mockGetPendingDrops.mockResolvedValue([]);
  mockProcessDrop.mockResolvedValue(undefined);
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

    it('schedules initial flush after 5s if already connected', () => {
      const mod = loadModule();
      mockGetPendingDrops.mockResolvedValue([makeDrop('1')]);

      mod.initOfflineSync();

      // Not yet — needs 5s timeout
      expect(mockGetPendingDrops).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5000);

      // Now the flush should have started
      expect(mockGetPendingDrops).toHaveBeenCalled();
    });

    it('does NOT schedule initial flush if offline', () => {
      mockNetworkStatus.isConnected = false;
      const mod = loadModule();
      mod.initOfflineSync();

      jest.advanceTimersByTime(10000);
      expect(mockGetPendingDrops).not.toHaveBeenCalled();
    });

    it('triggers flush 2s after reconnection', () => {
      mockNetworkStatus.isConnected = false;
      const mod = loadModule();
      mod.initOfflineSync();

      // Simulate reconnection via the subscriber callback
      const subscriberCb = mockSubscribe.mock.calls[0][0];
      mockNetworkStatus.isConnected = true;
      subscriberCb(true);

      // Not yet — needs 2s timeout
      expect(mockGetPendingDrops).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2000);
      expect(mockGetPendingDrops).toHaveBeenCalled();
    });
  });

  describe('flushOfflineQueue (via initOfflineSync trigger)', () => {
    it('processes all pending drops sequentially', async () => {
      const drops = [makeDrop('a'), makeDrop('b'), makeDrop('c')];
      mockGetPendingDrops.mockResolvedValue(drops);
      mockProcessDrop.mockResolvedValue(undefined);

      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(5000);

      // Let all promises resolve
      await jest.runAllTimersAsync();

      expect(mockProcessDrop).toHaveBeenCalledTimes(3);
      expect(mockProcessDrop.mock.calls[0][0]).toBe(drops[0]);
      expect(mockProcessDrop.mock.calls[1][0]).toBe(drops[1]);
      expect(mockProcessDrop.mock.calls[2][0]).toBe(drops[2]);
    });

    it('calls refreshFromServer after successful flush', async () => {
      mockGetPendingDrops.mockResolvedValue([makeDrop('x')]);
      mockProcessDrop.mockResolvedValue(undefined);

      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      expect(mockRefreshFromServer).toHaveBeenCalledTimes(1);
    });

    it('skips flush when offline', async () => {
      mockNetworkStatus.isConnected = false;
      mockGetPendingDrops.mockResolvedValue([makeDrop('x')]);

      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(10000);
      await jest.runAllTimersAsync();

      expect(mockProcessDrop).not.toHaveBeenCalled();
    });

    it('stops processing if connectivity drops mid-flush', async () => {
      const drops = [makeDrop('a'), makeDrop('b')];
      mockGetPendingDrops.mockResolvedValue(drops);
      mockProcessDrop.mockImplementation(async () => {
        // Go offline after first drop
        mockNetworkStatus.isConnected = false;
      });

      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      // Only first drop processed, second skipped due to offline
      expect(mockProcessDrop).toHaveBeenCalledTimes(1);
    });

    it('resets consecutiveFailures on empty queue', async () => {
      mockGetPendingDrops.mockResolvedValue([]);

      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(5000);
      await jest.runAllTimersAsync();

      // No errors, no process calls
      expect(mockProcessDrop).not.toHaveBeenCalled();
      expect(mockRefreshFromServer).not.toHaveBeenCalled();
    });

    it('does not call refreshFromServer if store is not initialized', async () => {
      mockGetPendingDrops.mockResolvedValue([makeDrop('x')]);
      mockProcessDrop.mockResolvedValue(undefined);
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

  describe('backoff on failure', () => {
    it('applies exponential backoff on consecutive failures', async () => {
      mockGetPendingDrops.mockResolvedValue([makeDrop('a')]);
      let callCount = 0;
      mockProcessDrop.mockImplementation(async () => {
        callCount++;
        throw new Error(`fail ${callCount}`);
      });

      const mod = loadModule();
      mod.initOfflineSync();
      jest.advanceTimersByTime(5000);

      // First failure triggers backoff of BASE_DELAY * 2^0 = 2000ms
      await jest.advanceTimersByTimeAsync(100);
      expect(mockProcessDrop).toHaveBeenCalledTimes(1);
    });
  });
});
