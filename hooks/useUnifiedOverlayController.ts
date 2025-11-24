/**
 * useUnifiedOverlayController - Phase 7 unified overlay state management
 * Centralized controller for opening create/edit overlays across the app
 */
import { useCallback, useRef } from 'react';
import type { AppRecord, CanonicalType, LogSubtype } from '../lib/types';
import { persistedNoteSubtypeToLogSubtype } from '../lib/logSubtypes';
import { useGlobalOverlay } from '../contexts/OverlayContext';

type EntityType = CanonicalType;

const CATCHALL_LABEL = 'catchall';
const NEEDS_REVIEW_LABEL = 'needs_review';

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
  logSubtype?: LogSubtype | null;
  conversionMeta?: ConversionMeta;
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    logSubtype?: LogSubtype | null;
  };
  initialText?: string | null;
  suppressOverlayOpen?: boolean;
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
    let logSubtype: LogSubtype | null = null;

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

      if (labels?.includes?.(NEEDS_REVIEW_LABEL) || recordSubtype === CATCHALL_LABEL) {
        entityType = 'unsorted';
        logSubtype = null;
      } else {
        entityType = 'log';
        logSubtype = persistedNoteSubtypeToLogSubtype(recordSubtype ?? null);
      }
    } else {
      entityType = 'log';
      logSubtype = null; // plain
    }

    return { entityType, logSubtype };
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
        const inferredLogSubtype = opts.initialEntity?.logSubtype ?? opts.logSubtype ?? null;

        contextOpenCreate({
          type: inferredType ?? undefined,
          spaceId: opts.spaceId,
          logSubtype: inferredType === 'log' ? (inferredLogSubtype ?? null) : null,
          conversionMeta: opts.conversionMeta,
          initialEntity: opts.initialEntity,
          initialText: opts.initialText ?? null,
          suppressOverlayOpen: opts.suppressOverlayOpen,
        });
      } else {
        const { record, spaceId } = request.options;
        const { entityType, logSubtype } = resolveEntityFromRecord(record);
        console.log('[OverlayController] openEdit called with state:', {
          visible: true,
          mode: request.mode,
          initialEntity: {
            type: entityType,
            id: record.id,
            logSubtype,
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
      if (options.suppressOverlayOpen) {
        return;
      }
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
