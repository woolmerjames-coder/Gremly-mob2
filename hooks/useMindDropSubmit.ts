/**
 * useMindDropSubmit Hook
 *
 * Optimistic Queue System for Mind Drop:
 * - Immediately persists to AsyncStorage queue (crash safety)
 * - Shows card in UI via Zustand pending drops
 * - Processes Phase 0 → 1 → 2 → Supabase in background
 *
 * Returns immediately after enqueue for maximum perceived speed.
 */

import { useCallback, useRef, useState } from 'react';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { heuristicClassify } from '../lib/minddrop/heuristicClassify';
import { findSpaceByName } from '../lib/minddrop/spacePatterns';
import {
  preparePhotoDropText,
  isPhotoOnlyDrop,
  getPhotoDropDefaults,
} from '../lib/minddrop/photoDrop';
import { generateDropId } from '../lib/minddrop/ids';
import { enqueue } from '../lib/minddrop/dropQueue';
import { processDrop } from '../lib/minddrop/dropProcessor';
import type { MindDropBucket, LogSubtype } from '../lib/minddrop/types';
import { isTestMode } from '../lib/config/testMode';
import { testLogger } from '../src/utils/TestLogger';
import { networkStatus } from '../lib/network/NetworkStatus';

/**
 * Context for submitting a mind drop
 */
export interface SubmitContext {
  /** Associated space ID (null for global catch-all) */
  spaceId?: string | null;
  /** Photo URIs attached to the drop */
  photoUris?: string[];
  /** User ID for photo uploads */
  userId?: string | null;
  /** Source of the submission for analytics */
  source: 'minddrop' | 'today' | 'space' | 'photo';
  /** Optional pre-generated drop ID for pending item correlation */
  dropId?: string;
  /** Optional test case name to enable structured test logging */
  testCase?: string;
  /** Override the default due_day (e.g. tomorrow's date for "Plan tomorrow" mode) */
  dueDayOverride?: string | null;
}

/**
 * Result from submitting a mind drop
 */
export interface SubmitResult {
  /** Whether the submission succeeded */
  success: boolean;
  /** The generated drop ID for tracking */
  dropId: string;
  /** The created entity ID (if successful) */
  entityId?: string;
  /** The classified bucket */
  bucket?: MindDropBucket;
  /** The classification confidence (0-1) */
  confidence?: number;
  /** The log subtype (for log bucket) */
  subtype?: LogSubtype | null;
  /** The due date if extracted */
  dueDate?: string | null;
  /** Error if submission failed */
  error?: Error;
  /** Whether this drop crossed the fed threshold */
  justCrossedFed?: boolean;
}

/**
 * Hook for submitting mind drops with optimistic queue system.
 *
 * NEW OPTIMISTIC FLOW:
 * 1. Immediately enqueue to AsyncStorage (crash safety)
 * 2. Add to Zustand pending drops (UI shows card)
 * 3. Return immediately with localId
 * 4. Background: processDrop() handles Phase 0 → 1 → 2 → Supabase
 *
 * @returns Object with submit function and isSubmitting state
 */
