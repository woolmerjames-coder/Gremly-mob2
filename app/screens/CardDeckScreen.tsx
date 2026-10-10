/**
 * Card Deck Screen: the decision cards on their own.
 *
 * Opened from today's thread by the wrap up (cards: 'wrap') or by the brief's
 * quick sweep (cards: 'quick'). A drop with several things in it is split
 * first (step 0.25), then come the cards (step 1). Each decision is saved as
 * it is made. The result goes back to the thread through lib/wrapup/session
 * (wrap) or is read on focus by the thread (quick).
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
  Alert,
} from 'react-native';

import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen, Text, Button } from '../../ui';
import { Icon } from '../../design-system/Icon';
import { BRAND } from '../../design/brand';
import { getDateService } from '../../lib/date';
// Zustand store: used for all Sweep data operations
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { ClarificationWhen } from '../../lib/minddrop/clarification';
import { useCanCreate } from '../../lib/store/lifecycleSelectors';
import { useIsLoading, useSweepCandidatesUnified } from '../../lib/store/selectors';

import { env, getEnv } from '../../lib/env';
import { getSessionToken } from '../../lib/cortex/getSessionToken';
import { computeSweepCardMeta } from '../../lib/sweep/computeSweepCardMeta';
import {
  entityNow,
  goneSinceStart,
  orderSweepCards,
  sweepCardNow,
} from '../../lib/sweep/sweepOrder';
import type {
  SweepCandidate,
  SweepCandidateTodo,
  SweepCandidateNote,
  SweepCandidateHabit,
  SweepCardMeta,
} from '../../lib/sweep/types';
import { SweepCardNew } from '../../components/sweep/SweepCardNew';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import { SweepMultiSplitStep } from '../../components/sweep/SweepMultiSplitStep';
import { EntityChatScreen } from '../../components/chat/EntityChatScreen';
import { useOverlayController } from '../../hooks/useOverlayController';
import celebrationController from '../../app/features/celebration/CelebrationController';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { OverlayComponent } from '../../components/overlay';
import {
  emitOverlaySaved,
  addOverlaySavedListener,
  type OverlaySavedPayload,
} from '../../lib/events/overlaySaved';
import { emitOverlayClosed, addOverlayClosedListener } from '../../lib/events/overlayClosed';
import { eventBus } from '../../lib/events/EventBus';
import type { AppRecord } from '../../lib/types';

import { selectWrapUp } from '../../lib/store/selectors';

import { ClarificationPopup } from '../../components/minddrop/ClarificationPopup';
import { RelationPopup, type RelationResolution } from '../../components/minddrop/RelationPopup';
import { relationOf } from '../../lib/minddrop/dropRelation';
import { liveAsksOf, type AskItem } from '../../lib/minddrop/asks';
import { sweepLog } from '../../lib/debug/sweepLogger';
import { quickSweepCards } from '../../lib/sweep/quickSweep';
import { useCardDays } from '../../lib/sweep/cardDays';
import { applySweepDecision, type SweepDecision, type SweepRecord } from '../../lib/changes/sweep';
import {
  cardsClosed,
  cardsOpened,
  currentWrap,
  recordDecision as recordWrapDecision,
} from '../../lib/wrapup/session';
import { cardsLeft } from '../../lib/wrapup/state';
import { wrapNow } from '../../lib/wrapup/day';
import { PrivateImage } from '../../components/PrivateImage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_MASCOT_CELEBRATE = require('../../assets/mascot/sweepcomplete.png');

// ─────────────────────────────────────────────────────────────────────────────
// Cortex URL helpers
// ─────────────────────────────────────────────────────────────────────────────
const safeGetEnv = typeof getEnv === 'function' ? getEnv : undefined;

const readCortexUrl = (): string => {
  const fromGetEnv = safeGetEnv?.('EXPO_PUBLIC_CORTEX_URL');
  const fromEnvConfig = typeof env.cortexUrl === 'string' ? env.cortexUrl : undefined;
  return fromGetEnv ?? fromEnvConfig ?? process.env.EXPO_PUBLIC_CORTEX_URL ?? '';
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Navigation props: a full-screen card, not a modal
interface Props {
  navigation?: NativeStackNavigationProp<RootStackParamList, 'Cards'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Components
// ─────────────────────────────────────────────────────────────────────────────

type SweepIntent = 'today' | 'tomorrow';

/**
 * The decision cards: items that need a decision (keep, bring back later,
 * let go), one at a time.
 *
 * Opened from today's thread they are tonight's wrap up cards (or the brief's
 * quick sweep) and each decision is saved as it is made.
 */

/** How long All sorted stays up before the cards close back to the thread. */
const ALL_SORTED_MS = 900;

interface CardDeckProps {
  onFinished: () => void;
  onClose?: () => void;
  sweepIntent?: SweepIntent;
  /**
   * Which cards. quick: only the cards
   * that need a decision before the day is planned (lib/sweep/quickSweep.ts).
   * wrap: tonight's wrap up, counted from the person's day, without the ones
   * already settled tonight (lib/wrapup).
   */
  cards: 'quick' | 'wrap';
  /** A decision was saved: its record, and its Undo */
  onSaved?: (record: SweepRecord, revert: () => Promise<void>) => void;
}

/**
 * Hook to snapshot sweep candidates on initial load.
 * Prevents items from disappearing mid-sweep when they're archived/skipped.
 */
function useSweepSnapshot(
  allCandidates: Array<{ candidate: SweepCandidate; meta: SweepCardMeta }>,
  storeIsLoading: boolean,
) {
  const [snapshot, setSnapshot] = useState<Array<{
    candidate: SweepCandidate;
    meta: SweepCardMeta;
  }> | null>(null);

  // Take snapshot once when store finishes loading
  // This is intentional initialization, not a cascading update
  if (!storeIsLoading && snapshot === null) {
    // Using conditional setState is acceptable for one-time initialization
    // when the condition is based on loading state
    sweepLog.debug('[SweepSnapshot] Taking snapshot with', allCandidates.length, 'candidates');
    sweepLog.debug(
      '[SweepSnapshot] Candidate IDs:',
      allCandidates.map((c) => c.candidate.id.slice(0, 8)),
    );
    setSnapshot(allCandidates);
  }

  return {
    candidatesWithMeta: snapshot ?? [],
    isLoading: storeIsLoading || snapshot === null,
  };
}

