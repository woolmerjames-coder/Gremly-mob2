/**
 * useMindDropSubmit Hook
 *
 * Two-phase Mind Drop pipeline:
 * - Phase 1 runs synchronously for classification (with 2s timeout)
 * - Phase 2 runs in background after entity is saved (enrichment)
 *
 * Uses the Zustand store for optimistic UI and existing repo for persistence.
 */

import { useCallback, useRef, useState } from 'react';
import { useMindDropStore } from '../lib/stores/mindDropStore';
import { useRepo } from '../providers/RepoProvider';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import { heuristicClassify } from '../lib/minddrop/heuristicClassify';
import {
  preparePhotoDropText,
  isPhotoOnlyDrop,
  getPhotoDropDefaults,
} from '../lib/minddrop/photoDrop';
import { generateDropId } from '../lib/minddrop/ids';
import { eventBus } from '../lib/events/EventBus';
import { runPhase1 } from '../lib/minddrop/phase1';
import { runPhase2 } from '../lib/minddrop/phase2';
import type { MindDropBucket, LogSubtype } from '../lib/minddrop/types';
import { isTestMode } from '../lib/config/testMode';
import { testLogger } from '../src/utils/TestLogger';
import { setTestProbeEntityId } from '../lib/config/surfaceProbe';
import { QARunner } from '../src/qa/QARunner';
import { checkAllInvariants } from '../lib/minddrop/invariants';
import { buildTodoFields } from '../lib/cortex/textNormalization';

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
  /** Error if submission failed */
  error?: Error;
}

/**
 * Map MindDropBucket to entity type for repo operations
 */
function bucketToEntityType(bucket: MindDropBucket): 'todo' | 'habit' | 'note' {
  switch (bucket) {
    case 'todo':
      return 'todo';
    case 'habit':
      return 'habit';
    case 'log':
      return 'note';
  }
}

/**
 * Map LogSubtype to NoteSubtype for database persistence.
 *
 * Log classification subtypes:
 * - log-journal → subtype: 'journal'
 * - log-idea → subtype: 'idea'
 * - log-general → subtype: 'catchall' (default for all other logs)
 *
 * The 'catchall' subtype in the database represents log-general.
 */
function logSubtypeToNoteSubtype(subtype: LogSubtype | null): 'journal' | 'idea' | 'catchall' {
  if (subtype === 'journal') return 'journal';
  if (subtype === 'idea') return 'idea';
  return 'catchall'; // log-general → stored as 'catchall'
}

/**
 * Hook for submitting mind drops with optimistic UI updates.
 *
 * BRIDGE VERSION: Uses new Zustand store for state management but
 * calls existing repo methods for persistence.
 *
 * @returns Object with submit function and isSubmitting state
 */
