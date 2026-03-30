/**
 * useDropRecovery
 *
 * Processes any pending Mind Drops that didn't complete in a previous session.
 * Call this once at app startup (e.g., in RootNavigator or a root provider).
 *
 * Recovery handles:
 * - App crash after enqueue() but before processDrop()
 * - App crash during Phase 1/2 classification/enrichment
 * - App crash during Supabase sync
 * - Network failures (up to 3 retries)
 */

import { useEffect, useRef } from 'react';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { cleanupSynced, hasPendingDrops } from '../lib/minddrop/dropQueue';
import { triggerProcessing } from '../lib/minddrop/dropPipeline';

export function useDropRecovery(): void {
  const userId = useGremlyStore((s) => s.userId);
  const hasRun = useRef(false);

  useEffect(() => {
    // Only run once per app session, and only when authenticated
    if (!userId || hasRun.current) return;
    hasRun.current = true;

    const recover = async () => {
      try {
        // Check if there's anything to process first
        const hasPending = await hasPendingDrops();

        if (!hasPending) {
          console.log('[DropRecovery] No pending drops to recover');
          return;
        }

        console.log('[DropRecovery] Found pending drops, starting recovery...');

        // Clean up any already-synced drops first
        const cleanedCount = await cleanupSynced();
        if (cleanedCount > 0) {
          console.log('[DropRecovery] Cleaned up synced drops', { count: cleanedCount });
        }

        // Trigger the pipeline to process any remaining drops
        void triggerProcessing();

        console.log('[DropRecovery] Recovery complete');
      } catch (err) {
        console.error('[DropRecovery] Recovery failed:', err);
        // Don't throw - recovery failure shouldn't crash the app
      }
    };

    // Run recovery after a short delay to not block app startup
    const timeoutId = setTimeout(recover, 1000);

    return () => clearTimeout(timeoutId);
  }, [userId]);
}
