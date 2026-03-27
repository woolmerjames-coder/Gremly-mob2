/**
 * MindDrop Zustand Store
 *
 * Central state management for Mind Drop items and pending classifications.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { MindDropBucket, MindDropItem, PendingItem } from '../minddrop/types';
import { nowTimestamp, getDateService } from '../date/DateService';

/**
 * State shape for the MindDrop store
 */
interface MindDropState {
  /** Confirmed items keyed by their ID */
  items: Record<string, MindDropItem>;

  /** Pending items awaiting classification, keyed by dropId */
  pendingItems: Record<string, PendingItem>;

  /** Whether the store is currently loading data */
  isLoading: boolean;

  /** Timestamp of last data fetch from DB (ISO string) */
  lastFetchedAt: string | null;
}

/**
 * Actions available on the MindDrop store
 */
interface MindDropActions {
  /** Add a new pending item awaiting classification */
  addPendingItem: (item: PendingItem) => void;

  /** Confirm a pending item with its full MindDropItem data */
  confirmItem: (dropId: string, confirmedItem: MindDropItem) => void;

  /** Update an existing item with a partial patch */
  updateItem: (id: string, patch: Partial<MindDropItem>) => void;

  /** Remove an item by ID */
  removeItem: (id: string) => void;

  /** Remove a pending item by dropId */
  removePendingItem: (dropId: string) => void;

  /** Replace all items with a new array */
  setItems: (items: MindDropItem[]) => void;

  /** Hydrate store from database, merging with optimistic items */
  hydrateFromDB: (items: MindDropItem[]) => void;

  /** Clear all items and pending items */
  clearAll: () => void;
}

type MindDropStore = MindDropState & MindDropActions;

/**
 * Initial state for the store
 */
const initialState: MindDropState = {
  items: {},
  pendingItems: {},
  isLoading: false,
  lastFetchedAt: null,
};

/**
 * MindDrop Zustand store with subscribeWithSelector middleware
 */
export const useMindDropStore = create<MindDropStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    addPendingItem: (item: PendingItem) => {
      set((state) => ({
        pendingItems: {
          ...state.pendingItems,
          [item.dropId]: item,
        },
      }));
    },

    confirmItem: (dropId: string, confirmedItem: MindDropItem) => {
      set((state) => {
        // Remove from pending items
        const { [dropId]: _removed, ...remainingPending } = state.pendingItems;

        return {
          pendingItems: remainingPending,
          items: {
            ...state.items,
            [confirmedItem.id]: confirmedItem,
          },
        };
      });
    },

    updateItem: (id: string, patch: Partial<MindDropItem>) => {
      const currentItem = get().items[id];

      if (!currentItem) {
        console.warn(`[MindDropStore] updateItem: Item with id "${id}" not found, skipping update`);
        return;
      }

      set((state) => ({
        items: {
          ...state.items,
          [id]: {
            ...state.items[id],
            ...patch,
            updatedAt: nowTimestamp(),
          },
        },
      }));
    },

    removeItem: (id: string) => {
      set((state) => {
        const { [id]: _removed, ...remainingItems } = state.items;
        return { items: remainingItems };
      });
    },

    removePendingItem: (dropId: string) => {
      set((state) => {
        const { [dropId]: _removed, ...remainingPending } = state.pendingItems;
        return { pendingItems: remainingPending };
      });
    },

    setItems: (items: MindDropItem[]) => {
      const itemsRecord: Record<string, MindDropItem> = {};
      for (const item of items) {
        itemsRecord[item.id] = item;
      }

      set({
        items: itemsRecord,
        lastFetchedAt: nowTimestamp(),
      });
    },

    hydrateFromDB: (items: MindDropItem[]) => {
      set((state) => {
        const itemsRecord: Record<string, MindDropItem> = {};

        // Add all DB items
        for (const item of items) {
          itemsRecord[item.id] = item;
        }

        // Preserve optimistic items that aren't in DB yet
        for (const [id, item] of Object.entries(state.items)) {
          if (item.isOptimistic && !itemsRecord[id]) {
            itemsRecord[id] = item;
          }
        }

        return {
          items: itemsRecord,
          lastFetchedAt: nowTimestamp(),
          isLoading: false,
        };
      });
    },

    clearAll: () => {
      set(initialState);
    },
  })),
);

// ============================================================================
// Selector Functions
// ============================================================================

/**
 * Get all items filtered by bucket type
 */
export function getItemsByBucket(bucket: MindDropBucket): MindDropItem[] {
  const { items } = useMindDropStore.getState();
  return Object.values(items).filter((item) => item.bucket === bucket);
}

/**
 * Get all items filtered by space ID
 */
export function getItemsBySpace(spaceId: string | null): MindDropItem[] {
  const { items } = useMindDropStore.getState();
  return Object.values(items).filter((item) => item.spaceId === spaceId);
}

/**
 * Get items created today
 */
export function getTodayItems(): MindDropItem[] {
  const { items } = useMindDropStore.getState();
  const startOfToday = getDateService().now();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayISO = startOfToday.toISOString();

  return Object.values(items).filter((item) => item.createdAt >= startOfTodayISO);
}

/**
 * Get the count of pending items
 */
export function getPendingCount(): number {
  const { pendingItems } = useMindDropStore.getState();
  return Object.keys(pendingItems).length;
}

// ============================================================================
// Custom Hooks
// ============================================================================

/**
 * Hook to get combined pending and confirmed items, optionally filtered by bucket.
 * Pending items are converted to MindDropItem format with optimistic flags.
 * Results are sorted by createdAt descending (newest first).
 */
export function useMindDropItems(bucket?: MindDropBucket): MindDropItem[] {
  const items = useMindDropStore((state) => state.items);
  const pendingItems = useMindDropStore((state) => state.pendingItems);

  // Convert pending items to MindDropItem format
  const pendingAsMindDropItems: MindDropItem[] = Object.values(pendingItems)
    .filter((pending) => !bucket || pending.predictedBucket === bucket)
    .map((pending) => ({
      id: `pending-${pending.dropId}`,
      dropId: pending.dropId,
      bucket: pending.predictedBucket,
      subtype: pending.predictedSubtype,
      originalText: pending.text,
      title: pending.text,
      tags: [],
      timeEstimateMinutes: null,
      dueAt: null,
      people: [],
      stage: 'pending' as const,
      createdAt: pending.createdAt,
      updatedAt: pending.createdAt,
      spaceId: pending.spaceId,
      isOptimistic: true,
      aiFailed: false,
      photosFailed: false,
    }));

  // Filter confirmed items by bucket if specified
  const confirmedItems = Object.values(items).filter((item) => !bucket || item.bucket === bucket);

  // Combine and sort by createdAt descending
  const combined = [...pendingAsMindDropItems, ...confirmedItems];
  combined.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA; // Descending (newest first)
  });

  return combined;
}