export function useMindDropSubmit(): {
  submit: (text: string, context: SubmitContext) => Promise<SubmitResult>;
  isSubmitting: boolean;
} {
  const repo = useRepo();
  const addPendingItem = useMindDropStore((state) => state.addPendingItem);
  const removePendingItem = useMindDropStore((state) => state.removePendingItem);

  // Zustand store methods - single source of truth for entity creation
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const createNote = useGremlyStore((s) => s.createNote);

  const submitLockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (text: string, context: SubmitContext): Promise<SubmitResult> => {
      // Use provided dropId for pending item correlation, or generate a new one
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
        }

        // Add to pending items (optimistic UI with heuristic prediction)
        const tempId = `local-${dropId}`;
        addPendingItem({
          dropId,
          text: effectiveText,
          predictedBucket: bucket,
          predictedSubtype: subtypeHint,
          createdAt: new Date().toISOString(),
          spaceId: context.spaceId ?? null,
        });

        if (testEnabled) {
          testLogger.step('optimistic_added', { dropId, tempId });
        }

        // Phase 1: Run classification (may confirm or correct heuristic)
        // Phase 1 runs synchronously, Phase 2 runs in background after entity is saved
        const phase1Result = await runPhase1(effectiveText, {
          hasAttachments: photoUris.length > 0,
          spaceId: context.spaceId ?? null,
        });

        // Use Phase 1 result for entity creation (may differ from heuristic)
        bucket = phase1Result.bucket;
        subtypeHint = phase1Result.subtype;

        console.log('[MindDrop:Submit] Phase 1 complete', {
          bucket,
          subtype: subtypeHint,
          confidence: phase1Result.confidence,
          source: phase1Result.source,
        });

        if (testEnabled) {
          testLogger.step('phase1_complete', {
            bucket,
            subtype: subtypeHint,
            confidence: phase1Result.confidence,
            source: phase1Result.source,
          });
        }

        // Create entity using Phase 1 classification
        const entityType = bucketToEntityType(bucket);

        // For 'today' source, set due_at/start_date to today
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        let entity;

        if (entityType === 'todo') {
          // Extract date from text using local parsing (fast, no AI needed)
          // This provides immediate due_day even before Phase 2 enrichment
          const parsedFields = buildTodoFields(effectiveText);

          // Determine due_day: explicit from text > today source > null
          let initialDueDay: string | null = null;
          let initialDueDate: string | null = null;
          let initialDueTime: string | null = null;

          if (parsedFields.dueDay) {
            // User said "tomorrow", "next monday", etc.
            initialDueDay = parsedFields.dueDay;
            initialDueDate = parsedFields.dueDay;
            initialDueTime = parsedFields.dueTime ?? null;
          } else if (context.source === 'today') {
            // Dropped from Today tab → due today
            initialDueDay = today;
            initialDueDate = today;
          }

          // Use Zustand store method - single source of truth
          entity = await createTodo({
            name: parsedFields.title || effectiveText, // Use cleaned title (without "tomorrow")
            body: effectiveText, // Preserve original text
            space_id: context.spaceId ?? null,
            drop_id: dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            due_day: initialDueDay,
            due_date: initialDueDate,
            due_time: initialDueTime,
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
            },
          });
        } else if (entityType === 'habit') {
          // Use Zustand store method - single source of truth
          // Note: DB requires both 'name' and 'title' columns
          entity = await createHabit({
            name: effectiveText,
            title: effectiveText, // DB requires title column
            frequency: 'daily', // Default frequency for habits
            space_id: context.spaceId ?? null,
            drop_id: dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            start_date: context.source === 'today' ? today : null,
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
            },
          } as any); // Cast to any because Habit type doesn't include 'title' but DB requires it
        } else {
          // note (log) - Use Zustand store method - single source of truth
          entity = await createNote({
            title: effectiveText,
            body: effectiveText,
            subtype: logSubtypeToNoteSubtype(subtypeHint),
            space_id: context.spaceId ?? null,
            drop_id: dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
            },
            photoUris, // Photos will be uploaded automatically by the store
          });
        }

        // Emit event for other listeners (CatchAllNotepad, etc.) to update their local state
        // Note: Zustand store is already updated by the create methods above
        console.log('[MindDrop:Submit] Emitting entity:created event');
        eventBus.emit('entity:created', {
          entity: { ...entity, drop_id: dropId },
          type: entityType,
          spaceId: context.spaceId ?? null,
        });

        // Tap for QA runner (dev-only, no-op in prod)
        if (__DEV__) {
          QARunner.captureEntityCreated({
            entityId: entity.id,
            dropId,
            type: entityType,
          });
        }

        if (testEnabled) {
          testLogger.assert('entity_created', true, { entityId: entity.id, dropId });
          // Set up surface probe to track this entity across surfaces
          setTestProbeEntityId(entity.id);
        }

        // Run invariant checks on newly created entity (dev only)
        if (__DEV__) {
          // Safe property access for different entity types
          const entityAny = entity as unknown as Record<string, unknown>;
          const invariantResult = checkAllInvariants({
            id: entity.id,
            bucket: phase1Result.bucket,
            title: (entityAny.title as string) ?? (entityAny.name as string),
            name: (entityAny.name as string) ?? (entityAny.title as string),
            body: entityAny.body as string | null | undefined,
            has_list: entityAny.has_list as boolean | undefined,
            list_items: entityAny.list_items as unknown[] | null | undefined,
            due_date: entityAny.due_date as string | null | undefined,
            due_day: entityAny.due_day as string | null | undefined,
          });
          if (!invariantResult.valid) {
            console.warn('[MindDrop:Submit] Invariant violations:', invariantResult.violations);
          }
        }

        // Resolve the pending item now that entity is created
        // This removes the "Organizing..." state and allows the real item to show
        removePendingItem(dropId);
        console.log('[MindDrop:Submit] Resolved pending item', { dropId, entityId: entity.id });

        if (testEnabled) {
          testLogger.step('pending_resolved', { entityId: entity.id, tempId, dropId });
        }

        // Phase 2: Run enrichment in background (don't await)
        // This will update the entity with smart title, tags, time estimates, etc.
        if (testEnabled) {
          testLogger.step('phase2_start', { entityId: entity.id });
        }

        // Capture entityId and testEnabled for closure
        const entityIdForPhase2 = entity.id;
        const testEnabledForPhase2 = testEnabled;

        runPhase2(entityIdForPhase2, effectiveText, phase1Result.bucket, phase1Result.subtype, repo)
          .then((enrichment) => {
            if (enrichment) {
              console.log('[MindDrop:Phase2] Enrichment complete', {
                entityId: entityIdForPhase2,
                smartTitle: enrichment.smartTitle.substring(0, 30) + '...',
                tagsCount: enrichment.tags.length,
              });

              if (testEnabledForPhase2) {
                testLogger.assert('phase2_enriched', true, {
                  entityId: entityIdForPhase2,
                  smartTitle: enrichment.smartTitle,
                  tagsCount: enrichment.tags.length,
                  hasDate: !!enrichment.extractedDate,
                  hasTimeEstimate: enrichment.timeEstimateMinutes !== null,
                });
                testLogger.end(true);
              }
              // EventBus will notify views of the update via repo.update
            } else if (testEnabledForPhase2) {
              // Phase 2 returned null (no enrichment needed or skipped)
              testLogger.assert('phase2_enriched', true, {
                entityId: entityIdForPhase2,
                skipped: true,
              });
              testLogger.end(true);
            }
          })
          .catch((err) => {
            console.warn('[MindDrop:Phase2] Enrichment failed', err);
            if (testEnabledForPhase2) {
              testLogger.assert('error', false, {
                where: 'phase2',
                message: err instanceof Error ? err.message : String(err),
              });
              testLogger.end(false);
            }
          });

        submitLockRef.current = false;
        setIsSubmitting(false);

        return {
          success: true,
          dropId,
          entityId: entity.id,
          bucket,
        };
      } catch (error) {
        // Clean up pending item on error
        removePendingItem(dropId);

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
    [repo, addPendingItem, removePendingItem, createTodo, createHabit, createNote],
  );

  return { submit, isSubmitting };
}
