/**
 * OverlayContext - Global overlay controller
 * Ensures only one overlay instance exists across all screens
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { AppRecord, CanonicalType, LogSubtype } from '../lib/types';
import { persistedNoteSubtypeToLogSubtype } from '../lib/logSubtypes';
import { ClarificationPopup } from '../components/minddrop/ClarificationPopup';
import { RelationPopup } from '../components/minddrop/RelationPopup';
import { RelationToastHost } from '../components/minddrop/RelationToast';
import type { ClarificationWhen } from '../lib/minddrop/clarification';
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
  originalText: string | null; // The original drop text to show context
}

interface ClarificationPopupOptions {
  entityId: string;
  entityType: 'note' | 'todo' | 'habit';
  question: string | null; // null = Phase 1.5 still loading
  options: Array<{ id: string; label: string; action: any }> | null; // null = loading
  originalText?: string | null; // The original drop text to show context (optional when opening)
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
  /** "Is this one you already have?" for a held drop (lib/minddrop/dropRelation.ts) */
  openRelationPopup: (options: { entityId: string }) => void;
  /**
   * Open one of the user's items in the overlay, then call onReturn once the
   * overlay has closed (a question popup that stepped aside comes back).
   */
  openItemThenReturn: (
    target: { id: string; type: 'todo' | 'habit' | 'note' },
    onReturn: () => void,
  ) => void;
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
    originalText: null,
  });
  const [clarificationLoading, setClarificationLoading] = useState(false);
  // The held drop whose relation question is open, if any
  const [relationNoteId, setRelationNoteId] = useState<string | null>(null);
  const [clarificationSuccess, setClarificationSuccess] = useState<string | null>(null);

  const isOpeningRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Get store actions for resolving clarification
  const resolveEntityClarification = useGremlyStore((s) => s.resolveEntityClarification);
  const resolveSkippedClarification = useGremlyStore((s) => s.resolveSkippedClarification);
  const ensureEntityClarification = useGremlyStore((s) => s.ensureEntityClarification);

  // Subscribe to entities to get fresh clarification data when Phase 1.5 completes
  // This handles the race condition where popup opens before Phase 1.5 finishes
  const notes = useGremlyStore((s) => s.notes);
  const todos = useGremlyStore((s) => s.todos);
  const habits = useGremlyStore((s) => s.habits);
  // Also subscribe to queueItems - Phase 1.5 updates here before sync completes
  const queueItems = useGremlyStore((s) => s.queueItems);

  // Derive the actual question/options from the entity if popup state is stale
  // This ensures we always show the latest data, even if Phase 1.5 completed after popup opened
  const effectiveClarificationData = React.useMemo(() => {
    if (!clarificationPopup.visible || !clarificationPopup.entityId) {
      return {
        question: clarificationPopup.question,
        options: clarificationPopup.options,
        originalText: clarificationPopup.originalText,
      };
    }

    // If we already have options in popup state, use them
    if (clarificationPopup.options && clarificationPopup.options.length >= 2) {
      return {
        question: clarificationPopup.question,
        options: clarificationPopup.options,
        originalText: clarificationPopup.originalText,
      };
    }

    // FIRST: Try to get fresh data from synced entities
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
      return {
        question: clarificationPopup.question,
        options: clarificationPopup.options,
        originalText: clarificationPopup.originalText,
      };
    }

    // Get original text from entity
    const entityOriginalText =
      (entity as Record<string, unknown>).text ||
      (entity as Record<string, unknown>).title ||
      entity.views?.text ||
      entity.views?.title ||
      clarificationPopup.originalText;

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
        originalText: entityOriginalText as string | null,
      };
    }

    // THIRD: Entity synced but Phase 1.5 completed AFTER sync - check queueItems by drop_id
    // The synced entity has a drop_id that equals the queued drop's localId
    const entityDropId = (entity as Record<string, unknown>).drop_id as string | undefined;
    if (entityDropId) {
      const queuedDrop = queueItems.find((d) => d.localId === entityDropId);
      if (queuedDrop) {
        const pendingQuestion = queuedDrop.clarificationQuestion;
        const pendingOptions = queuedDrop.clarificationOptions;

        if (pendingQuestion && Array.isArray(pendingOptions) && pendingOptions.length >= 2) {
          console.log('[GlobalOverlay] Using Phase 1.5 data from queuedDrop via entity.drop_id', {
            dropId: entityDropId,
            question: String(pendingQuestion).substring(0, 30),
            optionsCount: pendingOptions.length,
          });
          return {
            question: pendingQuestion as string,
            options: pendingOptions as ClarificationPopupState['options'],
            originalText: entityOriginalText as string | null,
          };
        }
      }
    }

    return {
      question: clarificationPopup.question,
      options: clarificationPopup.options,
      originalText: entityOriginalText as string | null,
    };
  }, [
    clarificationPopup.visible,
    clarificationPopup.entityId,
    clarificationPopup.entityType,
    clarificationPopup.question,
    clarificationPopup.options,
    queueItems,
    notes,
    todos,
    habits,
  ]);

  // Self-heal: if the popup is open but the entity has no usable options
  // (saved before Phase 1.5 landed, or an older drop), fetch them now. The
  // store call always resolves to options (worker or fixed fallback) within
  // its timeout, so the popup can never sit on "Thinking..." indefinitely.
  const popupEntityId = clarificationPopup.visible ? clarificationPopup.entityId : null;
  const popupNeedsOptions =
    !!popupEntityId &&
    !(
      effectiveClarificationData.question &&
      Array.isArray(effectiveClarificationData.options) &&
      effectiveClarificationData.options.length >= 2
    );
  useEffect(() => {
    if (!popupEntityId || !popupNeedsOptions) return;
    let cancelled = false;
    ensureEntityClarification(popupEntityId)
      .then((res) => {
        if (cancelled || !res) return;
        setClarificationPopup((prev) =>
          prev.visible && prev.entityId === popupEntityId
            ? { ...prev, question: res.question, options: res.options }
            : prev,
        );
      })
      .catch((err) => {
        console.warn('[GlobalOverlay] ensureEntityClarification failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [popupEntityId, popupNeedsOptions, ensureEntityClarification]);

  // Clarification popup methods
  const openClarificationPopup = useCallback(
    ({ entityId, entityType, question, options, originalText }: ClarificationPopupOptions) => {
      console.log('[GlobalOverlay] Opening clarification popup', { entityId, question });
      setClarificationPopup({
        visible: true,
        entityId,
        entityType,
        question,
        options,
        originalText: originalText || null,
      });
    },
    [],
  );

  const openRelationPopup = useCallback(({ entityId }: { entityId: string }) => {
    setRelationNoteId(entityId);
  }, []);
  const closeRelationPopup = useCallback(() => setRelationNoteId(null), []);

  const closeClarificationPopup = useCallback(() => {
    setClarificationPopup({
      visible: false,
      entityId: null,
      entityType: null,
      question: null,
      options: null,
      originalText: null,
    });
    setClarificationLoading(false);
    setClarificationSuccess(null);
  }, []);

  const handleClarificationSelect = useCallback(
    (optionId: string, when?: ClarificationWhen) => {
      if (!clarificationPopup.entityId) return;

      // Check if this is free text input (prefixed with "freetext:")
      const isFreeText = optionId.startsWith('freetext:');
      const selectionValue = isFreeText ? optionId.slice('freetext:'.length) : optionId;

      console.log('[GlobalOverlay] Clarification selection:', {
        entityId: clarificationPopup.entityId,
        isFreeText,
        value: selectionValue.substring(0, 50),
      });

      // Fire and forget - don't await
      // The popup shows instant success and dismisses itself
      // The card shows processing animation and updates progressively
      resolveEntityClarification(
        clarificationPopup.entityId,
        selectionValue,
        isFreeText,
        when ?? null,
      ).catch((error) => {
        console.error('[GlobalOverlay] Clarification resolution failed:', error);
      });

      // Note: Popup dismisses itself after showing "Great, on it"
      // We don't close it here anymore
    },
    [clarificationPopup.entityId, resolveEntityClarification],
  );

  const handleClarificationSkip = useCallback(() => {
    const entityId = clarificationPopup.entityId;
    console.log('[GlobalOverlay] Clarification skipped', { entityId });

    // Close popup immediately
    closeClarificationPopup();

    if (!entityId) return;

    // Resolve as skipped - this updates the entity and runs Phase 2
    resolveSkippedClarification(entityId).catch((error) => {
      console.error('[GlobalOverlay] Skip resolution failed:', error);
    });
  }, [clarificationPopup.entityId, closeClarificationPopup, resolveSkippedClarification]);

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

  // Opening an item from a question popup or the toast. The overlay is not a
  // modal, so a popup steps aside while it is open and comes back after.
  const returnAfterOverlay = useRef<(() => void) | null>(null);
  const overlayVisibleRef = useRef(state.visible);
  useEffect(() => {
    overlayVisibleRef.current = state.visible;
    if (state.visible || !returnAfterOverlay.current) return;
    const onReturn = returnAfterOverlay.current;
    returnAfterOverlay.current = null;
    // let the overlay finish closing first
    const t = setTimeout(onReturn, 250);
    return () => clearTimeout(t);
  }, [state.visible]);

  const openStoreItem = useCallback(
    (target: { id: string; type: 'todo' | 'habit' | 'note' }): boolean => {
      const s = useGremlyStore.getState();
      const list: Array<{ id: string }> =
        target.type === 'todo' ? s.todos : target.type === 'habit' ? s.habits : s.notes;
      const record = list.find((r) => r.id === target.id) as Record<string, unknown> | undefined;
      if (!record) return false;
      openEdit({
        record: { ...record, type: target.type } as unknown as AppRecord,
        spaceId: (record.space_id as string | null | undefined) ?? null,
      });
      return true;
    },
    [openEdit],
  );

  const openItemThenReturn = useCallback(
    (target: { id: string; type: 'todo' | 'habit' | 'note' }, onReturn: () => void) => {
      returnAfterOverlay.current = onReturn;
      if (!openStoreItem(target)) {
        returnAfterOverlay.current = null;
        onReturn();
        return;
      }
      // If the overlay did not open (another open was already under way), come back anyway
      setTimeout(() => {
        if (!overlayVisibleRef.current && returnAfterOverlay.current === onReturn) {
          returnAfterOverlay.current = null;
          onReturn();
        }
      }, 900);
    },
    [openStoreItem],
  );

  // Kept as new, and the drop was unclear: its own question opens next (the
  // relation popup calls this once it has faded), so one tap on the card
  // answers both
  const openNextQuestion = useCallback(
    (id: string) => {
      const note = useGremlyStore.getState().notes.find((n) => n.id === id);
      if (!note || note.archived) return;
      type Held = {
        clarification_question?: string | null;
        clarification_options?: ClarificationPopupOptions['options'];
        text?: string | null;
      };
      const views = (note.views || {}) as Held;
      const raw = note as unknown as Held;
      openClarificationPopup({
        entityId: id,
        entityType: 'note',
        question: raw.clarification_question || views.clarification_question || null,
        options: raw.clarification_options || views.clarification_options || null,
        originalText: raw.text || views.text || note.body || note.title || null,
      });
    },
    [openClarificationPopup],
  );

  const openRelationItem = useCallback(
    (entity: { id: string; type: 'todo' | 'habit' | 'note' }) => {
      const noteId = relationNoteId;
      if (!noteId) return;
      setRelationNoteId(null);
      openItemThenReturn({ id: entity.id, type: entity.type }, () => setRelationNoteId(noteId));
    },
    [relationNoteId, openItemThenReturn],
  );

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
        openRelationPopup,
        openItemThenReturn,
      }}
    >
      {children}
      {/* Standalone Clarification Popup - renders on top of everything */}
      <ClarificationPopup
        visible={clarificationPopup.visible}
        question={effectiveClarificationData.question}
        options={effectiveClarificationData.options}
        originalText={effectiveClarificationData.originalText}
        onSelectOption={handleClarificationSelect}
        onSkip={handleClarificationSkip}
        onClose={closeClarificationPopup}
        isSubmitting={clarificationLoading}
        successMessage={clarificationSuccess}
      />
      {/* "Is this one you already have?", opened from a held drop's card */}
      <RelationPopup
        key={relationNoteId ?? 'none'}
        visible={!!relationNoteId}
        noteId={relationNoteId}
        onClose={closeRelationPopup}
        onNextQuestion={openNextQuestion}
        onOpenItem={openRelationItem}
      />
      {/* What a yes did, with Undo; tapping its words opens the item (over Mind Drop and Sweep) */}
      <RelationToastHost onOpen={openStoreItem} />
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
