/**
 * useUnifiedOverlayController - Phase 7 unified overlay state management
 * Centralized controller for opening create/edit overlays across the app
 */
import { useCallback, useRef } from 'react';
import type { AppRecord } from '../lib/types';
import { useGlobalOverlay } from '../contexts/OverlayContext';

type EntityType = 'habit' | 'todo' | 'journal' | 'note' | 'person' | 'unsorted';

interface ConversionMeta {
  origin?: string;
  ai_placed?: boolean;
  why_string?: string | null;
  source_message_id?: string | null;
  // Phase 10.7B: Initial values for prefill
  initialTitle?: string;
  initialNote?: string;
  // Optional: prefill todo due date (ISO yyyy-mm-dd or full ISO)
  initialDueDate?: string | null;
}

interface CreateOptions {
  type?: EntityType;
  spaceId?: string | null;
  subtype?: string | null;
  conversionMeta?: ConversionMeta;
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    subtype?: string | null;
  };
}

interface EditOptions {
  record: AppRecord;
  spaceId?: string | null;
}

interface ViewOptions {
  record: AppRecord;
  spaceId?: string | null;
}

type QueuedOpenRequest =
  | { mode: 'create'; options: CreateOptions | undefined }
  | { mode: 'edit'; options: EditOptions }
  | { mode: 'view'; options: ViewOptions };

export function useUnifiedOverlayController() {
  const {
    state: globalState,
    openCreate: contextOpenCreate,
    openEdit: contextOpenEdit,
    close: contextClose,
  } = useGlobalOverlay();

  const isOpeningRef = useRef(false);
  const queuedRef = useRef<QueuedOpenRequest | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  const resolveEntityFromRecord = useCallback((record: AppRecord) => {
    let entityType: EntityType;
    let subtype: string | null = null;

    if (record.type === 'habit') {
      entityType = 'habit';
    } else if (record.type === 'todo') {
      entityType = 'todo';
    } else if (record.type === 'note') {
      const noteRecord = record as AppRecord & {
        labels?: string[];
        subtype?: string | null;
      };

      const labels = noteRecord.labels;
      const recordSubtype = noteRecord.subtype ?? undefined;

      if (labels?.includes?.('needs_review') || recordSubtype === 'catchall') {
        entityType = 'unsorted';
        subtype = 'catchall';
      } else if (recordSubtype === 'journal') {
        entityType = 'journal';
        subtype = recordSubtype;
      } else {
        entityType = 'note';
        subtype = recordSubtype ?? null;
      }
    } else {
      entityType = 'note';
    }

    return { entityType, subtype };
  }, []);

  const executeOpen = useCallback(
    function run(request: QueuedOpenRequest): void {
      isOpeningRef.current = true;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (request.mode === 'create') {
        const opts = request.options ?? {};
        const inferredType = opts.initialEntity?.type ?? opts.type ?? null;
        const inferredSubtype = opts.initialEntity?.subtype ?? opts.subtype ?? null;

        contextOpenCreate({
          type: inferredType ?? undefined,
          spaceId: opts.spaceId,
          subtype: inferredSubtype ?? null,
          conversionMeta: opts.conversionMeta,
        });
      } else {
        const { record, spaceId } = request.options;
        const { entityType, subtype } = resolveEntityFromRecord(record);
        console.log('[OverlayController] openEdit called with state:', {
          visible: true,
          mode: request.mode,
          initialEntity: {
            type: entityType,
            id: record.id,
            subtype,
          },
          initialSpaceId: spaceId,
        });

        contextOpenEdit({ record, spaceId });
      }

      rafRef.current = requestAnimationFrame(() => {
        isOpeningRef.current = false;
        const next = queuedRef.current;
        queuedRef.current = undefined;
        if (next) {
          run(next);
        }
      });
    },
    [contextOpenCreate, contextOpenEdit, resolveEntityFromRecord],
  );

  const enqueueOpen = useCallback(
    (request: QueuedOpenRequest) => {
      if (isOpeningRef.current) {
        queuedRef.current = request;
        return;
      }
      executeOpen(request);
    },
    [executeOpen],
  );

  const openCreate = useCallback(
    (options: CreateOptions = {}) => {
      enqueueOpen({ mode: 'create', options });
    },
    [enqueueOpen],
  );

  const openEdit = useCallback(
    (options: EditOptions) => {
      enqueueOpen({ mode: 'edit', options });
    },
    [enqueueOpen],
  );

  const openView = useCallback(
    (options: ViewOptions) => {
      enqueueOpen({ mode: 'view', options });
    },
    [enqueueOpen],
  );

  const close = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    queuedRef.current = undefined;
    isOpeningRef.current = false;
    contextClose();
  }, [contextClose]);

  return {
    state: {
      ...globalState,
      mode: globalState.mode as 'create' | 'edit' | 'view',
    },
    openCreate,
    openEdit,
    openView,
    close,
  };
}