export function useMindDropSubmit(): {
  submit: (text: string, context: SubmitContext) => Promise<SubmitResult>;
  isSubmitting: boolean;
} {
  const spaces = useGremlyStore((s) => s.spaces);
  const addPendingDrop = useGremlyStore((s) => s.addPendingDrop);
  const incrementDropCount = useGremlyStore((s) => s.incrementDropCount);
  const previewGaugeDrop = useGremlyStore((s) => s.previewGaugeDrop);

  const submitLockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (text: string, context: SubmitContext): Promise<SubmitResult> => {
      const dropId = context.dropId ?? generateDropId();

      // Test logging setup
      const testCase = context.testCase;
      const testEnabled = testCase && isTestMode();
      if (testEnabled) {
        testLogger.start(testCase, { source: 'MindDrop' });
        testLogger.step('submit_start', {
          textLength: text.length,
          hasAttachments: (context.photoUris?.length ?? 0) > 0,
        });
      }

      // Prevent double submission
      if (submitLockRef.current) {
        if (testEnabled) {
          testLogger.assert('error', false, {
            where: 'submit_lock',
            message: 'Submission already in progress',
          });
          testLogger.end(false);
        }
        return {
          success: false,
          dropId,
          error: new Error('Submission already in progress'),
        };
      }

      submitLockRef.current = true;
      setIsSubmitting(true);

      try {
        // Prepare effective text (handles photo-only drops)
        const photoUris = context.photoUris || [];
        const effectiveText = preparePhotoDropText({ text, photoUris });

        if (!effectiveText) {
          submitLockRef.current = false;
          setIsSubmitting(false);
          if (testEnabled) {
            testLogger.assert('error', false, {
              where: 'empty_text',
              message: 'Cannot submit empty drop',
            });
            testLogger.end(false);
          }
          return {
            success: false,
            dropId,
            error: new Error('Cannot submit empty drop'),
          };
        }

        // Classify the drop - immediate heuristic for optimistic UI
        let bucket: MindDropBucket;
        let subtypeHint: LogSubtype | null;

        // Track space hint and cleaned text from heuristic
        let spaceHint: string | null = null;
        let cleanedText: string | null = null;

        if (isPhotoOnlyDrop({ text, photoUris })) {
          const defaults = getPhotoDropDefaults();
          bucket = defaults.bucket;
          subtypeHint = defaults.subtype;
        } else {
          // Heuristic for immediate optimistic UI
          const heuristic = heuristicClassify(text, {
            hasAttachments: photoUris.length > 0,
            spaceId: context.spaceId,
          });
          bucket = heuristic.bucket;
          subtypeHint = heuristic.subtypeHint;
          spaceHint = heuristic.spaceHint;
          cleanedText = heuristic.cleanedText;
        }

        // Resolve space hint to actual space_id
        let resolvedSpaceId = context.spaceId ?? null;
        if (!resolvedSpaceId && spaceHint && spaces.length > 0) {
          const matchedSpace = findSpaceByName(spaceHint, spaces);
          if (matchedSpace) {
            resolvedSpaceId = matchedSpace.id;
            console.log('[MindDrop:Submit] Resolved space from hint', {
              hint: spaceHint,
              spaceId: matchedSpace.id,
              spaceName: matchedSpace.name,
            });
          }
        }

        // Use cleaned text (with space pattern removed) for entity name if available
        const entityText = cleanedText || effectiveText;

        // ============================================
        // STEP 1: IMMEDIATE (blocking, ~10ms total)
        // ============================================

        // 1a. Write to AsyncStorage queue (crash safety)
        const queuedDrop = await enqueue({
          text: entityText,
          attachments: photoUris.length > 0 ? photoUris : undefined,
          spaceId: resolvedSpaceId,
          source: context.source,
          dueDayOverride: context.dueDayOverride ?? null,
        });

        console.log('[MindDrop:Submit] Enqueued drop', {
          localId: queuedDrop.localId,
          textPreview: entityText.substring(0, 30),
        });

        // 1b. Add to Zustand pending drops (UI shows card immediately)
        addPendingDrop({
          localId: queuedDrop.localId,
          text: entityText,
          spaceId: resolvedSpaceId,
          source: context.source,
          createdAt: queuedDrop.createdAt,
          bucket, // Heuristic prediction for immediate UI
          subtype: subtypeHint,
          status: 'pending',
          _offlineCapture: !networkStatus.isConnected,
        });

        // Instantly preview gauge fill (Soul Document v8: fill rises with the bounce)
        const gaugePreview = previewGaugeDrop();

        if (testEnabled) {
          testLogger.step('optimistic_added', { dropId: queuedDrop.localId });
        }

        // UI is now showing the card - user can continue immediately
        submitLockRef.current = false;
        setIsSubmitting(false);

        // ============================================
        // STEP 2: BACKGROUND (non-blocking, parallel)
        // ============================================

        if (networkStatus.isConnected) {
          // Online: process immediately (existing behavior)
          processDrop(queuedDrop, {
            onPhase0Complete: (localId, isMulti) => {
              console.log('[MindDrop:Background] Phase 0 complete', { localId, isMulti });
              if (testEnabled) {
                testLogger.step('phase0_complete', { localId, isMulti });
              }
            },
            onPhase1Complete: (localId, classifiedBucket) => {
              console.log('[MindDrop:Background] Phase 1 complete', {
                localId,
                bucket: classifiedBucket,
              });
              if (testEnabled) {
                testLogger.step('phase1_complete', { localId, bucket: classifiedBucket });
              }
            },
            onPhase2Complete: (localId) => {
              console.log('[MindDrop:Background] Phase 2 complete', { localId });
              if (testEnabled) {
                testLogger.step('phase2_complete', { localId });
              }
            },
            onSyncComplete: (localId, supabaseId) => {
              console.log('[MindDrop:Background] Synced to Supabase', { localId, supabaseId });

              // Increment drop count for ritual progress
              incrementDropCount()
                .then(({ didAgeUp, newAge }) => {
                  if (didAgeUp) {
                    console.log('[MindDrop:Background] Ritual complete! Gremly aged up to', newAge);
                  }
                })
                .catch((err) => {
                  console.warn('[MindDrop:Background] Failed to increment drop count:', err);
                });

              if (testEnabled) {
                testLogger.assert('sync_complete', true, { localId, supabaseId });
                testLogger.end(true);
              }
            },
            onError: (localId, error) => {
              console.error('[MindDrop:Background] Processing failed', { localId, error });

              // Update status instead of removing — card stays visible for retry
              // The drop remains in AsyncStorage queue (marked 'failed' by dropProcessor)
              // and processAllPending will pick it up on next sweep
              useGremlyStore.getState().updatePendingDropEnrichment(localId, {
                status: 'failed',
                _retryable: true,
              });

              if (testEnabled) {
                testLogger.assert('error', false, {
                  where: 'background_processing',
                  message: error.message,
                });
                testLogger.end(false);
              }
            },
          }).catch((err) => {
            console.error('[MindDrop:Background] Unexpected error', err);
          });
        } else {
          // Offline: drop is safely queued in AsyncStorage via enqueue() above
          // Update the pending drop to show offline status
          const store = useGremlyStore.getState();
          store.updatePendingDropEnrichment(queuedDrop.localId, {
            _offlineCapture: true,
          });
          console.log('[MindDrop:Submit] Offline — drop queued for later processing', {
            localId: queuedDrop.localId,
          });
        }

        // Return immediately with the local ID (not Supabase ID)
        return {
          success: true,
          dropId: queuedDrop.localId,
          bucket, // Heuristic bucket (will be updated by processor)
          confidence: 0.5, // Heuristic confidence
          subtype: subtypeHint,
          justCrossedFed: gaugePreview.justCrossedFed,
        };
      } catch (error) {
        submitLockRef.current = false;
        setIsSubmitting(false);

        if (testEnabled) {
          testLogger.assert('error', false, {
            where: 'submit',
            message: error instanceof Error ? error.message : String(error),
          });
          testLogger.end(false);
        }

        return {
          success: false,
          dropId,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [spaces, addPendingDrop, incrementDropCount, previewGaugeDrop],
  );

  return { submit, isSubmitting };
}
