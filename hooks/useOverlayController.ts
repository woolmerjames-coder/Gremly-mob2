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
import type { AppRecord } from '../lib/types';

type EntityType = 'habit' | 'todo' | 'note' | 'journal' | 'person' | 'unsorted';

interface OverlayState {
  visible: boolean;
  mode: 'create' | 'edit';
  initialEntity?: {
    type: EntityType;
    id?: string;
    subtype?: string | null;
  } | null;
  initialSpaceId?: string | null;
}

interface OpenCreateParams {
  type?: EntityType;
  spaceId?: string | null;
}

interface OpenEditParams {
  record: AppRecord;
  spaceId?: string | null;
}

export interface OverlayController {
  state: OverlayState;
  openCreate: (params?: OpenCreateParams) => void;
  openEdit: (params: OpenEditParams) => void;
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
  const useUnifiedOverlay =
    process.env.EXPO_PUBLIC_UNIFIED_OVERLAY === 'true' ||
    process.env.EXPO_PUBLIC_UNIFIED_OVERLAY === undefined; // Default to true

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

  const openCreate = useCallback((params?: OpenCreateParams) => {
    setState({
      visible: true,
      mode: 'create',
      initialEntity: params?.type ? { type: params.type, subtype: null } : null,
      initialSpaceId: params?.spaceId,
    });
  }, []);

  const openEdit = useCallback((params: OpenEditParams) => {
    const { record, spaceId } = params;

    // Map AppRecord type to EntityType
    let entityType: EntityType = record.type as EntityType;
    let subtype: string | null = null;

    if (record.type === 'note') {
      const labels = (record as any)?.labels as string[] | undefined;
      const recordSubtype = (record as any)?.subtype as string | undefined;

      if (labels?.includes?.('needs_review') || recordSubtype === 'catchall') {
        entityType = 'unsorted';
        subtype = 'catchall';
      } else if (recordSubtype === 'journal') {
        entityType = 'journal';
        subtype = recordSubtype;
      }
    }

    setState({
      visible: true,
      mode: 'edit',
      initialEntity: {
        type: entityType,
        id: record.id,
        subtype,
      },
      initialSpaceId: spaceId,
    });
  }, []);

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
    close,
  };
}
