/**
 * OverlayContext - Global overlay controller
 * Ensures only one overlay instance exists across all screens
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { AppRecord, CanonicalType, LogSubtype } from '../lib/types';
import { persistedNoteSubtypeToLogSubtype } from '../lib/logSubtypes';
import { ClarificationPopup } from '../components/minddrop/ClarificationPopup';
import { useGremlyStore } from '../lib/store/useGremlyStore';
import * as Haptics from 'expo-haptics';

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
  // Sweep conversion: source note ID to archive after creating todo
  sourceNoteId?: string;
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

// Clarification popup state for standalone popup (no overlay behind it)
interface ClarificationPopupState {
  visible: boolean;
  entityId: string | null;
  entityType: 'note' | 'todo' | 'habit' | null;
  question: string | null; // null = Phase 1.5 still loading
  options: Array<{ id: string; label: string; action: any }> | null; // null = loading
}

interface ClarificationPopupOptions {
  entityId: string;
  entityType: 'note' | 'todo' | 'habit';
  question: string | null; // null = Phase 1.5 still loading
  options: Array<{ id: string; label: string; action: any }> | null; // null = loading
}

interface OverlayContextValue {
  state: OverlayState;
  openCreate: (options?: CreateOptions) => void;
  openEdit: (options: EditOptions) => void;
  openView: (options: EditOptions) => void;
  close: () => void;
  // Clarification popup methods
  openClarificationPopup: (options: ClarificationPopupOptions) => void;
  closeClarificationPopup: () => void;
}

const OverlayContext = createContext<OverlayContextValue | undefined>(undefined);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    mode: 'create',
    entity: undefined,
  });

  // Clarification popup state (standalone, no overlay behind)
  const [clarificationPopup, setClarificationPopup] = useState<ClarificationPopupState>({
    visible: false,
    entityId: null,
    entityType: null,
    question: null,
    options: null,
  });
  const [clarificationLoading, setClarificationLoading] = useState(false);
  const [clarificationSuccess, setClarificationSuccess] = useState<string | null>(null);

  const isOpeningRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get store action for resolving clarification
  const resolvePendingDropClarification = useGremlyStore((s) => s.resolvePendingDropClarification);

  // Subscribe to entities to get fresh clarification data when Phase 1.5 completes
  // This handles the race condition where popup opens before Phase 1.5 finishes
  const notes = useGremlyStore((s) => s.notes);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  // Also subscribe to pendingDrops - Phase 1.5 updates here before sync completes
  const pendingDrops = useGremlyStore((s) => s.pendingDrops);

  // Derive the actual question/options from the entity if popup state is stale
  // This ensures we always show the latest data, even if Phase 1.5 completed after popup opened
  const effectiveClarificationData = React.useMemo(() => {
    if (!clarificationPopup.visible || !clarificationPopup.entityId) {
      return { question: clarificationPopup.question, options: clarificationPopup.options };
    }

    // If we already have options in popup state, use them
    if (clarificationPopup.options && clarificationPopup.options.length >= 2) {
      return { question: clarificationPopup.question, options: clarificationPopup.options };
    }

    // FIRST: Check pendingDrops - Phase 1.5 updates here before sync completes
    // The entityId might be the localId (drop_id) stored on the pending drop
    for (const [dropId, drop] of pendingDrops.entries()) {
      // Check if this pending drop matches by ID or if entityId is the drop_id
      if (dropId === clarificationPopup.entityId || (drop as any).id === clarificationPopup.entityId) {
        const pendingQuestion = (drop as any).clarification_question;
        const pendingOptions = (drop as any).clarification_options;
        
        if (pendingQuestion && Array.isArray(pendingOptions) && pendingOptions.length >= 2) {
          console.log('[GlobalOverlay] Using fresh Phase 1.5 data from pendingDrop', {
            dropId,
            question: String(pendingQuestion).substring(0, 30),
            optionsCount: pendingOptions.length,
          });
          return {
            question: pendingQuestion as string,
            options: pendingOptions as ClarificationPopupState['options'],
          };
        }
      }
    }

    // SECOND: Try to get fresh data from synced entities
    type EntityWithViews = { id: string; views?: Record<string, unknown> };
    let entity: EntityWithViews | undefined;
    if (clarificationPopup.entityType === 'note') {
      entity = notes.find((n) => n.id === clarificationPopup.entityId);
    } else if (clarificationPopup.entityType === 'todo') {
      entity = todos.find((t) => t.id === clarificationPopup.entityId);
    } else if (clarificationPopup.entityType === 'habit') {
      entity = habits.find((h) => h.id === clarificationPopup.entityId);
    }

    if (!entity) {
      return { question: clarificationPopup.question, options: clarificationPopup.options };
    }

    const freshQuestion =
      (entity as Record<string, unknown>).clarification_question ||
      entity.views?.clarification_question;
    const freshOptions =
      (entity as Record<string, unknown>).clarification_options ||
      entity.views?.clarification_options;

    if (freshQuestion && Array.isArray(freshOptions) && freshOptions.length >= 2) {
      console.log('[GlobalOverlay] Using fresh Phase 1.5 data from entity', {
        entityId: clarificationPopup.entityId,
        question: String(freshQuestion).substring(0, 30),
        optionsCount: freshOptions.length,
      });
      return {
        question: freshQuestion as string,
        options: freshOptions as ClarificationPopupState['options'],
      };
    }

    return { question: clarificationPopup.question, options: clarificationPopup.options };
  }, [
    clarificationPopup.visible,
    clarificationPopup.entityId,
    clarificationPopup.entityType,
    clarificationPopup.question,
    clarificationPopup.options,
    pendingDrops,
    notes,
    todos,
    habits,
  ]);

  // Clarification popup methods
  const openClarificationPopup = useCallback(
    ({ entityId, entityType, question, options }: ClarificationPopupOptions) => {
      console.log('[GlobalOverlay] Opening clarification popup', { entityId, question });
      setClarificationPopup({
        visible: true,
        entityId,
        entityType,
        question,
        options,
      });
    },
    [],
  );

  const closeClarificationPopup = useCallback(() => {
    setClarificationPopup({
      visible: false,
      entityId: null,
      entityType: null,
      question: null,
      options: null,
    });
    setClarificationLoading(false);
    setClarificationSuccess(null);
  }, []);

  const handleClarificationSelect = useCallback(
    async (optionId: string) => {
      if (!clarificationPopup.entityId) return;

      setClarificationLoading(true);

      try {
        await resolvePendingDropClarification(clarificationPopup.entityId, optionId);

        // Haptic feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Show success state
        setClarificationLoading(false);
        setClarificationSuccess('Got it — updated!');

        // Wait for user to see success message, then close
        // Note: Events are emitted by resolvePendingDropClarification in the store
        // (entity:deleted for old entity, entity:created for new entity)
        setTimeout(() => {
          closeClarificationPopup();
          console.log('[GlobalOverlay] Clarification resolved, popup closed');
        }, 1200);
      } catch (error) {
        console.error('[GlobalOverlay] Clarification failed:', error);
        setClarificationLoading(false);
        closeClarificationPopup();
      }
    },
    [clarificationPopup.entityId, resolvePendingDropClarification, closeClarificationPopup],
  );

  const handleClarificationSkip = useCallback(() => {
    // User wants to skip - could open full overlay here, or just close
    // For now, just close the popup
    console.log('[GlobalOverlay] Clarification skipped');
    closeClarificationPopup();
  }, [closeClarificationPopup]);

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
      initialLogPhotoUris: undefined,
      entity: undefined,
      views: undefined,
      defaultDueToday: undefined,
    });
    isOpeningRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return (
    <OverlayContext.Provider
      value={{
        state,
        openCreate,
        openEdit,
        openView,
        close,
        openClarificationPopup,
        closeClarificationPopup,
      }}
    >
      {children}
      {/* Standalone Clarification Popup - renders on top of everything */}
      <ClarificationPopup
        visible={clarificationPopup.visible}
        question={effectiveClarificationData.question}
        options={effectiveClarificationData.options}
        onSelectOption={handleClarificationSelect}
        onSkip={handleClarificationSkip}
        isSubmitting={clarificationLoading}
        successMessage={clarificationSuccess}
      />
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
