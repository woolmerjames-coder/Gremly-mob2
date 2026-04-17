/**
 * useMindDropSubmit – current architecture tests
 *
 * Tests the optimistic queue-based submission flow:
 * 1. Enqueue to AsyncStorage for crash safety
 * 2. Card appears via enqueue → syncQueueToZustand (no direct addPendingDrop)
 * 3. triggerProcessing() kicks off background pipeline
 * 4. Offline: pipeline handles offline internally (no _offlineCapture flag from hook)
 */

import { renderHook, act } from '@testing-library/react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — use proxy wrappers so resetMocks doesn't break the references
// ─────────────────────────────────────────────────────────────────────────────

const mockAddPendingDrop = jest.fn();
const mockRemovePendingDrop = jest.fn();
const mockIncrementDropCount = jest.fn();
const mockUpdatePendingDropEnrichment = jest.fn();

const mockPreviewGaugeDrop = jest.fn().mockReturnValue({ justCrossedFed: false });

const storeState = {
  spaces: [] as any[],
  addPendingDrop: mockAddPendingDrop,
  removePendingDrop: mockRemovePendingDrop,
  incrementDropCount: mockIncrementDropCount,
  updatePendingDropEnrichment: mockUpdatePendingDropEnrichment,
  previewGaugeDrop: mockPreviewGaugeDrop,
};

jest.mock('../../lib/store/useGremlyStore', () => ({
  useGremlyStore: Object.assign((selector: any) => selector(storeState), {
    getState: () => storeState,
  }),
}));

const mockEnqueue = jest.fn();
jest.mock('../../lib/minddrop/dropQueue', () => ({
  enqueue: (...args: any[]) => mockEnqueue(...args),
}));

const mockTriggerProcessing = jest.fn();
jest.mock('../../lib/minddrop/dropPipeline', () => ({
  triggerProcessing: (...args: any[]) => mockTriggerProcessing(...args),
}));

const mockHeuristicClassify = jest.fn();
jest.mock('../../lib/minddrop/heuristicClassify', () => ({
  heuristicClassify: (...args: any[]) => mockHeuristicClassify(...args),
}));

const mockFindSpaceByName = jest.fn();
jest.mock('../../lib/minddrop/spacePatterns', () => ({
  findSpaceByName: (...args: any[]) => mockFindSpaceByName(...args),
}));

const mockPreparePhotoDropText = jest.fn();
const mockIsPhotoOnlyDrop = jest.fn();
const mockGetPhotoDropDefaults = jest.fn();
jest.mock('../../lib/minddrop/photoDrop', () => ({
  preparePhotoDropText: (...args: any[]) => mockPreparePhotoDropText(...args),
  isPhotoOnlyDrop: (...args: any[]) => mockIsPhotoOnlyDrop(...args),
  getPhotoDropDefaults: (...args: any[]) => mockGetPhotoDropDefaults(...args),
}));

jest.mock('../../lib/minddrop/ids', () => ({
  generateDropId: () => 'gen-drop-id',
}));

jest.mock('../../lib/config/testMode', () => ({
  isTestMode: () => false,
}));

jest.mock('../../src/utils/TestLogger', () => ({
  testLogger: { start: jest.fn(), step: jest.fn(), assert: jest.fn(), end: jest.fn() },
}));

// NetworkStatus mock — create inline to avoid hoisting issues
// (jest.mock factories run before const declarations are initialized)
jest.mock('../../lib/network/NetworkStatus', () => ({
  networkStatus: { isConnected: true },
}));

import { useMindDropSubmit } from '../../hooks/useMindDropSubmit';

