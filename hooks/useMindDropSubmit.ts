/**
 * useMindDropSubmit Hook
 *
 * BRIDGE VERSION: Uses the NEW Zustand store but calls EXISTING repo create methods.
 * This allows incremental migration without breaking existing functionality.
 *
 * TODO: Phase C will replace direct repo.create with Phase 1 + Phase 2 pipeline
 */

import { useCallback, useRef, useState } from 'react';
import { useMindDropStore } from '../lib/stores/mindDropStore';
import { useRepo } from '../providers/RepoProvider';
import { heuristicClassify } from '../lib/minddrop/heuristicClassify';
import {
  preparePhotoDropText,
  isPhotoOnlyDrop,
  getPhotoDropDefaults,
} from '../lib/minddrop/photoDrop';
import { generateDropId } from '../lib/minddrop/ids';
import { eventBus } from '../lib/events/EventBus';
import type { MindDropBucket, LogSubtype } from '../lib/minddrop/types';

/**
 * Context for submitting a mind drop
 */
export interface SubmitContext {
  /** Associated space ID (null for global catch-all) */
  spaceId?: string | null;
  /** Photo URIs attached to the drop */
  photoUris?: string[];
  /** Source of the submission for analytics */
  source: 'minddrop' | 'today' | 'space' | 'photo';
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
 * Map LogSubtype to NoteSubtype for repo operations
 * NoteSubtype is: 'journal' | 'list' | 'catchall' | 'idea' | 'reference'
 * LogSubtype is: 'journal' | 'idea' | 'general'
 */
function logSubtypeToNoteSubtype(subtype: LogSubtype | null): 'journal' | 'idea' | 'catchall' {
  if (subtype === 'journal') return 'journal';
  if (subtype === 'idea') return 'idea';
  return 'catchall'; // 'general' maps to 'catchall'
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

  const submitLockRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async (text: string, context: SubmitContext): Promise<SubmitResult> => {
      const dropId = generateDropId();

      // Prevent double submission
      if (submitLockRef.current) {
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
          return {
            success: false,
            dropId,
            error: new Error('Cannot submit empty drop'),
          };
        }

        // Classify the drop
        let bucket: MindDropBucket;
        let subtypeHint: LogSubtype | null;

        if (isPhotoOnlyDrop({ text, photoUris })) {
          const defaults = getPhotoDropDefaults();
          bucket = defaults.bucket;
          subtypeHint = defaults.subtype;
        } else {
          const classification = heuristicClassify(text, {
            hasAttachments: photoUris.length > 0,
            spaceId: context.spaceId,
          });
          bucket = classification.bucket;
          subtypeHint = classification.subtypeHint;
        }

        // Add to pending items (optimistic UI)
        addPendingItem({
          dropId,
          text: effectiveText,
          predictedBucket: bucket,
          predictedSubtype: subtypeHint,
          createdAt: new Date().toISOString(),
          spaceId: context.spaceId ?? null,
        });

        // BRIDGE: Create entity directly using existing repo
        // TODO: Phase C will replace direct repo.create with Phase 1 + Phase 2 pipeline
        const entityType = bucketToEntityType(bucket);

        // For 'today' source, set due_at/start_date to today
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

        let entity;

        if (entityType === 'todo') {
          entity = await repo.create({
            type: 'todo',
            name: effectiveText,
            space_id: context.spaceId ?? null,
            dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            due_date: context.source === 'today' ? today : null,
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
            },
          });
        } else if (entityType === 'habit') {
          entity = await repo.create({
            type: 'habit',
            name: effectiveText,
            title: effectiveText,
            frequency: 'daily', // Default frequency for habits
            space_id: context.spaceId ?? null,
            dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            start_date: context.source === 'today' ? today : null,
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
            },
          });
        } else {
          // note (log)
          entity = await repo.create({
            type: 'note',
            title: effectiveText,
            body: effectiveText,
            subtype: logSubtypeToNoteSubtype(subtypeHint),
            space_id: context.spaceId ?? null,
            dropId,
            origin: context.source === 'space' ? 'space_chat' : 'catchall',
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
            },
          });
        }

        // Emit event to sync store (storeSync will handle confirmation)
        eventBus.emit('entity:created', {
          entity: { ...entity, drop_id: dropId },
          type: entityType,
          spaceId: context.spaceId ?? null,
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

        return {
          success: false,
          dropId,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }
    },
    [repo, addPendingItem, removePendingItem],
  );

  return { submit, isSubmitting };
}
