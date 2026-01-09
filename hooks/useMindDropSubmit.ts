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
import { findSpaceByName } from '../lib/minddrop/spacePatterns';
import {
  preparePhotoDropText,
  isPhotoOnlyDrop,
  getPhotoDropDefaults,
} from '../lib/minddrop/photoDrop';
import { generateDropId } from '../lib/minddrop/ids';
import { eventBus } from '../lib/events/EventBus';
import { runPhase1 } from '../lib/minddrop/phase1';
import { runPhase2, runPhase2Streaming } from '../lib/minddrop/phase2';
import type { MindDropBucket, LogSubtype } from '../lib/minddrop/types';
import { isTestMode } from '../lib/config/testMode';
import { testLogger } from '../src/utils/TestLogger';
import { setTestProbeEntityId } from '../lib/config/surfaceProbe';
import { QARunner } from '../src/qa/QARunner';
import { checkAllInvariants } from '../lib/minddrop/invariants';
import { buildTodoFields } from '../lib/cortex/textNormalization';
import { env, getEnv } from '../lib/env';

// --- Phase 0: Detect Multi ---

const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

const readSupabaseAnonKey = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  const fromEnvConfig = typeof env.supabaseAnonKey === 'string' ? env.supabaseAnonKey : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
};

interface DetectMultiResult {
  is_multi: boolean;
  segments?: Array<{ text: string; likely_bucket: string }>;
  summary?: string;
  confidence?: number;
}

/**
 * Phase 0: Detect if the input contains multiple distinct items.
 * Runs BEFORE Phase 1 to short-circuit multi-entity drops.
 */
