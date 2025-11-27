/**
 * useOverlayController - Feature-flagged overlay controller
 *
 * This hook wraps the unified overlay controller and provides a clean rollback path
 * to legacy overlays via the EXPO_PUBLIC_UNIFIED_OVERLAY feature flag.
 *
 * Usage:
 *   const overlayController = useOverlayController();
 *   overlayController.openCreate({ type: 'habit', spaceId: '123' });
 *   overlayController.openEdit({ record, spaceId: '123' });
 *   overlayController.close();
 *
 * Feature Flag:
 *   EXPO_PUBLIC_UNIFIED_OVERLAY=true  → Use UnifiedCreateOverlay (Phase 7)
 *   EXPO_PUBLIC_UNIFIED_OVERLAY=false → Use legacy ManualAddOverlay (Phase 6)
 */

import { useState, useCallback } from 'react';
import type { AppRecord, CanonicalType, LogSubtype } from '../lib/types';
import { persistedNoteSubtypeToLogSubtype } from '../lib/logSubtypes';

const isFlagEnabled = (value?: string | null): boolean => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === 'on' || normalized === 'true';
};

type EntityType = CanonicalType;
const CATCHALL_LABEL = 'catchall';
const NEEDS_REVIEW_LABEL = 'needs_review';

interface OverlayState {
  visible: boolean;
  mode: 'create' | 'edit' | 'view';
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    logSubtype?: LogSubtype | null;
  } | null;
  initialSpaceId?: string | null;
}

interface OpenCreateParams {
  type?: EntityType;
  spaceId?: string | null;
  logSubtype?: LogSubtype | null;
  suppressOverlayOpen?: boolean;
  defaultDueToday?: boolean; // When true, todo defaults to due today (used by Now page)
}

interface OpenEditParams {
  record: AppRecord;
  spaceId?: string | null;
}

interface OpenViewParams {
  record: AppRecord;
  spaceId?: string | null;
}

export interface OverlayController {
  state: OverlayState;
  openCreate: (params?: OpenCreateParams) => void;
  openEdit: (params: OpenEditParams) => void;
  openView: (params: OpenViewParams) => void;
  close: () => void;
}

/**
 * Feature-flagged overlay controller
 * Delegates to unified or legacy implementation based on flag
 */
export function useOverlayController(): OverlayController {
  // Always call both hooks to maintain hook order
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useUnifiedOverlayController } = require('./useUnifiedOverlayController');
  const unifiedController = useUnifiedOverlayController();
  const legacyController = useLegacyOverlayController();

  // Decide which to return based on flag
  const canonicalTypesOn = isFlagEnabled(process.env.EXPO_PUBLIC_CANONICAL_TYPES);
  const unifiedOverlayFlag = process.env.EXPO_PUBLIC_UNIFIED_OVERLAY;
  const useUnifiedOverlay =
    canonicalTypesOn || isFlagEnabled(unifiedOverlayFlag) || unifiedOverlayFlag === undefined; // Default to true when unset

  return useUnifiedOverlay ? unifiedController : legacyController;
}

/**
 * Legacy overlay controller (Phase 6 compatibility)
 * Provides same API as unified controller but uses local state management
 */
function useLegacyOverlayController(): OverlayController {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    mode: 'create',
    initialEntity: null,
    initialSpaceId: null,
  });

  const resolveEntityFromRecord = useCallback(
    (record: AppRecord): { entityType: EntityType; logSubtype: LogSubtype | null } => {
      if (record.type === 'habit') {
        return { entityType: 'habit', logSubtype: null };
      }
      if (record.type === 'todo') {
        return { entityType: 'todo', logSubtype: null };
      }
      if (record.type === 'note') {
        const labels = (record as any)?.labels as string[] | undefined;
        const recordSubtype = (record as any)?.subtype as string | undefined;

        if (labels?.includes?.(NEEDS_REVIEW_LABEL) || recordSubtype === CATCHALL_LABEL) {
          return { entityType: 'unsorted', logSubtype: null };
        }

        return {
          entityType: 'log',
          logSubtype: persistedNoteSubtypeToLogSubtype(recordSubtype ?? null),
        };
      }

      return { entityType: 'log', logSubtype: 'everything_else' };
    },
    [],
  );

  const openCreate = useCallback((params?: OpenCreateParams) => {
    if (params?.suppressOverlayOpen) {
      return;
    }
    setState({
      visible: true,
      mode: 'create',
      initialEntity: params?.type
        ? {
            type: params.type,
            logSubtype: params.type === 'log' ? (params.logSubtype ?? null) : null,
          }
        : null,
      initialSpaceId: params?.spaceId,
    });
  }, []);

  const openEdit = useCallback(
    (params: OpenEditParams) => {
      const { record, spaceId } = params;
      const { entityType, logSubtype } = resolveEntityFromRecord(record);

      setState({
        visible: true,
        mode: 'edit',
        initialEntity: {
          type: entityType,
          id: record.id,
          logSubtype,
        },
        initialSpaceId: spaceId,
      });
    },
    [resolveEntityFromRecord],
  );

  const openView = useCallback(
    (params: OpenViewParams) => {
      const { record, spaceId } = params;
      const { entityType, logSubtype } = resolveEntityFromRecord(record);

      setState({
        visible: true,
        mode: 'view',
        initialEntity: {
          type: entityType,
          id: record.id,
          logSubtype,
        },
        initialSpaceId: spaceId,
      });
    },
    [resolveEntityFromRecord],
  );

  const close = useCallback(() => {
    setState({
      visible: false,
      mode: 'create',
      initialEntity: null,
      initialSpaceId: null,
    });
  }, []);

  return {
    state,
    openCreate,
    openEdit,
    openView,
    close,
  };
}