function CardDeck({
  onFinished,
  onClose,
  sweepIntent = 'tomorrow',
  cards,
  onSaved,
}: CardDeckProps) {
  // Get candidates from unified store selector (single source of truth)
  const allCandidates = useSweepCandidatesUnified();
  const storeIsLoading = useIsLoading();
  const wrapCards = useGremlyStore(selectWrapUp).cards;
  // the quick sweep asks only about what still needs a decision; the wrap up
  // has tonight's cards, without the ones already settled tonight
  const deck = useMemo(() => {
    if (cards === 'quick') return quickSweepCards(allCandidates, getDateService().today());
    return cardsLeft(currentWrap(), wrapCards);
  }, [cards, allCandidates, wrapCards]);

  // Snapshot candidates at session start (prevents items disappearing mid-sweep)
  const { candidatesWithMeta: unsortedCandidatesWithMeta, isLoading } = useSweepSnapshot(
    deck,
    storeIsLoading,
  );

  // Cards with a question first (their answers can change other cards), then
  // todos, events and notes (lib/sweep/sweepOrder.ts)
  const candidatesWithMeta = useMemo(
    () => orderSweepCards(unsortedCandidatesWithMeta),
    [unsortedCandidatesWithMeta],
  );

  // Store mutations for sweep actions
  const updateNote = useGremlyStore((state) => state.updateNote);
  const archiveHabit = useGremlyStore((state) => state.archiveHabit);
  const resolveEntityClarification = useGremlyStore((state) => state.resolveEntityClarification);
  const ensureEntityClarification = useGremlyStore((state) => state.ensureEntityClarification);

  // Use store data for overlay lookups
  const todos = useGremlyStore((state) => state.todos);
  const notes = useGremlyStore((state) => state.notes);
  const habits = useGremlyStore((state) => state.habits);
  const overlayController = useOverlayController();
  // a todo card's days: how full each already is, and the day a Later comes back
  const cardDays = useCardDays();

  // Which card is up
  const [currentIndex, setCurrentIndex] = useState(0);

  const [showHelp, setShowHelp] = useState(false);
  // A card turned into another kind of item while it was on screen (set where
  // convertedCandidate is declared): its decision is about the new item
  const convertedRef = useRef<{
    originalId: string;
    newId: string;
    newKind: 'todo' | 'habit' | 'note';
  } | null>(null);
  // Saving each decision as it is made: the saves still on their way, how
  // many are in, and whether one could not be saved
  const pendingSavesRef = useRef<Set<Promise<void>>>(new Set());
  const [savedCount, setSavedCount] = useState(0);
  const [allSorted, setAllSorted] = useState(false);
  const saveFailedRef = useRef(false);
  const finishedRef = useRef(false);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // Entity chat state (for chat button on sweep cards)
  const [showEntityChat, setShowEntityChat] = useState(false);
  const [chatPresetHint, setChatPresetHint] = useState<string | undefined>();
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  // Clarification state for items that need it
  const [showClarification, setShowClarification] = useState(false);
  const [clarificationQuestion, setClarificationQuestion] = useState<string | null>(null);
  const [clarificationOptions, setClarificationOptions] = useState<any[] | null>(null);
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false);
  const [clarificationSuccess, setClarificationSuccess] = useState<string | null>(null);
  const [cardFlipKey, setCardFlipKey] = useState(0); // Used to trigger card re-render after clarification
  const [isClarified, setIsClarified] = useState(false); // Triggers flip animation after clarification
  // Held drops ("is this one you already have?") already asked on this sweep
  const [relationHandledIds, setRelationHandledIds] = useState<Set<string>>(() => new Set());
  // The popup steps aside while its item is open in the overlay, then comes back
  const [relationParked, setRelationParked] = useState(false);
  const { openItemThenReturn } = useGlobalOverlay();

  // Helper to record a decision: it is saved now.
  const recordDecision = useCallback((given: SweepDecision) => {
    // A card that was turned into another kind of item: the decision is
    // about the new item (the old one was put away when it was converted)
    const converted = convertedRef.current;
    const about = converted && converted.originalId === given.candidateId ? converted : null;
    // nothing here is saved on a habit: making it was the decision
    if (about && about.newKind === 'habit') return;
    const decision: SweepDecision = about
      ? { ...given, candidateId: about.newId, candidateKind: about.newKind as 'todo' | 'note' }
      : given;

    const index = currentIndexRef.current;
    const save: Promise<void> = applySweepDecision(decision)
      .then((res) => {
        if (res.ok) {
          setSavedCount((n) => n + 1);
          onSavedRef.current?.(res.record, res.revert);
          return;
        }
        // gone since the card was shown (done or put away): nothing to decide
        if (res.reason === 'gone') return;
        // it could not be saved: say so, and bring the card back to decide again
        saveFailedRef.current = true;
        Alert.alert('That did not save', 'Check your connection, then try that card again.');
        setCurrentIndex(index);
      })
      .finally(() => {
        pendingSavesRef.current.delete(save);
      });
    pendingSavesRef.current.add(save);
  }, []);

  // The X. Every decision is already saved, so it waits for the last one and
  // closes.
  const handleCloseCards = useCallback(async () => {
    await Promise.all([...pendingSavesRef.current]);
    onClose?.();
  }, [onClose]);

  /**
   * Handle completing all cards: waits for the saves, then calls onFinished.
   */
  const handleAllCardsComplete = useCallback(async () => {
    // saved as they were made: wait for the ones still on their way
    await Promise.all([...pendingSavesRef.current]);
    // a card that could not be saved is back on screen: not finished yet
    if (saveFailedRef.current) {
      saveFailedRef.current = false;
      return;
    }
    // the screen closes on this, so it is only said once: All sorted, a
    // moment to read it, then back to the thread
    if (finishedRef.current) return;
    finishedRef.current = true;
    setAllSorted(true);
    await new Promise((resolve) => setTimeout(resolve, ALL_SORTED_MS));
    onFinished();
  }, [onFinished]);

  // Track the candidate ID currently being edited (for detecting overlay saves)
  const editingCandidateIdRef = useRef<string | null>(null);

  // Track type conversion in progress (source candidate -> target type)
  const convertingCandidateRef = useRef<{
    sourceId: string;
    sourceKind: 'todo' | 'habit' | 'note';
    targetType: 'todo' | 'habit' | 'note';
  } | null>(null);

  // Track which candidates have already been converted (prevent duplicate conversions)
  const convertedCandidatesRef = useRef<Set<string>>(new Set());

  // Track candidates that were converted in-place (source -> new entity)
  const [convertedCandidate, setConvertedCandidate] = useState<{
    originalId: string;
    originalKind: 'todo' | 'habit' | 'note';
    newId: string;
    newKind: 'todo' | 'habit' | 'note';
    animating: boolean;
  } | null>(null);

  convertedRef.current = convertedCandidate;

  // Clear conversion animation state after animation completes
  useEffect(() => {
    if (convertedCandidate?.animating) {
      const timer = setTimeout(() => {
        setConvertedCandidate((prev) => (prev ? { ...prev, animating: false } : null));
      }, 400); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [convertedCandidate?.animating]);

  // Log candidates for debugging (using snapshot)
  useEffect(() => {
    if (!isLoading && candidatesWithMeta.length > 0) {
      sweepLog.debug('[CardDeck] Candidates from store:', {
        total: candidatesWithMeta.length,
        todos: candidatesWithMeta.filter((c) => c.candidate.kind === 'todo').length,
        notes: candidatesWithMeta.filter((c) => c.candidate.kind === 'note').length,
        ids: candidatesWithMeta.map((c) => ({
          id: c.candidate.id.slice(0, 8),
          kind: c.candidate.kind,
          title: (c.candidate.raw as any)?.name || (c.candidate.raw as any)?.title,
        })),
      });
    }
  }, [isLoading, candidatesWithMeta]);

  // Check if current candidate needs clarification when index changes
  useEffect(() => {
    const candidate = candidatesWithMeta[currentIndex]?.candidate;
    const views = candidate?.raw?.views as Record<string, any> | undefined;
    const rawAny = candidate?.raw as Record<string, any> | undefined;

    // Check both views and raw for needs_clarification (different entity types store it differently)
    const needsClarificationFlag =
      views?.needs_clarification === true || rawAny?.needs_clarification === true;
    const storedQuestion = views?.clarification_question || rawAny?.clarification_question;
    const storedOptions = views?.clarification_options || rawAny?.clarification_options;

    let cancelled = false;
    if (needsClarificationFlag && storedQuestion && storedOptions) {
      setClarificationQuestion(storedQuestion);
      setClarificationOptions(storedOptions);
      setShowClarification(true);
    } else if (needsClarificationFlag && candidate?.id) {
      // Saved without options (older drops): fetch them now so the question
      // can be answered during Sweep instead of being silently skipped.
      setShowClarification(false);
      setClarificationQuestion(null);
      setClarificationOptions(null);
      ensureEntityClarification(candidate.id)
        .then((res) => {
          if (cancelled || !res) return;
          setClarificationQuestion(res.question);
          setClarificationOptions(res.options);
          setShowClarification(true);
        })
        .catch(() => {});
    } else {
      setShowClarification(false);
      setClarificationQuestion(null);
      setClarificationOptions(null);
    }

    // Reset success state when moving to new card
    setClarificationSuccess(null);
    return () => {
      cancelled = true;
    };
  }, [currentIndex, candidatesWithMeta, ensureEntityClarification]);

  // ─────────────────────────────────────────────────────────────────────────
  // Unified Outcome Handler
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Centralized handler for all sweep card outcomes.
   * Any meaningful action advances the card; "peek and close" stays.
   */
  type SweepOutcome = 'skip' | 'clear' | 'changed' | 'stay';

  // Store handleOutcome in a ref so the effect can access the latest version
  const handleOutcomeRef = useRef<(outcome: SweepOutcome) => void>(() => {});

  const handleOutcome = useCallback(
    (outcome: SweepOutcome) => {
      // Clear conversion state if user is acting on converted card
      if (convertedCandidate) {
        setConvertedCandidate(null);
      }

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const candidate = candidateWithMeta.candidate;

      switch (outcome) {
        case 'skip': {
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'skip',
          });
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'clear': {
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'clear',
          });
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'changed': {
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'keep',
          });
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'stay':
          // Do nothing: keep current card visible
          return;
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision],
  );

  // Keep the ref updated with the latest handleOutcome
  useEffect(() => {
    handleOutcomeRef.current = handleOutcome;
  }, [handleOutcome]);

  // Listen for overlay save events to detect "changed" outcomes from edit/primary actions
  useEffect(() => {
    const unsubscribeSaved = addOverlaySavedListener((payload) => {
      // Check if this is a type conversion
      const converting = convertingCandidateRef.current;
      if (converting && payload.type === converting.targetType) {
        // Check if this candidate was already converted (prevent duplicates)
        if (convertedCandidatesRef.current.has(converting.sourceId)) {
          sweepLog.debug(
            '[CardDeck] Candidate already converted, ignoring duplicate:',
            converting.sourceId,
          );
          convertingCandidateRef.current = null;
          return;
        }

        sweepLog.debug(
          `[CardDeck] ${converting.sourceKind} converted to ${converting.targetType} (in-place):`,
          converting.sourceId,
          '->',
          payload.id,
        );
        // Mark this candidate as converted
        convertedCandidatesRef.current.add(converting.sourceId);
        // Clear the conversion ref
        convertingCandidateRef.current = null;

        // Instead of advancing, trigger in-place transformation
        setConvertedCandidate({
          originalId: converting.sourceId,
          originalKind: converting.sourceKind,
          newId: payload.id,
          newKind: converting.targetType,
          animating: true,
        });
        return;
      }

      // Check if the saved item matches the candidate we're currently editing
      const editingId = editingCandidateIdRef.current;
      if (editingId && payload.id === editingId) {
        // Clear the editing ref and advance the card
        editingCandidateIdRef.current = null;
        handleOutcomeRef.current('changed');
      }
    });

    // Listen for overlay close events (cancel without save)
    const unsubscribeClosed = addOverlayClosedListener((payload) => {
      // If user cancelled editing the current candidate, just clear the ref (don't advance)
      const editingId = editingCandidateIdRef.current;
      if (editingId && payload.editingId === editingId && !payload.didSave) {
        // Clear the editing ref but DON'T advance: this is "peek and close"
        editingCandidateIdRef.current = null;
      }
    });

    return () => {
      unsubscribeSaved();
      unsubscribeClosed();
    };
  }, []); // Empty deps: uses refs to avoid re-subscribing

  // Listen for clarification bucket changes (note→todo, etc.)
  // When clarification resolves with a bucket change, update the convertedCandidate state
  useEffect(() => {
    const handleEntityCreated = (payload: {
      entity: { id: string; type: string; drop_id?: string };
      type: string;
      source?: string;
    }) => {
      // Only handle clarification bucket changes
      if (payload.source !== 'clarification-bucket-change') return;

      const currentCandidateId = candidatesWithMeta[currentIndex]?.candidate?.id;
      if (!currentCandidateId) return;

      // Check if the created entity has the same drop_id as the current candidate
      // This indicates a clarification bucket change for the current card
      const currentDropId = candidatesWithMeta[currentIndex]?.candidate?.dropId;
      if (currentDropId && payload.entity.drop_id === currentDropId) {
        sweepLog.debug('[CardDeck] Clarification bucket change detected:', {
          originalId: currentCandidateId,
          newId: payload.entity.id,
          newType: payload.type,
        });

        // Update convertedCandidate to trigger card data refresh
        setConvertedCandidate({
          originalId: currentCandidateId,
          originalKind: candidatesWithMeta[currentIndex].candidate.kind,
          newId: payload.entity.id,
          newKind: payload.type as 'todo' | 'habit' | 'note',
          animating: true,
        });
      }
    };

    eventBus.on('entity:created', handleEntityCreated);

    return () => {
      eventBus.off('entity:created', handleEntityCreated);
    };
  }, [candidatesWithMeta, currentIndex]);

  // ─────────────────────────────────────────────────────────────────────────
  // Card Action Handlers (each decision is saved as it is made)
  // ─────────────────────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    // Increment sweep count for ritual progress
    useGremlyStore
      .getState()
      .incrementSweepCount()
      .catch((err) => {
        sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
      });

    // Clear conversion state if user is acting on converted card
    if (convertedCandidate) {
      setConvertedCandidate(null);
    }

    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const { candidate } = candidateWithMeta;

    recordDecision({
      candidateId: candidate.id,
      candidateKind: candidate.kind as 'todo' | 'note',
      action: 'keep',
    });

    // Move to next card (or finish if last)
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete();
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, handleAllCardsComplete]);

  const handleClear = useCallback(() => {
    // Increment sweep count for ritual progress
    useGremlyStore
      .getState()
      .incrementSweepCount()
      .catch((err) => {
        sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
      });

    // Clear conversion state if user is acting on converted card
    if (convertedCandidate) {
      setConvertedCandidate(null);
    }

    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const { candidate } = candidateWithMeta;

    recordDecision({
      candidateId: candidate.id,
      candidateKind: candidate.kind as 'todo' | 'note',
      action: 'clear',
    });

    // Move to next card
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete();
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, handleAllCardsComplete]);

  const handleOpenEdit = useCallback(() => {
    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta) return;
    const { candidate } = candidateWithMeta;

    // Track which candidate is being edited so we can detect saves
    editingCandidateIdRef.current = candidate.id;

    // Look up full record from store (faster than DB fetch)
    let fullRecord: AppRecord | undefined;
    if (candidate.kind === 'todo') {
      const todo = todos.find((t) => t.id === candidate.id);
      if (todo) fullRecord = { ...todo, type: 'todo' } as AppRecord;
    } else if (candidate.kind === 'note') {
      const note = notes.find((n) => n.id === candidate.id);
      if (note) fullRecord = { ...note, type: 'note' } as AppRecord;
    }

    if (fullRecord) {
      // Open UnifiedOverlayV2 with the full record from store
      overlayController.openEdit({ record: fullRecord });
    } else {
      // Fallback: construct a minimal record from the raw data
      sweepLog.warn('[CardDeck] handleOpenEdit: record not found in store, using raw');
      const fallbackRecord = {
        ...candidate.raw,
        type: candidate.kind,
      } as AppRecord;
      overlayController.openEdit({ record: fallbackRecord });
    }
  }, [candidatesWithMeta, currentIndex, todos, notes, overlayController]);

  const handleConvertToTodo = useCallback(() => {
    const candidateWithMeta = candidatesWithMeta[currentIndex];
    if (!candidateWithMeta || candidateWithMeta.candidate.kind !== 'note') return;
    const candidate = candidateWithMeta.candidate;

    // Prevent duplicate conversions
    if (convertedCandidatesRef.current.has(candidate.id)) {
      sweepLog.debug('[CardDeck] Candidate already converted, ignoring:', candidate.id);
      return;
    }

    // Prevent re-triggering while conversion is in progress
    if (convertingCandidateRef.current?.sourceId === candidate.id) {
      sweepLog.debug('[CardDeck] Conversion already in progress for:', candidate.id);
      return;
    }

    // Track that we're converting this candidate (so we don't advance on save)
    convertingCandidateRef.current = {
      sourceId: candidate.id,
      sourceKind: candidate.kind,
      targetType: 'todo',
    };

    // Look up full record from store
    const note = notes.find((n) => n.id === candidate.id);
    const record = note ? { ...note, type: 'note' } : { ...candidate.raw, type: 'note' };

    // Open overlay in create mode with todo type and prefilled content
    // This mimics the "Turn into a to-do" conversion pattern
    overlayController.openCreate({
      type: 'todo',
      conversionMeta: {
        initialTitle: ((record as Record<string, unknown>).title as string) || '',
        initialNote: ((record as Record<string, unknown>).body as string) || '',
        initialTags: ((record as Record<string, unknown>).tags as string[]) || [],
        sourceNoteId: candidate.id, // Track source for potential archiving
      },
    });
  }, [candidatesWithMeta, currentIndex, notes, overlayController]);

  const handleConvertToType = useCallback(
    (targetType: 'todo' | 'note' | 'habit' | 'delete') => {
      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const candidate = candidateWithMeta.candidate;

      // Handle delete
      if (targetType === 'delete') {
        if (candidate.kind !== 'habit') {
          // saved with its Undo, and shown on the receipt as let go
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'clear',
            archiveReason: 'user_deleted',
          });
        } else if (candidate.kind === 'habit') {
          archiveHabit(candidate.id, 'user_deleted');
        }
        if (currentIndex < candidatesWithMeta.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          handleAllCardsComplete();
        }
        return;
      }

      // If target type is the same as current, do nothing
      if (candidate.kind === targetType) return;

      // Prevent duplicate conversions
      if (convertedCandidatesRef.current.has(candidate.id)) {
        sweepLog.debug('[CardDeck] Candidate already converted, ignoring:', candidate.id);
        return;
      }

      // Prevent re-triggering while conversion is in progress
      if (convertingCandidateRef.current?.sourceId === candidate.id) {
        sweepLog.debug('[CardDeck] Conversion already in progress for:', candidate.id);
        return;
      }

      // Track that we're converting this candidate
      convertingCandidateRef.current = {
        sourceId: candidate.id,
        sourceKind: candidate.kind,
        targetType,
      };

      // Look up full record from the appropriate store
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let record: Record<string, any>;
      if (candidate.kind === 'todo') {
        const todo = todos.find((t) => t.id === candidate.id);
        record = todo ? { ...todo, type: 'todo' } : { ...candidate.raw, type: 'todo' };
      } else if (candidate.kind === 'note') {
        const note = notes.find((n) => n.id === candidate.id);
        record = note ? { ...note, type: 'note' } : { ...candidate.raw, type: 'note' };
      } else {
        const habit = habits.find((h) => h.id === candidate.id);
        record = habit ? { ...habit, type: 'habit' } : { ...candidate.raw, type: 'habit' };
      }

      // Get the title and body for conversion
      const title = (record.name as string) || (record.title as string) || '';
      const body = (record.body as string) || '';
      const tags = (record.tags as string[]) || [];

      // Open overlay in create mode with the target type and prefilled content
      overlayController.openCreate({
        type: targetType === 'note' ? 'log' : targetType,
        conversionMeta: {
          initialTitle: title,
          initialNote: body,
          initialTags: tags,
          sourceNoteId: candidate.id,
        },
      });
    },
    [
      candidatesWithMeta,
      currentIndex,
      todos,
      notes,
      habits,
      archiveHabit,
      overlayController,
      handleAllCardsComplete,
      recordDecision,
    ],
  );

  const handleUpdateEventDate = useCallback(
    async (newDate: Date) => {
      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta || candidateWithMeta.candidate.kind !== 'note') return;
      const candidate = candidateWithMeta.candidate;

      const ds = getDateService();
      const newDateStr = ds.toLocalDate(newDate);

      try {
        await updateNote(candidate.id, {
          target_date: newDateStr,
        } as any);
        sweepLog.debug('[CardDeck] Updated event date to:', newDateStr);
      } catch (error) {
        sweepLog.error('[CardDeck] Failed to update event date:', error);
      }
    },
    [candidatesWithMeta, currentIndex, updateNote],
  );

  /**
   * Handle confirmed note action (fine / resurface / event reminder)
   * Called by SweepCardNew on swipe right for notes. Bundles noteAction and dates.
   */
  const handleConfirmNoteAction = useCallback(
    (action: {
      noteAction: 'fine' | 'resurface';
      resurfaceDateStr?: string;
      reminderDateStr?: string;
      resurfaceTiming?: 'nextweek' | '2weeks' | 'pick';
      eventReminder?: 'daybefore' | 'weekbefore' | 'custom';
    }) => {
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      recordDecision({
        candidateId: candidate.id,
        candidateKind: 'note',
        action: 'keep',
        noteAction: action.noteAction,
        resurfaceDateStr: action.resurfaceDateStr,
        reminderDateStr: action.reminderDateStr,
        resurfaceTiming: action.resurfaceTiming,
        eventReminder: action.eventReminder,
      });

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete();
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, handleAllCardsComplete],
  );

  /**
   * Handle confirmed todo action (due date + optional reminder in a single decision)
   */
  const handleConfirmTodoAction = useCallback(
    (action: {
      dueDateStr?: string;
      laterDateStr?: string;
      reminderDateStr?: string;
      reminderTime?: string;
    }) => {
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      recordDecision(
        action.laterDateStr
          ? // put off for Later: the week's Later, with the day it comes back
            {
              candidateId: candidate.id,
              candidateKind: 'todo',
              action: 'keep',
              resurfaceDateStr: action.laterDateStr,
            }
          : {
              candidateId: candidate.id,
              candidateKind: 'todo',
              action: 'keep',
              dueDateStr: action.dueDateStr,
              reminderDateStr: action.reminderDateStr,
              reminderTime: action.reminderTime,
            },
      );

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete();
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, handleAllCardsComplete],
  );

  const handleConfirmEventAction = useCallback(
    (action: {
      reminderDateStr: string;
      reminderTime?: string;
      eventReminder?: 'daybefore' | 'weekbefore' | 'custom';
      prepTodoText?: string;
    }) => {
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      recordDecision({
        candidateId: candidate.id,
        candidateKind: 'note',
        action: 'keep',
        reminderDateStr: action.reminderDateStr,
        reminderTime: action.reminderTime || '09:00',
        eventReminder: action.eventReminder,
        prepTodoText: action.prepTodoText,
      });

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete();
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, handleAllCardsComplete],
  );

  /**
   * Open Entity Chat Handler: opens chat modal for current card
   */
  const handleOpenChat = useCallback((presetHint?: string) => {
    setChatPresetHint(presetHint);
    setShowEntityChat(true);
  }, []);

  /**
   * Clarification Selection Handler: user picks an option to clarify ambiguous item
   */
  const handleClarificationSelect = useCallback(
    async (optionId: string, when?: ClarificationWhen) => {
      const candidate = candidatesWithMeta[currentIndex]?.candidate;
      if (!candidate) return;

      setIsSubmittingClarification(true);
      try {
        // Call the store function to resolve clarification
        await resolveEntityClarification(candidate.id, optionId, false, when ?? null);

        // Show success briefly
        setClarificationSuccess('Got it!');

        // After success animation, hide popup and trigger card refresh with flip animation
        setTimeout(() => {
          setShowClarification(false);
          setClarificationSuccess(null);
          // Increment key to force card re-render with updated data
          setCardFlipKey((prev) => prev + 1);
          // Trigger flip animation
          setIsClarified(true);
          // Reset animation flag after animation duration
          setTimeout(() => setIsClarified(false), 850);
        }, 1000);
      } catch (error) {
        sweepLog.error('[Sweep] Clarification resolution failed:', error);
        // Still close popup on error: user can retry via edit
        setShowClarification(false);
      } finally {
        setIsSubmittingClarification(false);
      }
    },
    [candidatesWithMeta, currentIndex, resolveEntityClarification],
  );

  /**
   * Clarification Skip Handler: user skips clarification, proceeds with card as-is
   */
  const handleClarificationSkip = useCallback(() => {
    // User skips: close popup, proceed with card as-is
    setShowClarification(false);
  }, []);

  // A held drop on the current card asks "is this one you already have?",
  // like a question or a split. The candidates are a snapshot, so what was
  // asked is tracked here rather than read back from the card.
  const relationCandidate = candidatesWithMeta[currentIndex]?.candidate;
  // any kind of drop: from the Mind Drop rethink a drop is saved as its own kind,
  // and only while its ask is live (lib/minddrop/asks.ts)
  const relationHeld = relationCandidate ? relationOf(relationCandidate.raw?.views) : null;
  const relationLive =
    !!relationCandidate &&
    liveAsksOf(relationCandidate.raw as AskItem).some(
      (a) => a.kind === 'relation' || a.kind === 'same',
    );
  const relationNoteId =
    relationCandidate &&
    relationHeld?.status === 'pending' &&
    relationLive &&
    !relationHandledIds.has(relationCandidate.id)
      ? relationCandidate.id
      : null;

  const markRelationHandled = useCallback((id: string | null) => {
    if (!id) return;
    setRelationHandledIds((prev) => new Set(prev).add(id));
  }, []);

  const handleRelationResolved = useCallback(
    (outcome: RelationResolution) => {
      markRelationHandled(relationNoteId);
      if (outcome === 'applied') {
        // the drop was only the ask (or a journal entry that stays): next card
        handleOutcome('changed');
        return;
      }
      const c = relationHeld?.classified;
      if (outcome === 'clarify' && c?.clarificationQuestion && c.clarificationOptions) {
        // it was unclear before it was held: its question comes back now
        setClarificationQuestion(c.clarificationQuestion);
        setClarificationOptions(c.clarificationOptions as any[]);
        setShowClarification(true);
        return;
      }
      // filed as it was classified: refresh the card the way an answered question does
      setCardFlipKey((prev) => prev + 1);
      setIsClarified(true);
      setTimeout(() => setIsClarified(false), 850);
    },
    [markRelationHandled, relationNoteId, relationHeld, handleOutcome],
  );

  // A card whose item an earlier answer cleared (removed, merged away, ticked
  // off) is passed over, in the direction the user was going
  const lastIndexRef = useRef(currentIndex);
  useEffect(() => {
    const step = Math.sign(currentIndex - lastIndexRef.current);
    lastIndexRef.current = currentIndex;
    if (isLoading || step === 0) return;
    const card = candidatesWithMeta[currentIndex]?.candidate;
    if (!card || !goneSinceStart(card, { todos, notes, habits })) return;
    setCurrentIndex(currentIndex + step < 0 ? currentIndex + 1 : currentIndex + step);
  }, [currentIndex, isLoading, candidatesWithMeta, todos, notes, habits]);

  // Finish when all cards are processed (fallback)
  useEffect(() => {
    if (!isLoading && candidatesWithMeta.length > 0 && currentIndex >= candidatesWithMeta.length) {
      // Normally the last card's handler calls handleAllCardsComplete
      handleAllCardsComplete();
    }
  }, [isLoading, candidatesWithMeta.length, currentIndex, handleAllCardsComplete]);

  // Build effective candidate: if this card was converted, use the new entity data
  // NOTE: This must be called unconditionally (before early returns) to satisfy React hooks rules
  const effectiveCandidateWithMeta = useMemo(() => {
    // Guard for empty/out-of-bounds state
    if (candidatesWithMeta.length === 0 || currentIndex >= candidatesWithMeta.length) {
      return null;
    }

    // The card as its item is now: an answer earlier in this Sweep may have
    // moved or renamed it since the snapshot was taken
    const snap = candidatesWithMeta[currentIndex];
    const base = sweepCardNow(
      snap,
      allCandidates,
      entityNow(snap.candidate, { todos, notes, habits }),
    );

    // Check if this candidate was just converted (e.g., note -> todo, note -> habit)
    if (convertedCandidate && base.candidate.id === convertedCandidate.originalId) {
      // Look up the new entity from the store based on what it was converted to
      if (convertedCandidate.newKind === 'todo') {
        const newTodo = todos.find((t) => t.id === convertedCandidate.newId);
        if (newTodo) {
          // Return a transformed candidate with todo data
          const convertedTodoCandidate: SweepCandidateTodo = {
            id: newTodo.id,
            kind: 'todo' as const,
            createdAt: newTodo.created_at || base.candidate.createdAt,
            dropId: (newTodo as any).drop_id ?? base.candidate.dropId,
            skippedInSweepAt: null,
            isOverdue: false,
            isDueToday: false,
            isCreatedToday: true,
            raw: newTodo as any,
          };
          const newMeta = computeSweepCardMeta(convertedTodoCandidate);
          return {
            ...base,
            candidate: convertedTodoCandidate,
            meta: newMeta,
            isConverted: true,
          };
        }
      } else if (convertedCandidate.newKind === 'habit') {
        const newHabit = habits.find((h) => h.id === convertedCandidate.newId);
        if (newHabit) {
          // Return a transformed candidate with habit data
          const convertedHabitCandidate: SweepCandidateHabit = {
            id: newHabit.id,
            kind: 'habit' as const,
            createdAt: newHabit.created_at || base.candidate.createdAt,
            dropId: (newHabit as any).drop_id ?? base.candidate.dropId,
            skippedInSweepAt: null,
            isOverdue: false,
            isDueToday: false,
            isCreatedToday: true,
            raw: newHabit as any,
          };
          const newMeta = computeSweepCardMeta(convertedHabitCandidate);
          return {
            ...base,
            candidate: convertedHabitCandidate,
            meta: newMeta,
            isConverted: true,
          };
        }
      } else if (convertedCandidate.newKind === 'note') {
        const newNote = notes.find((n) => n.id === convertedCandidate.newId);
        if (newNote) {
          const convertedNoteCandidate: SweepCandidateNote = {
            id: newNote.id,
            kind: 'note' as const,
            createdAt: newNote.created_at || base.candidate.createdAt,
            dropId: (newNote as any).drop_id ?? base.candidate.dropId,
            skippedInSweepAt: null,
            isOverdue: false,
            isDueToday: false,
            isCreatedToday: true,
            raw: newNote as any,
            isEventToday: false,
            isEventPassed: false,
            daysUntilEvent: null,
          };
          const newMeta = computeSweepCardMeta(convertedNoteCandidate);
          return {
            ...base,
            candidate: convertedNoteCandidate,
            meta: newMeta,
            isConverted: true,
          };
        }
      }
    }

    return base;
  }, [currentIndex, candidatesWithMeta, convertedCandidate, todos, habits, notes, allCandidates]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
          <Text variant="subtle" style={styles.decisionLoadingText}>
            Preparing your Sweep…
          </Text>
        </View>
      </View>
    );
  }

  // Empty state: nothing to sweep
  if (candidatesWithMeta.length === 0) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionEmptyContainer}>
          <Text style={styles.decisionEmptyPrimary}>Nothing to sweep!</Text>
          <Text style={styles.decisionEmptySecondary}>
            You're all caught up. Check back after you've dropped some thoughts.
          </Text>
        </View>
        <View style={styles.buttonContainer}>
          <Button title="Done" variant="primary" onPress={() => onFinished()} />
        </View>
      </View>
    );
  }

  // All cards processed: show brief transition (auto-advances via useEffect above)
  if (currentIndex >= candidatesWithMeta.length || allSorted) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer} testID="sweep-cards-sorted">
          <Image source={GREMLY_MASCOT_CELEBRATE} style={styles.cardsSortedImage} />
          <Text style={styles.cardsSortedTitle}>All sorted</Text>
          <Text style={styles.cardsSortedSub}>Back to Gremly</Text>
        </View>
      </View>
    );
  }

  // Handle case where converted todo isn't in store yet (show loading)
  if (!effectiveCandidateWithMeta) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
          <Text variant="subtle" style={styles.decisionLoadingText}>
            Creating your todo…
          </Text>
        </View>
      </View>
    );
  }

  // Get current candidate (effectiveCandidateWithMeta already handles conversion)
  const currentCandidateWithMeta = effectiveCandidateWithMeta;
  const currentCandidate = currentCandidateWithMeta.candidate;
  const loadWithoutThisCard = (day: string) => cardDays.loadOn(day, currentCandidate.id);

  return (
    <View style={styles.decisionStepContainer}>
      {/* Decision Step Header: Close on right */}
      <View style={styles.decisionHeader}>
        <View style={styles.decisionHeaderSpacer} />

        {/* Progress indicator */}
        <View style={styles.headerProgressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${((currentIndex + 1) / candidatesWithMeta.length) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.counterText}>
            {`${currentIndex + 1} of ${candidatesWithMeta.length}`}
          </Text>
        </View>

        {/* Close button */}
        {onClose && (
          <TouchableOpacity
            style={styles.decisionCloseButton}
            onPress={handleCloseCards}
            activeOpacity={0.7}
            accessibilityLabel="Close Sweep"
            accessibilityRole="button"
          >
            <Icon name="X" size="sm" color={BRAND.colors.mossGreen} />
          </TouchableOpacity>
        )}
      </View>

      {/* Full-screen Card Area */}
      <View style={styles.decisionCardArea}>
        <SweepCardNew
          key={`${currentCandidate.id}-${currentIndex}-${cardFlipKey}`}
          candidate={currentCandidate}
          meta={currentCandidateWithMeta.meta}
          index={currentIndex}
          total={candidatesWithMeta.length}
          isConverted={convertedCandidate?.animating ?? false}
          isClarified={isClarified}
          onSkip={handleSkip}
          onClear={handleClear}
          onOpenEdit={handleOpenEdit}
          onConvertToTodo={handleConvertToTodo}
          onConfirmTodoAction={handleConfirmTodoAction}
          onConfirmEventAction={handleConfirmEventAction}
          onConfirmNoteAction={handleConfirmNoteAction}
          onClose={handleCloseCards}
          onOpenChat={handleOpenChat}
          onShowHelp={() => setShowHelp(true)}
          onConvertToType={handleConvertToType}
          onUpdateEventDate={handleUpdateEventDate}
          onRequestPhotoPreview={setPhotoPreviewUrl}
          sweepIntent={sweepIntent}
          dayLoad={currentCandidate.kind === 'todo' ? loadWithoutThisCard : undefined}
          laterDay={
            currentCandidate.kind === 'todo' ? cardDays.laterDay(currentCandidate.id) : null
          }
        />

        {/* Clarification Popup: shown when current card needs clarification */}
        <ClarificationPopup
          visible={showClarification}
          question={clarificationQuestion ?? null}
          options={clarificationOptions ?? null}
          onSelectOption={handleClarificationSelect}
          onSkip={handleClarificationSkip}
          onClose={handleClarificationSkip}
          isSubmitting={isSubmittingClarification}
          successMessage={clarificationSuccess}
        />

        {/* "Is this one you already have?", shown when the current card is a held drop */}
        <RelationPopup
          key={relationNoteId ?? 'none'}
          visible={!!relationNoteId && !relationParked}
          noteId={relationNoteId}
          onClose={() => markRelationHandled(relationNoteId)}
          onResolved={handleRelationResolved}
          onOpenItem={
            openItemThenReturn
              ? (entity) => {
                  setRelationParked(true);
                  openItemThenReturn({ id: entity.id, type: entity.type }, () =>
                    setRelationParked(false),
                  );
                }
              : undefined
          }
        />
      </View>

      {/* Bottom section: how many are saved already */}
      <View style={styles.bottomSection}>
        {savedCount > 0 ? (
          <View style={styles.savedSoFar} testID="sweep-cards-saved">
            <Icon name="Check" size="xs" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
            <Text style={styles.savedSoFarText}>{savedCount} saved so far</Text>
          </View>
        ) : null}
      </View>

      {/* Entity Chat Modal */}
      <Modal
        visible={showEntityChat}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowEntityChat(false)}
      >
        <EntityChatScreen
          entityId={currentCandidate.id}
          entityType={currentCandidate.kind}
          initialPreset={chatPresetHint as any}
          sweepContext={{
            times_moved: currentCandidateWithMeta.meta.rescheduleCount ?? 0,
            days_unscheduled: 0,
            is_overdue: currentCandidateWithMeta.meta.todoStatus === 'overdue',
          }}
          onClose={() => setShowEntityChat(false)}
        />
      </Modal>

      {/* Photo Preview Modal */}
      <Modal
        visible={photoPreviewUrl !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoPreviewUrl(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.85)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setPhotoPreviewUrl(null)}
        >
          {photoPreviewUrl && (
            <PrivateImage
              uri={photoPreviewUrl}
              style={{
                width: Dimensions.get('window').width * 0.9,
                height: Dimensions.get('window').height * 0.7,
                borderRadius: 8,
              }}
              resizeMode="contain"
            />
          )}
        </Pressable>
      </Modal>

      <GremlyHelpCard visible={showHelp} onDismiss={() => setShowHelp(false)} screen="sweep" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CardDeckScreen({ navigation: navProp }: Props) {
  // Use hook for navigation to ensure we always have access
  const navigationHook = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const navigation = navProp || navigationHook;

  const route = useRoute<RouteProp<RootStackParamList, 'Cards'>>();
  // The cards on their own, opened from today's thread: tonight's wrap up, or
  // the brief's quick sweep in the morning. Only the decision cards (and
  // splitting a drop with several things in it), each decision saved as it is
  // made, then straight back to the thread.
  const cardsMode = route.params.cards;
  useEffect(() => {
    if (cardsMode !== 'wrap') return undefined;
    cardsOpened();
    return () => cardsClosed();
  }, [cardsMode]);

  const canCreate = useCanCreate();

  // The age up waits while the cards are on screen. One earned while they are
  // open plays once they close. A fed day still rises over the cards and falls.
  useEffect(() => {
    celebrationController.holdAgeUp(true);
    return () => celebrationController.holdAgeUp(false);
  }, []);

  const [step, setStep] = useState<number>(1);
  // The morning's quick sweep sorts for today. Tonight's wrap up sorts for the
  // next day, unless it is before the evening, when today still has room.
  const sweepIntent: SweepIntent = useMemo(() => {
    if (cardsMode === 'wrap') return wrapNow().evening ? 'tomorrow' : 'today';
    return 'today';
  }, [cardsMode]);

  // Get unresolved multi-drops from NOTES (not queueItems: they're promoted before sweep starts)
  // Multi-drops are stored as notes with views.is_multi=true and views.minddrop_stage='multi_pending'
  const notes = useGremlyStore((state) => state.notes);
  const unresolvedMultiDrops = useMemo(() => {
    const multiNotes = notes.filter((note) => {
      const views = note.views as {
        is_multi?: boolean;
        multi_items?: Array<{ text: string; bucket?: string; smartTitle?: string }>;
        minddrop_stage?: string;
      } | null;
      return (
        views?.is_multi === true &&
        views?.minddrop_stage === 'multi_pending' &&
        Array.isArray(views?.multi_items) &&
        views.multi_items.length > 1 &&
        !note.archived
      );
    });
    sweepLog.debug('[CardDeck] notes count:', notes.length);
    sweepLog.debug('[CardDeck] unresolvedMultiDrops count:', multiNotes.length);
    if (multiNotes.length > 0) {
      multiNotes.forEach((note) => {
        const views = note.views as any;
        sweepLog.debug('[CardDeck] multi-note:', {
          id: note.id,
          title: note.title,
          multiItemsCount: views?.multi_items?.length ?? 0,
          minddropStage: views?.minddrop_stage,
        });
      });
    }
    return multiNotes;
  }, [notes]);

  // a drop with several things in it is split first
  useEffect(() => {
    if (unresolvedMultiDrops.length > 0) setStep(0.25);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map notes to UnresolvedMultiDrop format for SweepMultiSplitStep component
  const unresolvedMultiDropsForStep = useMemo(() => {
    return unresolvedMultiDrops.map((note) => {
      const views = note.views as {
        multi_items?: Array<{
          text: string;
          bucket?: string;
          subtype?: string | null;
          habitSubtype?: string | null;
          preview_title?: string;
          smart_title?: string | null;
          confirmation_message?: string | null;
        }>;
        multi_summary_title?: string;
        dominant_bucket?: string;
        dominant_subtype?: string;
      } | null;

      return {
        localId: note.id, // Use note.id as localId for handlers
        originalText: note.body ?? '',
        items:
          views?.multi_items?.map((item) => ({
            text: item.text,
            bucket: (item.bucket as 'todo' | 'habit' | 'log') ?? 'log',
            subtype: (item.subtype as 'journal' | 'idea' | 'general' | null) ?? null,
            habitSubtype: (item.habitSubtype as 'start_habit' | 'break_habit' | null) ?? null,
            preview_title: item.preview_title ?? item.text.substring(0, 50),
            smart_title: item.smart_title ?? null,
            confirmation_message: item.confirmation_message ?? null,
          })) ?? [],
        summaryTitle: views?.multi_summary_title ?? note.title ?? '',
        dominantBucket: views?.dominant_bucket ?? null,
        dominantSubtype: views?.dominant_subtype ?? null,
      };
    });
  }, [unresolvedMultiDrops]);

  // ─────────────────────────────────────────────────────────────────────────
  // Global overlay state: the item sheet is drawn on top of the cards
  // ─────────────────────────────────────────────────────────────────────────
  const overlay = useGlobalOverlay();
  const {
    state: {
      visible: overlayVisible,
      mode: overlayMode,
      initialEntity: overlayInitialEntity,
      initialSpaceId: overlayInitialSpaceId,
      conversionMeta: overlayConversionMeta,
      initialText: overlayInitialText,
      initialLogPhotoUris: overlayInitialLogPhotoUris,
    },
    close: overlayClose,
  } = overlay;

  // Extract full entity for edit mode pre-fill
  const overlayFullEntity = (overlay.state as unknown as Record<string, unknown>).entity ?? null;
  const overlayEffectiveInitialEntity = overlayFullEntity || overlayInitialEntity;
  const overlayDefaultDueToday =
    ((overlay.state as unknown as Record<string, unknown>)?.defaultDueToday as boolean) ?? false;

  const handleOverlayClose = useCallback(() => {
    if (!overlayVisible) return;
    // Emit close event so CardDeck knows user cancelled (didn't save)
    const editingId = overlayInitialEntity?.id;
    emitOverlayClosed({
      mode: overlayMode,
      editingId,
      didSave: false,
    });
    overlayClose();
  }, [overlayClose, overlayVisible, overlayMode, overlayInitialEntity]);

  const handleOverlaySaved = useCallback(
    async (result: OverlaySavedPayload) => {
      emitOverlaySaved(result);
      try {
        eventBus.emit('OverlaySaved', {
          id: result.id,
          type: (result as unknown as Record<string, unknown>).type as string | undefined,
        });
      } catch (e) {
        // ignore telemetry failures
      }
      overlayClose();
    },
    [overlayClose],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Multi-Split Step Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Handle splitting a multi-drop into separate entities
  const handleMultiSplit = useCallback(
    async (dropId: string, selectedItems: import('../../lib/minddrop/types').MultiDropItem[]) => {
      if (!canCreate) {
        navigation.navigate('TrialEndPaywall', { source: 'expiry' });
        return;
      }
      const { createTodo, createHabit, createNote, archiveNote } = useGremlyStore.getState();

      // Create each item as proper entity: they'll appear in sweep automatically
      for (const item of selectedItems) {
        const title = item.smart_title || item.preview_title || item.text;

        if (item.bucket === 'todo') {
          createTodo?.({ name: title });
        } else if (item.bucket === 'habit') {
          createHabit?.({
            name: title,
            frequency: 'daily',
            subtype: item.habitSubtype === 'break_habit' ? 'break_habit' : 'start_habit',
          });
        } else {
          // Log bucket: create as note
          createNote?.({
            title,
            body: item.text,
            subtype:
              item.subtype === 'journal' || item.subtype === 'idea' ? item.subtype : 'catchall',
          });
        }
      }

      // Archive the original multi-drop note
      archiveNote?.(dropId, 'split');
    },
    [canCreate, navigation],
  );

  // Handle keeping a multi-drop as a single entity
  const handleMultiKeepAsOne = useCallback(
    (dropId: string) => {
      if (!canCreate) {
        navigation.navigate('TrialEndPaywall', { source: 'expiry' });
        return;
      }
      const state = useGremlyStore.getState();
      const { resolveMultiDropAsSingle, createTodo, createHabit, archiveNote } = state;
      const note = state.notes.find((n) => n.id === dropId);

      if (!note) {
        sweepLog.warn('[CardDeck] handleMultiKeepAsOne: note not found', { dropId });
        return;
      }

      const views = note.views as {
        dominant_bucket?: string;
        dominant_subtype?: string;
        multi_items?: Array<{ text: string }>;
      } | null;

      const dominantBucket = views?.dominant_bucket;
      const dominantSubtype = views?.dominant_subtype;
      const originalText = note.body || note.title || '';

      // Determine target bucket and subtype
      const targetBucket =
        dominantBucket === 'todo' ? 'todo' : dominantBucket === 'habit' ? 'habit' : 'log';
      const targetSubtype =
        dominantSubtype === 'journal' || dominantSubtype === 'idea'
          ? dominantSubtype
          : targetBucket === 'log'
            ? 'catchall'
            : null;

      // Fire-and-forget: convert entity type if needed, then enrich
      (async () => {
        try {
          let entityId = dropId;
          let entityBucket = targetBucket;

          if (dominantBucket === 'todo') {
            // Convert note → todo
            const newTodo = await createTodo?.({
              name: note.title || originalText,
              body: originalText,
              origin: 'sweep',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_kept_together',
              },
            } as any);

            if (newTodo?.id) {
              await archiveNote?.(dropId, 'converted_to_todo');
              entityId = newTodo.id;
              entityBucket = 'todo';
              sweepLog.debug('[CardDeck] Converted multi-drop to todo:', entityId);
            }
          } else if (dominantBucket === 'habit') {
            // Convert note → habit
            const newHabit = await createHabit?.({
              name: note.title || originalText,
              title: note.title || originalText,
              notes: originalText,
              frequency: 'daily',
              subtype: 'start_habit',
              origin: 'sweep',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_kept_together',
              },
            } as any);

            if (newHabit?.id) {
              await archiveNote?.(dropId, 'converted_to_habit');
              entityId = newHabit.id;
              entityBucket = 'habit';
              sweepLog.debug('[CardDeck] Converted multi-drop to habit:', entityId);
            }
          } else {
            // Keep as note: clear multi flag, set up for enrichment
            resolveMultiDropAsSingle?.(dropId);
          }

          // Run Phase 1.5a + Phase 2 enrichment
          const cortexUrl = readCortexUrl();
          if (!cortexUrl) {
            sweepLog.warn('[CardDeck] Missing cortex URL, skipping enrichment');
            return;
          }
          const sessionToken = await getSessionToken();

          const ds = getDateService();
          const currentDateStr = ds.today();
          const dayOfWeek = ds.getDayOfWeek();
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

          sweepLog.debug('[CardDeck] Running Phase 1.5a + Phase 2 for kept-as-single:', entityId);

          const [phase15aResult, phase2Result] = await Promise.all([
            // Phase 1.5a: Smart title + confirmation message
            (async () => {
              try {
                const res = await fetch(cortexUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionToken}`,
                  },
                  body: JSON.stringify({
                    type: 'enrich-phase1-5a',
                    text: originalText,
                    bucket: entityBucket,
                    subtype: targetSubtype,
                  }),
                });
                if (!res.ok) return null;
                return await res.json();
              } catch (err) {
                sweepLog.warn('[CardDeck] Phase 1.5a failed:', err);
                return null;
              }
            })(),
            // Phase 2: Tags, energy type, etc.
            (async () => {
              try {
                const res = await fetch(cortexUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionToken}`,
                  },
                  body: JSON.stringify({
                    type: 'enrich-phase2',
                    text: originalText,
                    bucket: entityBucket,
                    subtype: targetSubtype,
                    currentDate: currentDateStr,
                    dayOfWeek,
                    timezone,
                  }),
                });
                if (!res.ok) return null;
                return await res.json();
              } catch (err) {
                sweepLog.warn('[CardDeck] Phase 2 failed:', err);
                return null;
              }
            })(),
          ]);

          sweepLog.debug('[CardDeck] Phase 1.5a result:', JSON.stringify(phase15aResult));
          sweepLog.debug('[CardDeck] Phase 2 result:', JSON.stringify(phase2Result));

          // Build update payload
          const updatePayload: Record<string, unknown> = {};

          if (phase15aResult?.smart_title) {
            updatePayload.title = phase15aResult.smart_title;
            updatePayload.name = phase15aResult.smart_title;
          }

          const aiTags = Array.isArray(phase2Result?.tags) ? phase2Result.tags : [];
          if (aiTags.length > 0) {
            updatePayload.tags = aiTags;
          }

          if (phase2Result?.energy_type) {
            updatePayload.energy_type = phase2Result.energy_type;
          }

          if (phase2Result?.time_estimate_minutes) {
            updatePayload.time_estimate_minutes = phase2Result.time_estimate_minutes;
          }

          // Views update with confirmation message and enriched stage
          const viewsUpdate: Record<string, unknown> = {
            minddrop_stage: 'enriched',
            is_multi: false,
            ai_pending: false,
            ...(phase15aResult?.confirmation_message && {
              confirmation_message: phase15aResult.confirmation_message,
            }),
            ...(phase2Result?.mood && { ai_mood: phase2Result.mood }),
          };
          updatePayload.views = viewsUpdate;

          // Apply updates to the correct entity type
          if (Object.keys(updatePayload).length > 0) {
            const store = useGremlyStore.getState();
            if (entityBucket === 'todo') {
              await store.updateTodo?.(entityId, updatePayload as any);
            } else if (entityBucket === 'habit') {
              await store.updateHabit?.(entityId, updatePayload as any);
            } else {
              await store.updateNote?.(entityId, updatePayload as any);
            }
            sweepLog.debug('[CardDeck] Enrichment applied for:', entityId);
          }
        } catch (error) {
          sweepLog.error('[CardDeck] Keep-as-single enrichment failed:', error);
          // Silent failure: the entity is already saved, just without enrichment
        }
      })();
    },
    [canCreate, navigation],
  );

  // Splitting is done: on to the cards
  const handleMultiSplitComplete = useCallback(() => {
    setStep(1);
  }, []);

  // the deck ends with the cards: straight back to the thread
  const handleDecisionFinished = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Handler for X close button.
  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Handler for back chevron: nothing comes before the cards, so it closes
  const handleGoBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <>
      <Screen
        edges={['top', 'bottom']}
        padded={false}
        style={step === 1 ? styles.screenBackgroundDecision : styles.screenBackground}
      >
        {/* The cards carry their own header */}
        {step !== 1 ? (
          <View style={styles.header}>
            {/* Left: back chevron */}
            <TouchableOpacity
              style={styles.headerBackButton}
              onPress={handleGoBack}
              activeOpacity={0.7}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Icon name="ChevronLeft" size="md" color={BRAND.colors.charcoalInk} strokeWidth={2} />
            </TouchableOpacity>

            {/* Center: subtle title */}
            <View style={styles.headerCenter}>
              <View style={styles.headerModeIndicator}>
                <Icon name="Sparkles" size="xs" color="rgba(46, 85, 64, 0.50)" strokeWidth={1.5} />
                <Text style={styles.headerModeLabel}>Sweep</Text>
              </View>
            </View>

            {/* Right close button */}
            <TouchableOpacity
              style={styles.headerCloseButton}
              onPress={handleClose}
              activeOpacity={0.7}
              accessibilityLabel="Close Sweep"
              accessibilityRole="button"
            >
              <Icon name="X" size="sm" color={BRAND.colors.charcoalInk} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Step Content: full-bleed for decision step */}
        <View style={step === 1 ? styles.contentDecision : styles.content}>
          {step === 0.25 && (
            <SweepMultiSplitStep
              multiDrops={unresolvedMultiDropsForStep}
              onSplit={handleMultiSplit}
              onKeepAsOne={handleMultiKeepAsOne}
              onComplete={handleMultiSplitComplete}
            />
          )}
          {step === 1 && (
            <CardDeck
              onFinished={handleDecisionFinished}
              onClose={handleClose}
              sweepIntent={sweepIntent}
              cards={cardsMode}
              onSaved={cardsMode === 'wrap' ? recordWrapDecision : undefined}
            />
          )}
        </View>
      </Screen>

      {/* Local overlay portal: the global OverlayHost renders below this
          screen, so the item sheet is drawn here to sit above the cards. */}
      {overlayVisible ? (
        <View pointerEvents="box-none" style={styles.overlayContainer}>
          <Pressable onPress={handleOverlayClose} style={styles.overlayScrim} />
          <View style={styles.overlayContent}>
            <OverlayComponent
              visible={overlayVisible}
              mode={overlayMode}
              initialEntity={overlayEffectiveInitialEntity as any}
              initialSpaceId={overlayInitialSpaceId}
              conversionMeta={overlayConversionMeta as any}
              initialText={overlayInitialText ?? undefined}
              initialLogPhotoUris={overlayInitialLogPhotoUris}
              defaultDueToday={overlayDefaultDueToday as boolean | undefined}
              onClose={handleOverlayClose}
              onSaved={handleOverlaySaved}
            />
          </View>
        </View>
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screenBackground: {
    backgroundColor: BRAND.colors.linenCream,
  },
  screenBackgroundDecision: {
    backgroundColor: '#FFFFFF', // White background for decision step
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: BRAND.colors.linenCream,
    // No shadow, no border: pure Linen Cream
  },
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerModeLabel: {
    fontSize: 14,
    fontWeight: '400', // Regular, not bold
    color: 'rgba(34, 34, 34, 0.75)', // Charcoal at 75% opacity
    letterSpacing: 0.2,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: BRAND.colors.linenCream,
  },
  contentDecision: {
    flex: 1,
    paddingHorizontal: 0, // Full-bleed for decision step
    backgroundColor: '#FFFFFF', // White background for decision step
  },
  stepContainer: {
    flex: 1,
    paddingTop: 24,
    backgroundColor: BRAND.colors.linenCream,
  },
  buttonContainer: {
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 12,
    backgroundColor: BRAND.colors.linenCream,
  },

  // CardDeck styles: white background with sage card
  decisionStepContainer: {
    flex: 1,
    position: 'relative', // For absolute positioned behindCardTextContainer
    backgroundColor: '#FFFFFF', // White background for contrast
  },
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  decisionHeaderSpacer: {
    width: 60, // Match back button width for alignment
  },
  decisionCloseButton: {
    padding: 8,
  },
  // Bottom section styles: compact chrome at bottom, clearly separated from card
  bottomSection: {
    alignItems: 'center',
    paddingBottom: 12,
    paddingTop: 8,
    marginTop: 4,
  },
  headerProgressContainer: {
    flex: 1,
    alignItems: 'center',
  },
  progressBar: {
    width: 100,
    height: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    borderRadius: 1,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 1,
  },
  counterText: {
    fontSize: 11,
    color: BRAND.colors.inkSubtle,
    fontWeight: '500',
    opacity: 0.8,
  },
  savedSoFar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  savedSoFarText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  cardsSortedImage: {
    width: 132,
    height: 132,
    resizeMode: 'contain',
    marginBottom: 12,
  },
  cardsSortedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
  },
  cardsSortedSub: {
    marginTop: 4,
    fontSize: 13,
    color: BRAND.colors.inkSubtle,
  },
  decisionLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  decisionLoadingText: {
    marginTop: 16,
  },
  decisionEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  decisionEmptyPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
    marginBottom: 4,
  },
  decisionEmptySecondary: {
    fontSize: 14,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
  },
  decisionCardArea: {
    flex: 1,
    paddingHorizontal: 0,
  },
  // Overlay styles (rendered locally to appear above modal)
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },
  overlayScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