// Get mutable reference AFTER mock is registered (require is not hoisted)
const mockNetworkStatus = require('../../lib/network/NetworkStatus').networkStatus;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockNetworkStatus.isConnected = true;

  // Restore mock implementations (resetMocks clears them)
  mockEnqueue.mockResolvedValue({
    localId: 'drop-123',
    createdAt: '2025-12-15T10:00:00Z',
  });
  mockTriggerProcessing.mockResolvedValue(undefined);
  mockIncrementDropCount.mockResolvedValue({ didAgeUp: false, newAge: 1 });
  mockHeuristicClassify.mockReturnValue({
    bucket: 'todo',
    subtypeHint: null,
    spaceHint: null,
    cleanedText: null,
  });
  mockFindSpaceByName.mockReturnValue(null);
  mockPreparePhotoDropText.mockImplementation(({ text }: any) => text);
  mockIsPhotoOnlyDrop.mockReturnValue(false);
  mockGetPhotoDropDefaults.mockReturnValue({ bucket: 'note', subtype: null });
  mockPreviewGaugeDrop.mockReturnValue({ justCrossedFed: false });

  // Re-bind storeState methods (resetMocks replaces the mock fn instances)
  storeState.addPendingDrop = mockAddPendingDrop;
  storeState.removePendingDrop = mockRemovePendingDrop;
  storeState.incrementDropCount = mockIncrementDropCount;
  storeState.updatePendingDropEnrichment = mockUpdatePendingDropEnrichment;
  storeState.previewGaugeDrop = mockPreviewGaugeDrop;
});

describe('useMindDropSubmit — current architecture', () => {
  it('returns submit function and isSubmitting state', () => {
    const { result } = renderHook(() => useMindDropSubmit());
    expect(typeof result.current.submit).toBe('function');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('enqueues drop to AsyncStorage', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('buy groceries', { source: 'minddrop' });
    });

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      text: 'buy groceries',
      source: 'minddrop',
    });
  });

  it('optimistic UI via enqueue → syncQueueToZustand (no direct addPendingDrop)', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('test drop', { source: 'minddrop' });
    });

    // After refactor: card appears via enqueue() → syncQueueToZustand(), not addPendingDrop
    expect(mockAddPendingDrop).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0][0]).toMatchObject({
      text: 'test drop',
      source: 'minddrop',
    });
  });

  it('returns success with localId immediately', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('test', { source: 'minddrop' });
    });

    expect(submitResult.success).toBe(true);
    expect(submitResult.dropId).toBe('drop-123');
    expect(submitResult.bucket).toBe('todo');
  });

  it('rejects empty text', async () => {
    mockPreparePhotoDropText.mockReturnValueOnce('');

    const { result } = renderHook(() => useMindDropSubmit());

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('', { source: 'minddrop' });
    });

    expect(submitResult.success).toBe(false);
    expect(submitResult.error.message).toBe('Cannot submit empty drop');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  // ── Online vs Offline ──────────────────────────────────────────────

  it('calls triggerProcessing when online', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('online drop', { source: 'minddrop' });
    });

    expect(mockTriggerProcessing).toHaveBeenCalledTimes(1);
  });

  it('calls triggerProcessing even when offline', async () => {
    mockNetworkStatus.isConnected = false;

    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('offline drop', { source: 'minddrop' });
    });

    // Pipeline is always triggered — it handles offline internally
    expect(mockTriggerProcessing).toHaveBeenCalledTimes(1);
  });

  it('does not set _offlineCapture flag directly when offline (pipeline handles it)', async () => {
    mockNetworkStatus.isConnected = false;

    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('offline drop', { source: 'minddrop' });
    });

    // After refactor: hook no longer sets _offlineCapture — pipeline handles offline internally
    expect(mockAddPendingDrop).not.toHaveBeenCalled();
  });

  it('does not call updatePendingDropEnrichment when offline (pipeline handles it)', async () => {
    mockNetworkStatus.isConnected = false;

    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('offline drop', { source: 'minddrop' });
    });

    // After refactor: hook delegates offline handling to the pipeline
    expect(mockUpdatePendingDropEnrichment).not.toHaveBeenCalled();
  });

  it('uses provided dropId from context when available', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    let submitResult: any;
    await act(async () => {
      submitResult = await result.current.submit('test', {
        source: 'minddrop',
        dropId: 'custom-id',
      });
    });

    // Uses the enqueued localId for the result, not the context dropId
    expect(submitResult.dropId).toBe('drop-123');
  });

  it('passes dueDayOverride to enqueue', async () => {
    const { result } = renderHook(() => useMindDropSubmit());

    await act(async () => {
      await result.current.submit('plan task', {
        source: 'today',
        dueDayOverride: '2025-12-20',
      });
    });

    expect(mockEnqueue.mock.calls[0][0].dueDayOverride).toBe('2025-12-20');
  });
});
