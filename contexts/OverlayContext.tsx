/**
 * OverlayContext - Global overlay controller
 * Ensures only one overlay instance exists across all screens
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { AppRecord } from '../lib/types';

type EntityType = 'habit' | 'todo' | 'journal' | 'note' | 'person' | 'unsorted';

interface ConversionMeta {
  origin?: string;
  ai_placed?: boolean;
  why_string?: string | null;
  source_message_id?: string | null;
  initialTitle?: string;
  initialNote?: string;
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

interface OverlayContextValue {
  state: OverlayState;
  openCreate: (options?: CreateOptions) => void;
  openEdit: (options: EditOptions) => void;
  close: () => void;
}

const OverlayContext = createContext<OverlayContextValue | undefined>(undefined);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    mode: 'create',
  });

  const isOpeningRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const openCreate = useCallback(
    ({ type, spaceId, subtype, conversionMeta }: CreateOptions = {}) => {
      if (isOpeningRef.current) {
        console.log('[GlobalOverlay] open already in progress, ignoring');
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
      console.log('[GlobalOverlay] open already in progress, ignoring');
      return;
    }

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

    console.log('[GlobalOverlay] openEdit called with state:', newState);

    isOpeningRef.current = true;
    setState(newState);

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
    isOpeningRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return (
    <OverlayContext.Provider value={{ state, openCreate, openEdit, close }}>
      {children}
    </OverlayContext.Provider>
  );
}

export function useGlobalOverlay() {
  const context = useContext(OverlayContext);
  if (!context) {
    throw new Error('useGlobalOverlay must be used within an OverlayProvider');
  }
  return context;
}
