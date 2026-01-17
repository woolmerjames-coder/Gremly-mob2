/**
 * Drop Queue Tests
 *
 * Tests for the AsyncStorage-based persistence layer for Mind Drops.
 * Ensures crash resilience by verifying drops are correctly persisted
 * and can be recovered after app restart.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue,
  updateDrop,
  markFailed,
  markSynced,
  dequeue,
  getQueue,
  getPendingDrops,
  hasPendingDrops,
  cleanupSynced,
  getQueueStats,
  clearQueue,
  type QueuedDrop,
} from '../dropQueue';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('dropQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getQueue
  // ─────────────────────────────────────────────────────────────────────────

  describe('getQueue', () => {
    it('returns empty array when no queue exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getQueue();

      expect(result).toEqual([]);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('gremly:mindDropQueue');
    });

    it('parses stored JSON correctly', async () => {
      const storedDrops: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'Test drop',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'queued',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(storedDrops));

      const result = await getQueue();

      expect(result).toEqual(storedDrops);
    });

    it('returns empty array on JSON parse error', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json{');

      const result = await getQueue();

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // enqueue
  // ─────────────────────────────────────────────────────────────────────────

  describe('enqueue', () => {
    it('creates a new drop with correct fields', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('[]');

      const drop = await enqueue({
        text: 'Buy groceries',
        spaceId: null,
        source: 'minddrop',
      });

      expect(drop.localId).toBeDefined();
      expect(drop.text).toBe('Buy groceries');
      expect(drop.status).toBe('queued');
      expect(drop.retryCount).toBe(0);
      expect(drop.createdAt).toBeDefined();
      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    });

    it('generates unique localId for each drop', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('[]');

      const drop1 = await enqueue({ text: 'Drop 1', spaceId: null, source: 'minddrop' });
      const drop2 = await enqueue({ text: 'Drop 2', spaceId: null, source: 'minddrop' });

      expect(drop1.localId).not.toBe(drop2.localId);
    });

    it('preserves spaceId when provided', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('[]');

      const drop = await enqueue({
        text: 'Space drop',
        spaceId: 'space-123',
        source: 'space',
      });

      expect(drop.spaceId).toBe('space-123');
    });

    it('preserves attachments when provided', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('[]');

      const drop = await enqueue({
        text: 'Photo drop',
        spaceId: null,
        source: 'photo',
        attachments: ['file://photo1.jpg', 'file://photo2.jpg'],
      });

      expect(drop.attachments).toEqual(['file://photo1.jpg', 'file://photo2.jpg']);
    });

    it('enforces MAX_QUEUE_SIZE by removing synced drops first', async () => {
      // Create queue at max size with one synced item
      const fullQueue: QueuedDrop[] = Array.from({ length: 50 }, (_, i) => ({
        localId: `drop-${i}`,
        text: `Drop ${i}`,
        spaceId: null,
        source: 'minddrop' as const,
        createdAt: new Date(2025, 0, 1, i).toISOString(),
        status: i === 0 ? ('synced' as const) : ('queued' as const),
        retryCount: 0,
      }));
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(fullQueue));

      await enqueue({ text: 'New drop', spaceId: null, source: 'minddrop' });

      // Verify setItem was called with queue that removed synced item
      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue.length).toBe(50);
      expect(savedQueue.find((d: QueuedDrop) => d.localId === 'drop-0')).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // updateDrop
  // ─────────────────────────────────────────────────────────────────────────

  describe('updateDrop', () => {
    it('updates existing drop with partial data', async () => {
      const existingQueue: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'Test',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'queued',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingQueue));

      await updateDrop('drop-1', { status: 'classified', bucket: 'todo' });

      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue[0].status).toBe('classified');
      expect(savedQueue[0].bucket).toBe('todo');
      expect(savedQueue[0].text).toBe('Test'); // Original preserved
    });

    it('does nothing if drop not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('[]');

      await updateDrop('nonexistent', { status: 'classified' });

      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('can update enrichment fields', async () => {
      const existingQueue: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'Call mom tomorrow',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'classified',
          retryCount: 0,
          bucket: 'todo',
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingQueue));

      await updateDrop('drop-1', {
        smartTitle: 'Call Mom',
        tags: ['family', 'phone'],
        extractedDate: '2025-01-18',
        confirmationMessage: "Got it! I'll remind you to call mom.",
      });

      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue[0].smartTitle).toBe('Call Mom');
      expect(savedQueue[0].tags).toEqual(['family', 'phone']);
      expect(savedQueue[0].extractedDate).toBe('2025-01-18');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // markFailed
  // ─────────────────────────────────────────────────────────────────────────

  describe('markFailed', () => {
    it('increments retryCount and sets status to failed', async () => {
      const existingQueue: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'Test',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'queued',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingQueue));

      await markFailed('drop-1');

      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue[0].status).toBe('failed');
      expect(savedQueue[0].retryCount).toBe(1);
      expect(savedQueue[0].lastAttemptAt).toBeDefined();
    });

    it('increments retryCount on subsequent failures', async () => {
      const existingQueue: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'Test',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'failed',
          retryCount: 2,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingQueue));

      await markFailed('drop-1');

      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue[0].retryCount).toBe(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // markSynced
  // ─────────────────────────────────────────────────────────────────────────

  describe('markSynced', () => {
    it('updates status and stores Supabase ID', async () => {
      const existingQueue: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'Test',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'enriched',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingQueue));

      await markSynced('drop-1', 'supabase-uuid-123', 'todo');

      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue[0].status).toBe('synced');
      expect(savedQueue[0].supabaseId).toBe('supabase-uuid-123');
      expect(savedQueue[0].entityType).toBe('todo');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // dequeue
  // ─────────────────────────────────────────────────────────────────────────

  describe('dequeue', () => {
    it('removes drop from queue', async () => {
      const existingQueue: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'First',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'synced',
          retryCount: 0,
        },
        {
          localId: 'drop-2',
          text: 'Second',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T11:00:00Z',
          status: 'queued',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingQueue));

      await dequeue('drop-1');

      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue.length).toBe(1);
      expect(savedQueue[0].localId).toBe('drop-2');
    });

    it('does nothing if drop not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('[]');

      await dequeue('nonexistent');

      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getPendingDrops
  // ─────────────────────────────────────────────────────────────────────────

  describe('getPendingDrops', () => {
    it('returns drops in processing states', async () => {
      // "pending" drops are those in active processing: queued
      // Plus failed drops under retry limit
      // Classified, enriched, synced are terminal/not pending
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'queued',
          retryCount: 0,
        },
        {
          localId: '2',
          text: 'B',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'classified',
          retryCount: 0,
        },
        {
          localId: '3',
          text: 'C',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'enriched',
          retryCount: 0,
        },
        {
          localId: '4',
          text: 'D',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'synced',
          retryCount: 0,
        },
        {
          localId: '5',
          text: 'E',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'failed',
          retryCount: 1,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const pending = await getPendingDrops();

      // Only 'queued' and 'failed' with retryCount < 3 are returned
      expect(pending.length).toBe(2);
      expect(pending.map((d) => d.localId)).toEqual(['1', '5']);
    });

    it('includes failed drops below retry limit', async () => {
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'failed',
          retryCount: 1,
        },
        {
          localId: '2',
          text: 'B',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'failed',
          retryCount: 2,
        },
        {
          localId: '3',
          text: 'C',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'failed',
          retryCount: 3,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const pending = await getPendingDrops();

      expect(pending.length).toBe(2); // Only retryCount < 3
      expect(pending.map((d) => d.localId)).toEqual(['1', '2']);
    });

    it('excludes synced drops', async () => {
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'synced',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const pending = await getPendingDrops();

      expect(pending.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // hasPendingDrops
  // ─────────────────────────────────────────────────────────────────────────

  describe('hasPendingDrops', () => {
    it('returns true when pending drops exist', async () => {
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'queued',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const result = await hasPendingDrops();

      expect(result).toBe(true);
    });

    it('returns false when no pending drops', async () => {
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'synced',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const result = await hasPendingDrops();

      expect(result).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // cleanupSynced
  // ─────────────────────────────────────────────────────────────────────────

  describe('cleanupSynced', () => {
    it('removes synced drops and returns count', async () => {
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'synced',
          retryCount: 0,
        },
        {
          localId: '2',
          text: 'B',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'synced',
          retryCount: 0,
        },
        {
          localId: '3',
          text: 'C',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'queued',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const removedCount = await cleanupSynced();

      expect(removedCount).toBe(2);
      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue.length).toBe(1);
      expect(savedQueue[0].localId).toBe('3');
    });

    it('returns 0 when no synced drops', async () => {
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'queued',
          retryCount: 0,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const removedCount = await cleanupSynced();

      expect(removedCount).toBe(0);
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getQueueStats
  // ─────────────────────────────────────────────────────────────────────────

  describe('getQueueStats', () => {
    it('returns correct statistics', async () => {
      const queue: QueuedDrop[] = [
        {
          localId: '1',
          text: 'A',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'queued',
          retryCount: 0,
        },
        {
          localId: '2',
          text: 'B',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'queued',
          retryCount: 0,
        },
        {
          localId: '3',
          text: 'C',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'synced',
          retryCount: 0,
        },
        {
          localId: '4',
          text: 'D',
          spaceId: null,
          source: 'minddrop',
          createdAt: '',
          status: 'failed',
          retryCount: 1,
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(queue));

      const stats = await getQueueStats();

      expect(stats.total).toBe(4);
      expect(stats.byStatus.queued).toBe(2);
      expect(stats.byStatus.synced).toBe(1);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.pendingCount).toBe(3); // queued + failed with retryCount < 3
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // clearQueue
  // ─────────────────────────────────────────────────────────────────────────

  describe('clearQueue', () => {
    it('removes queue from storage', async () => {
      await clearQueue();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('gremly:mindDropQueue');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Multi-drop fields
  // ─────────────────────────────────────────────────────────────────────────

  describe('multi-drop fields', () => {
    it('preserves multi-drop fields on enqueue', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('[]');

      const drop = await enqueue({
        text: 'buy milk and start running',
        spaceId: null,
        source: 'minddrop',
        isMulti: true,
        multiSegments: [
          { text: 'buy milk', bucket: 'todo', subtype: null },
          { text: 'start running', bucket: 'habit', subtype: null, habitSubtype: 'start_habit' },
        ],
        multiSummary: 'Groceries + Running Habit',
        dominantBucket: 'todo',
      });

      expect(drop.isMulti).toBe(true);
      expect(drop.multiSegments).toHaveLength(2);
      expect(drop.multiSummary).toBe('Groceries + Running Habit');
      expect(drop.dominantBucket).toBe('todo');
    });

    it('updates multi-drop segments with Phase 1 titles', async () => {
      const existingQueue: QueuedDrop[] = [
        {
          localId: 'drop-1',
          text: 'buy milk and start running',
          spaceId: null,
          source: 'minddrop',
          createdAt: '2025-01-17T10:00:00Z',
          status: 'queued',
          retryCount: 0,
          isMulti: true,
          multiSegments: [
            { text: 'buy milk', bucket: 'todo', subtype: null },
            { text: 'start running', bucket: 'habit', subtype: null },
          ],
        },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingQueue));

      await updateDrop('drop-1', {
        multiSegments: [
          {
            text: 'buy milk',
            bucket: 'todo',
            subtype: null,
            smart_title: 'Buy Milk',
            confirmation_message: 'Got it!',
          },
          {
            text: 'start running',
            bucket: 'habit',
            subtype: null,
            smart_title: 'Morning Run',
            confirmation_message: 'Great habit!',
          },
        ],
      });

      const savedQueue = JSON.parse(mockAsyncStorage.setItem.mock.calls[0][1]);
      expect(savedQueue[0].multiSegments[0].smart_title).toBe('Buy Milk');
      expect(savedQueue[0].multiSegments[1].smart_title).toBe('Morning Run');
    });
  });
});