async function detectMulti(text: string): Promise<DetectMultiResult> {
  const cortexUrl = readCortexUrl();
  const anonKey = readSupabaseAnonKey();

  if (!cortexUrl || !anonKey) {
    console.log('[Phase0:DetectMulti] Missing cortex URL or anon key, skipping');
    return { is_multi: false };
  }

  try {
    const response = await fetch(cortexUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        type: 'detect-multi',
        text,
      }),
    });

    if (!response.ok) {
      console.warn('[Phase0:DetectMulti] Request failed:', response.status);
      return { is_multi: false };
    }

    const result = await response.json();
    console.log('[Phase0:DetectMulti] Result:', {
      is_multi: result.is_multi,
      segmentCount: result.segments?.length,
      summary: result.summary,
    });
    return result;
  } catch (err) {
    console.warn('[Phase0:DetectMulti] Error:', err);
    return { is_multi: false };
  }
}

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
  /** The classification confidence (0-1) */
  confidence?: number;
  /** The log subtype (for log bucket) */
  subtype?: LogSubtype | null;
  /** The due date if extracted */
  dueDate?: string | null;
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
  const spaces = useGremlyStore((s) => s.spaces);

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

        // Add to pending items (optimistic UI with heuristic prediction)
        const tempId = `local-${dropId}`;
        addPendingItem({
          dropId,
          text: entityText,
          predictedBucket: bucket,
          predictedSubtype: subtypeHint,
          createdAt: new Date().toISOString(),
          spaceId: resolvedSpaceId,
        });

        if (testEnabled) {
          testLogger.step('optimistic_added', { dropId, tempId });
        }

        // Phase 0: Detect multi-entity drops BEFORE classification
        // This short-circuits multi-drops to avoid running Phase 1 unnecessarily
        const multiResult = await detectMulti(effectiveText);

        if (multiResult.is_multi && multiResult.segments && multiResult.segments.length > 1) {
          console.log('[MindDrop:Submit] Phase 0 detected multi-entity drop', {
            segmentCount: multiResult.segments.length,
            summary: multiResult.summary,
          });

          // Create as multi-entity note
          const entity = await createNote({
            title: multiResult.summary || effectiveText.substring(0, 50),
            body: effectiveText,
            subtype: 'catchall',
            space_id: resolvedSpaceId,
            drop_id: dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            views: {
              minddrop_stage: 'multi_pending',
              ai_pending: false,
              is_multi: true,
              multi_items: multiResult.segments.map((seg) => ({
                text: seg.text,
                bucket: seg.likely_bucket as MindDropBucket,
                subtype: null,
                habitSubtype: null,
                preview_title: seg.text.substring(0, 40),
              })),
              multi_summary_title: multiResult.summary,
            },
          });

          // Emit event for UI updates
          eventBus.emit('entity:created', {
            entity: { ...entity, drop_id: dropId },
            type: 'note',
            spaceId: resolvedSpaceId,
          });

          // Remove pending item
          removePendingItem(dropId);

          if (testEnabled) {
            testLogger.step('phase0_multi_created', {
              entityId: entity.id,
              segmentCount: multiResult.segments.length,
            });
            testLogger.end(true);
          }

          submitLockRef.current = false;
          setIsSubmitting(false);

          return {
            success: true,
            dropId,
            entityId: entity.id,
            bucket: 'log', // Multi stored as note
            confidence: multiResult.confidence,
          };
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

        // Handle multi-entity drops separately
        // Multi-drops are stored as notes with multi metadata
        // User will decide what to do via the MultiSplitModal
        if (phase1Result.is_multi === true && phase1Result.items && phase1Result.items.length > 1) {
          console.log('[MindDrop:Submit] Multi-entity drop detected', {
            itemCount: phase1Result.items.length,
            summaryTitle: phase1Result.summary_title,
          });

          // Create a note to hold the multi-entity drop
          const entity = await createNote({
            title: phase1Result.summary_title || 'Multiple Items',
            body: effectiveText,
            subtype: 'catchall',
            space_id: resolvedSpaceId,
            drop_id: dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            views: {
              minddrop_stage: 'multi_pending',
              ai_pending: false,
              is_multi: true,
              multi_items: phase1Result.items,
              multi_summary_title: phase1Result.summary_title,
            },
          });

          // DEBUG: Log multi note creation
          console.log('[DEBUG:MultiNoteCreate] Saved multi note', {
            noteId: entity.id,
            views_saved: {
              is_multi: true,
              multi_items: phase1Result.items?.length,
              multi_summary_title: phase1Result.summary_title,
            },
          });

          // Emit event for UI updates
          eventBus.emit('entity:created', {
            entity: { ...entity, drop_id: dropId },
            type: 'note',
            spaceId: resolvedSpaceId,
          });

          // Remove pending item
          removePendingItem(dropId);

          if (testEnabled) {
            testLogger.step('multi_entity_created', {
              entityId: entity.id,
              itemCount: phase1Result.items.length,
            });
            testLogger.end(true);
          }

          submitLockRef.current = false;
          setIsSubmitting(false);

          return {
            success: true,
            dropId,
            entityId: entity.id,
            bucket: 'log', // Multi stored as note
            confidence: phase1Result.confidence,
          };
        }

        // Create entity using Phase 1 classification
        const entityType = bucketToEntityType(bucket);

        // For 'today' source, set due_at/start_date to today
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        let entity;

        if (entityType === 'todo') {
          // Extract date from text using local parsing (fast, no AI needed)
          // This provides immediate due_day even before Phase 2 enrichment
          const parsedFields = buildTodoFields(entityText);

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
            name: parsedFields.title || entityText, // Use cleaned title (without "tomorrow")
            body: effectiveText, // Preserve original text
            space_id: resolvedSpaceId,
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
            name: entityText,
            title: entityText, // DB requires title column
            notes: effectiveText, // Preserve original input in notes field
            frequency: 'daily', // Default frequency for habits
            subtype: phase1Result.habitSubtype ?? 'start_habit', // build vs break habit
            space_id: resolvedSpaceId,
            drop_id: dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            start_date: context.source === 'today' ? today : null,
            days_active: null, // Will be set by Phase 2 if user specifies days like "Tuesdays and Thursdays"
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
            },
          } as any); // Cast to any because Habit type doesn't include 'title' but DB requires it
        } else {
          // note (log) - Use Zustand store method - single source of truth
          entity = await createNote({
            title: entityText,
            body: effectiveText,
            subtype: logSubtypeToNoteSubtype(subtypeHint),
            space_id: resolvedSpaceId,
            drop_id: dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
              ...(photoUris.length > 0 && { has_photos: true }),
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
          spaceId: resolvedSpaceId,
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

        runPhase2Streaming(
          entityIdForPhase2,
          effectiveText,
          phase1Result.bucket,
          phase1Result.subtype,
          repo,
          (field, value) => {
            // This callback fires for each field as it streams in
            console.log(`[MindDrop:Phase2:Stream] ${field}:`, value);
          },
        )
          .then((enrichment) => {
            if (enrichment) {
              console.log('[MindDrop:Phase2] Enrichment complete', {
                entityId: entityIdForPhase2,
                smartTitle: enrichment.smart_title?.substring(0, 30) + '...',
                tagsCount: enrichment.tags?.length || 0,
              });

              if (testEnabledForPhase2) {
                testLogger.assert('phase2_enriched', true, {
                  entityId: entityIdForPhase2,
                  smartTitle: enrichment.smart_title,
                  tagsCount: enrichment.tags?.length || 0,
                  hasDate: !!enrichment.extracted_date,
                  hasTimeEstimate: enrichment.time_estimate_minutes !== null,
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
          confidence: phase1Result.confidence,
          subtype: phase1Result.subtype,
          dueDate: (entity as any).due_date ?? (entity as any).due_day ?? null,
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
    [repo, addPendingItem, removePendingItem, createTodo, createHabit, createNote, spaces],
  );

  return { submit, isSubmitting };
}
