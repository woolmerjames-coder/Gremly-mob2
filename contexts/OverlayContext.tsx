/**
 * OverlayContext - Global overlay controller
 * Ensures only one overlay instance exists across all screens
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { AppRecord, CanonicalType, LogSubtype } from '../lib/types';
import { persistedNoteSubtypeToLogSubtype } from '../lib/logSubtypes';

type EntityType = CanonicalType;

const NEEDS_REVIEW_LABEL = 'needs_review';

interface ConversionMeta {
  origin?: string;
  ai_placed?: boolean;
  why_string?: string | null;
  source_message_id?: string | null;
  initialTitle?: string;
  initialNote?: string;
  initialDueDate?: string | null;
  initialTags?: string[];
  initialListItems?: Array<{ id: string; text: string; checked: boolean }>;
  initialIsList?: boolean;
  // Phase 10.8: Habit frequency prefill from Space Chat
  initialFrequency?: string;
  initialFrequencyValue?: number;
  // Indicates content came from chat (for preview mode)
  fromChat?: boolean;
}

interface OverlayState {
  visible: boolean;
  mode: 'create' | 'edit' | 'view';
  initialEntity?: {
    type: EntityType | null;
    id?: string;
    logSubtype?: LogSubtype | null;
  };
  initialSpaceId?: string | null;
  conversionMeta?: ConversionMeta;
  initialText?: string | null;
  initialLogPhotoUris?: string[]; // Photo Drop: initial photos for create-mode logs
  entity?: AppRecord; // Full record for edit mode pre-fill
  views?: Record<string, any>; // Pass-through for ai_title_frozen, ai_tags_frozen, etc.
  defaultDueToday?: boolean; // When true, todo defaults to due today (used by Now page)
}

interface CreateOptions {
  type?: EntityType;
  spaceId?: string | null;
  logSubtype?: LogSubtype | null;
  conversionMeta?: ConversionMeta;
  initialEntity?: OverlayState['initialEntity'];
  initialText?: string | null;
  initialLogPhotoUris?: string[]; // Photo Drop: initial photos for create-mode logs
  suppressOverlayOpen?: boolean;
  defaultDueToday?: boolean; // When true, todo defaults to due today (used by Now page)
}

interface EditOptions {
  record: AppRecord;
  spaceId?: string | null;
  fromChat?: boolean; // Opens notes in preview mode when true
}

interface OverlayContextValue {
  state: OverlayState;
  openCreate: (options?: CreateOptions) => void;
  openEdit: (options: EditOptions) => void;
  openView: (options: EditOptions) => void;
  close: () => void;
}

const OverlayContext = createContext<OverlayContextValue | undefined>(undefined);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    mode: 'create',
    entity: undefined,
  });

  const isOpeningRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const openCreate = useCallback(
    ({
      type,
      spaceId,
      logSubtype,
      conversionMeta,
      initialEntity,
      initialText,
      initialLogPhotoUris,
      suppressOverlayOpen,
      defaultDueToday,
    }: CreateOptions = {}) => {
      if (suppressOverlayOpen) {
        return;
      }
      if (isOpeningRef.current) {
        console.log('[GlobalOverlay] open already in progress, ignoring');
        return;
      }

      isOpeningRef.current = true;
      const resolvedEntity = initialEntity
        ? initialEntity
        : type
          ? {
              type,
              id: undefined,
              logSubtype: type === 'log' ? (logSubtype ?? null) : null,
            }
          : undefined;
      const resolvedText = initialText ?? conversionMeta?.initialNote ?? null;
      setState({
        visible: true,
        mode: 'create',
        initialEntity: resolvedEntity,
        initialSpaceId: spaceId,
        conversionMeta,
        initialText: resolvedText,
        initialLogPhotoUris,
        defaultDueToday,
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
    let logSubtype: LogSubtype | null = null;

    if (record.type === 'habit') {
      entityType = 'habit';
    } else if (record.type === 'todo') {
      entityType = 'todo';
    } else if (record.type === 'note') {
      const labels = (record as any)?.labels as string[] | undefined;
      const recordSubtype = (record as any)?.subtype as string | undefined;

      // Only notes with needs_review label are truly unsorted
      // Notes with subtype: 'catchall' are classified logs (log-general)
      if (labels?.includes?.(NEEDS_REVIEW_LABEL)) {
        entityType = 'unsorted';
        logSubtype = null;
      } else {
        entityType = 'log';
        logSubtype = persistedNoteSubtypeToLogSubtype(recordSubtype ?? null);
      }
    } else {
      entityType = 'log';
      logSubtype = 'general';
    }

    // Extract views from the record to pass through to overlay
    const safeViews = record.views ?? {};

    const newState = {
      visible: true,
      mode: 'edit' as const,
      initialEntity: {
        type: entityType,
        id: record.id,
        logSubtype,
      },
      initialSpaceId: spaceId,
      initialText: null,
      entity: record, // Store full record for pre-fill
      views: safeViews, // Pass through views (ai_title_frozen, ai_tags_frozen, etc.)
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

  const openView = useCallback(({ record, spaceId, fromChat }: EditOptions) => {
    if (isOpeningRef.current) {
      console.log('[GlobalOverlay] open already in progress, ignoring');
      return;
    }

    let entityType: EntityType;
    let logSubtype: LogSubtype | null = null;

    if (record.type === 'habit') {
      entityType = 'habit';
    } else if (record.type === 'todo') {
      entityType = 'todo';
    } else if (record.type === 'note') {
      const labels = (record as any)?.labels as string[] | undefined;
      const recordSubtype = (record as any)?.subtype as string | undefined;

      // Only notes with needs_review label are truly unsorted
      // Notes with subtype: 'catchall' are classified logs (log-general)
      if (labels?.includes?.(NEEDS_REVIEW_LABEL)) {
        entityType = 'unsorted';
        logSubtype = null;
      } else {
        entityType = 'log';
        logSubtype = persistedNoteSubtypeToLogSubtype(recordSubtype ?? null);
      }
    } else {
      entityType = 'log';
      logSubtype = 'general';
    }

    // Extract views from the record to pass through to overlay
    const safeViews = record.views ?? {};

    const newState = {
      visible: true,
      mode: 'view' as const,
      initialEntity: {
        type: entityType,
        id: record.id,
        logSubtype,
      },
      initialSpaceId: spaceId,
      initialText: null,
      entity: record, // Store full record for pre-fill
      views: safeViews, // Pass through views (ai_title_frozen, ai_tags_frozen, etc.)
      conversionMeta: fromChat ? { fromChat: true } : undefined,
    };

    console.log('[GlobalOverlay] openView called with state:', newState);

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
      initialText: undefined,
      entity: undefined,
    });
    isOpeningRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return (
    <OverlayContext.Provider value={{ state, openCreate, openEdit, openView, close }}>
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
