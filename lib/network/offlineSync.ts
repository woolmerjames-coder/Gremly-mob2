import { networkStatus } from './NetworkStatus';
import { getPendingDrops } from '../minddrop/dropQueue';
import { processDrop, reclassifyDegradedEntities } from '../minddrop/dropProcessor';
import { useGremlyStore } from '../store/useGremlyStore';
import { AppState } from 'react-native';

let isFlushing = false;
let consecutiveFailures = 0;

const MAX_BACKOFF_MS = 30_000;
const BASE_DELAY_MS = 2_000;

function getBackoffDelay(): number {
  return Math.min(BASE_DELAY_MS * Math.pow(2, consecutiveFailures), MAX_BACKOFF_MS);
}

function waitWithAbort(ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(true);
    }, ms);

    const unsub = networkStatus.subscribe((connected) => {
      if (!connected) {
        clearTimeout(timer);
        unsub();
        resolve(false);
      }
    });
  });
}

async function flushOfflineQueue(): Promise<void> {
  if (isFlushing || !networkStatus.isConnected) return;

  isFlushing = true;

  try {
    const pending = await getPendingDrops();

    if (pending.length === 0) {
      consecutiveFailures = 0;
      return;
    }

    console.log(`[OfflineSync] Flushing ${pending.length} queued drops`);

    for (const drop of pending) {
      if (!networkStatus.isConnected) break;

      try {
        await processDrop(drop, {
          onSyncComplete: (localId, supabaseId) => {
            console.log('[OfflineSync] Drop synced:', { localId, supabaseId });
          },
          onError: (localId, error) => {
            console.warn('[OfflineSync] Drop processing error:', { localId, error: error.message });
          },
        });
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures++;
        const delay = getBackoffDelay();
        console.log(`[OfflineSync] Drop failed, backoff ${delay}ms`, {
          localId: drop.localId,
          failures: consecutiveFailures,
          error: String(err),
        });

        const shouldContinue = await waitWithAbort(delay);
        if (!shouldContinue) break;
      }
    }

    const { isInitialized, refreshFromServer } = useGremlyStore.getState();
    if (isInitialized && networkStatus.isConnected) {
      await refreshFromServer();
    }
  } finally {
    isFlushing = false;
  }
}

export function initOfflineSync(): void {
  // Reconnect: flush pending drops when network transitions offline → online
  networkStatus.subscribe((connected) => {
    if (connected) {
      consecutiveFailures = 0;
      setTimeout(async () => {
        await flushOfflineQueue();
        await reclassifyDegradedEntities();
      }, 2_000);
    }
  });

  // App resume: flush pending drops when returning from background
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active' && networkStatus.isConnected) {
      setTimeout(async () => {
        await flushOfflineQueue();
        await reclassifyDegradedEntities();
      }, 1_500);
    }
  });

  if (networkStatus.isConnected) {
    setTimeout(() => flushOfflineQueue(), 5_000);
  }
}
