/**
 * useUnifiedOverlayController - Phase 7 unified overlay state management
 * Centralized controller for opening create/edit overlays across the app
 */
import { useState, useCallback, useRef } from 'react';
import type { AppRecord } from '../lib/types';

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

interface OverlayState {
  visible: boolean;
  mode: 'create' | 'edit';
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    subtype?: string | null;
  };
  initialSpaceId?: string | null;
  conversionMeta?: ConversionMeta;
}

interface CreateOptions {
  type?: EntityType;
  spaceId?: string | null;
  subtype?: string | null;
  conversionMeta?: ConversionMeta;
}

interface EditOptions {
  record: AppRecord;
  spaceId?: string | null;
}

export function useUnifiedOverlayController() {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    mode: 'create',
  });

  // Debounce guard to prevent rapid re-opens
  const isOpeningRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const openCreate = useCallback(
    ({ type, spaceId, subtype, conversionMeta }: CreateOptions = {}) => {
      if (isOpeningRef.current) {
        console.log('[OverlayController] open already in progress, ignoring');
        return;
      }

      isOpeningRef.current = true;
      setState({
        visible: true,
        mode: 'create',
        initialEntity: type ? { type, id: undefined, subtype: subtype || null } : undefined,
        initialSpaceId: spaceId,
        conversionMeta,
      });

      // Reset debounce flag after 600ms
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        isOpeningRef.current = false;
      }, 600);
    },
    [],
  );

  const openEdit = useCallback(({ record, spaceId }: EditOptions) => {
    if (isOpeningRef.current) {
      console.log('[OverlayController] open already in progress, ignoring');
      return;
    }

    // Map AppRecord to entity type
    let entityType: EntityType;
    let subtype: string | null = null;

    if (record.type === 'habit') {
      entityType = 'habit';
    } else if (record.type === 'todo') {
      entityType = 'todo';
    } else if (record.type === 'note') {
      const labels = (record as any)?.labels as string[] | undefined;
      const recordSubtype = (record as any)?.subtype as string | undefined;

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
      // Fallback to note family
      entityType = 'note';
    }

    const newState = {
      visible: true,
      mode: 'edit' as const,
      initialEntity: {
        type: entityType,
        id: record.id,
        subtype,
      },
      initialSpaceId: spaceId,
    };

    console.log('[OverlayController] openEdit called with state:', newState);

    isOpeningRef.current = true;
    setState(newState);

    // Reset debounce flag after 600ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      isOpeningRef.current = false;
    }, 600);
  }, []);

  const close = useCallback(() => {
    setState({
      visible: false,
      mode: 'create',
      initialEntity: undefined,
      initialSpaceId: undefined,
      conversionMeta: undefined,
    });
    // Allow immediate re-open on close
    isOpeningRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return {
    state,
    openCreate,
    openEdit,
    close,
  };
}
