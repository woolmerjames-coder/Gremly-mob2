import { networkStatus } from './NetworkStatus';
import { triggerProcessing, reclassifyDegradedEntities } from '../minddrop/dropPipeline';
import { useGremlyStore } from '../store/useGremlyStore';
import { AppState } from 'react-native';

async function flushOfflineQueue(): Promise<void> {
  if (!networkStatus.isConnected) return;

  console.log('[OfflineSync] Triggering pipeline processing for queued drops');
  void triggerProcessing();

  const { isInitialized, refreshFromServer } = useGremlyStore.getState();
  if (isInitialized && networkStatus.isConnected) {
    await refreshFromServer();
  }
}

export function initOfflineSync(): void {
  // Reconnect: flush pending drops when network transitions offline → online
  networkStatus.subscribe((connected) => {
    if (connected) {
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
