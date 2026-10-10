/**
 * Card Deck Screen: the decision cards on their own.
 *
 * Opened from today's thread by the wrap up (cards: 'wrap') or by the brief's
 * quick sweep (cards: 'quick'). A card with a question asks it on the card,
 * with the same strip as Mind Drop (Mind Drop rethink stage 8): the wrap up
 * asks the questions made that day, the quick sweep those made that day or
 * the day before, each once. Each decision is saved as it is made. The result goes back to the thread through lib/wrapup/session
 * (wrap) or is read on focus by the thread (quick).
 */

import React, { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
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
import { useIsLoading, useSweepCandidatesUnified } from '../../lib/store/selectors';

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

import { CardAsk } from '../../components/minddrop/CardAsk';
import { SplitBar } from '../../components/minddrop/SplitBar';
import { piecesOf } from '../../lib/minddrop/splitActions';
import { sweepAskOf, type Ask, type AskItem, type SweepWindow } from '../../lib/minddrop/asks';
import { lapseAsk } from '../../lib/minddrop/askActions';
import type { UnifiedDrop } from '../../types/UnifiedDrop';
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
/** After an answer clears a card's item: the strip closes, then the next card. */
const GONE_MOVE_ON_MS = 700;

/** A Sweep card's item, as the question strip reads a drop. */
function asDrop(c: SweepCandidate): UnifiedDrop {
  const raw = (c.raw ?? {}) as Record<string, any>;
  return {
    ...raw,
    id: c.id,
    kind: c.kind,
    title: raw.title ?? raw.name ?? '',
    text: raw.body ?? raw.text ?? raw.title ?? raw.name ?? '',
    created_at: raw.created_at ?? c.createdAt,
    drop_id: raw.drop_id ?? c.dropId ?? null,
    views: raw.views ?? {},
  } as UnifiedDrop;
}

/**
 * Keep as one on a piece of a clear split made that day (stage 8): it runs
 * Mind Drop's Keep as one for the whole group, and the other pieces drop out
 * of the deck as they are archived.
 */
function keepAsOneFor(c: SweepCandidate, decided: ReadonlySet<string>): React.ReactNode {
  const group = ((c.raw ?? {}) as Record<string, any>).views?.split_group as
    | { id?: string; count?: number; said?: string }
    | undefined;
  if (!group?.id || (group.said && group.said !== 'clear')) return null;
  const ds = getDateService();
  if (ds.dayOf(c.createdAt) !== ds.today()) return null;
  // a piece already sorted in this Sweep keeps its decision: no Keep as one now
  if (piecesOf(group.id).some((p) => decided.has(p.item.id))) return null;
  return (
    <SplitBar groupId={group.id} count={group.count ?? 0} testID={`sweep-splitbar-${group.id}`} />
  );
}

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

  // Which questions this Sweep asks: the wrap up those made that day, the
  // quick sweep those made that day or the day before (lib/minddrop/asks.ts)
  const sweepWindow: SweepWindow = cards === 'quick' ? 'quick' : 'wrapup';

  // Cards with a question first (their answers can change other cards), then
  // todos, events and notes (lib/sweep/sweepOrder.ts)
  const candidatesWithMeta = useMemo(
    () => orderSweepCards(unsortedCandidatesWithMeta, getDateService().today(), sweepWindow),
    [unsortedCandidatesWithMeta, sweepWindow],
  );

  // Store mutations for sweep actions
  const updateNote = useGremlyStore((state) => state.updateNote);
  const archiveHabit = useGremlyStore((state) => state.archiveHabit);

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
  const currentIndexRef = useRef(currentIndex);
  // kept current for the handlers, once each render is in
  useLayoutEffect(() => {
    onSavedRef.current = onSaved;
    currentIndexRef.current = currentIndex;
  });

  // Entity chat state (for chat button on sweep cards)
  const [showEntityChat, setShowEntityChat] = useState(false);
  const [chatPresetHint, setChatPresetHint] = useState<string | undefined>();
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const [cardFlipKey] = useState(0); // the card's key, so a fresh card mounts for each index
  const [isClarified, setIsClarified] = useState(false); // the card turns over once its question is answered
  // The question strip is showing on the current card (its choices wait under it)
  const [askOpen, setAskOpen] = useState(false);

  // Helper to record a decision: it is saved now.
  // questions answered on their card in this Sweep: an answer still saving is never let go
  const answeredRef = useRef<Set<string>>(new Set());
  // a decision that did not save brought its card back (not a moving on)
  const jumpBackRef = useRef(false);
  // what was decided in this Sweep, so Keep as one never undoes a piece already sorted
  const [decidedIds, setDecidedIds] = useState<ReadonlySet<string>>(() => new Set());

  const recordDecision = useCallback((given: SweepDecision) => {
    setDecidedIds((had) => new Set(had).add(given.candidateId));
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
        // back to that card: not a moving on, so the next card's question is not let go
        jumpBackRef.current = true;
        setCurrentIndex(index);
      })
      .finally(() => {
        pendingSavesRef.current.delete(save);
      });
    pendingSavesRef.current.add(save);
  }, []);

  // The question on the card now, if Sweep is asking one (set as the card
  // renders). Moving on without an answer lets it go: it is asked once.
  const deckAskRef = useRef<{ id: string; ask: Ask } | null>(null);
  const letAskGo = useCallback(() => {
    const now = deckAskRef.current;
    if (!now) return;
    deckAskRef.current = null;
    if (answeredRef.current.has(now.id)) return;
    lapseAsk(now.id, now.ask).catch((err) =>
      sweepLog.warn('[Sweep] the question could not be let go', { id: now.id, error: String(err) }),
    );
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
    // the last card's question, if it was still asked, is let go as the cards finish
    letAskGo();
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
  }, [onFinished, letAskGo]);

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

  useLayoutEffect(() => {
    convertedRef.current = convertedCandidate;
  });

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
      if (outcome !== 'stay') letAskGo();
      // a habit is on the deck only for its question: moving on decides nothing
      if (candidate.kind === 'habit' && outcome !== 'stay') {
        setCurrentIndex((prev) => prev + 1);
        return;
      }

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
    [candidatesWithMeta, currentIndex, recordDecision, letAskGo],
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

    // moving on without answering lets the card's question go
    letAskGo();
    // a habit is on the deck only for its question: moving on decides nothing
    if (candidate.kind !== 'habit') {
      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind as 'todo' | 'note',
        action: 'keep',
      });
    }

    // Move to next card (or finish if last)
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete();
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, handleAllCardsComplete, letAskGo]);

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

    // moving on without answering lets the card's question go
    letAskGo();
    // a habit is on the deck only for its question: a swipe never clears it
    if (candidate.kind !== 'habit') {
      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind as 'todo' | 'note',
        action: 'clear',
      });
    }

    // Move to next card
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete();
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, handleAllCardsComplete, letAskGo]);

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

  // The question Sweep asks on this card, from the item as it is now: once it
  // is answered or let go, the card carries on as a normal Sweep card
  const deckCard = effectiveCandidateWithMeta?.candidate ?? null;
  // read from the store only: a card whose item has gone asks nothing more
  const deckItem = deckCard ? entityNow(deckCard, { todos, notes, habits }) : null;
  const deckViews = (deckItem?.views ?? {}) as Record<string, unknown>;
  // an answer being filed (as the card's strip waits, asks.cardStripAsk): nothing to ask
  const deckFiling = deckViews.clarification_processing === true || deckViews.ai_pending === true;
  const deckAsk: Ask | null =
    deckItem && !deckFiling
      ? sweepAskOf(deckItem as AskItem, getDateService().today(), sweepWindow)
      : null;
  // On to another card, however it went: the question the last card was still
  // asking is let go (deckAskRef still holds it here, as it is set below)
  const askedIndexRef = useRef(currentIndex);
  useEffect(() => {
    if (askedIndexRef.current === currentIndex) return;
    askedIndexRef.current = currentIndex;
    if (jumpBackRef.current) {
      jumpBackRef.current = false;
      return;
    }
    letAskGo();
  }, [currentIndex, letAskGo]);
  useEffect(() => {
    deckAskRef.current = deckCard && deckAsk ? { id: deckCard.id, ask: deckAsk } : null;
  });

  // An answer cleared this card's item (a yes, Keep just one, a split, Keep as
  // one): on to the next card once the strip has closed
  // (a card's item seen in the store and missing now was deleted by an answer, or
  // replaced: a conversion shows its new item, so only one still missing counts)
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(() => new Set());
  const deckSeenId = deckCard && deckItem ? deckCard.id : null;
  useEffect(() => {
    if (!deckSeenId) return;
    setSeenIds((had) => (had.has(deckSeenId) ? had : new Set(had).add(deckSeenId)));
  }, [deckSeenId]);
  const deckGone =
    !!deckCard &&
    (goneSinceStart(deckCard, { todos, notes, habits }) ||
      (!deckItem && !convertedCandidate && seenIds.has(deckCard.id)));
  useEffect(() => {
    if (!deckGone || isLoading) return undefined;
    const timer = setTimeout(() => setCurrentIndex((i) => i + 1), GONE_MOVE_ON_MS);
    return () => clearTimeout(timer);
  }, [deckGone, isLoading, currentIndex]);

  // An answered question turns the card over, as an answered popup did
  const askKeyNow = deckCard && deckAsk ? `${deckCard.id}:${deckAsk.kind}` : null;
  const lastAsk = useRef<{ index: number; key: string | null }>({ index: -1, key: null });
  useEffect(() => {
    const before = lastAsk.current;
    lastAsk.current = { index: currentIndex, key: askKeyNow };
    if (before.index !== currentIndex || !before.key || askKeyNow || deckGone) return undefined;
    setIsClarified(true);
    const timer = setTimeout(() => setIsClarified(false), 850);
    return () => {
      clearTimeout(timer);
      setIsClarified(false);
    };
  }, [askKeyNow, currentIndex, deckGone]);

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

      {/* Full-screen Card Area: it makes room for the keyboard, so a card's
          Something else field stays above it (final check item 21) */}
      <KeyboardAvoidingView
        style={styles.decisionCardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
          askStrip={
            <CardAsk
              key={`${candidatesWithMeta[currentIndex]?.candidate.id}-${currentIndex}`}
              item={asDrop(currentCandidate)}
              ask={deckAsk}
              place="sweep"
              onShowing={setAskOpen}
              onAnswer={() => answeredRef.current.add(currentCandidate.id)}
              testID={`sweep-ask-${currentCandidate.id}`}
            />
          }
          askOpen={askOpen}
          splitBar={keepAsOneFor(currentCandidate, decidedIds)}
        />
      </KeyboardAvoidingView>

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
  // the brief's quick sweep in the morning. Only the decision cards, each
  // decision saved as it is made, then straight back to the thread. (The split
  // step left in the Mind Drop rethink, stage 8: an unsure split asks on its
  // card, and a clear split's pieces offer Keep as one.)
  const cardsMode = route.params.cards;
  useEffect(() => {
    if (cardsMode !== 'wrap') return undefined;
    cardsOpened();
    return () => cardsClosed();
  }, [cardsMode]);

  // The age up waits while the cards are on screen. One earned while they are
  // open plays once they close. A fed day still rises over the cards and falls.
  useEffect(() => {
    celebrationController.holdAgeUp(true);
    return () => celebrationController.holdAgeUp(false);
  }, []);

  // The morning's quick sweep sorts for today. Tonight's wrap up sorts for the
  // next day, unless it is before the evening, when today still has room.
  const sweepIntent: SweepIntent = useMemo(() => {
    if (cardsMode === 'wrap') return wrapNow().evening ? 'tomorrow' : 'today';
    return 'today';
  }, [cardsMode]);

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

  // the deck ends with the cards: straight back to the thread
  const handleDecisionFinished = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Handler for X close button.
  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <>
      <Screen edges={['top', 'bottom']} padded={false} style={styles.screenBackgroundDecision}>
        {/* The cards carry their own header, full-bleed */}
        <View style={styles.contentDecision}>
          <CardDeck
            onFinished={handleDecisionFinished}
            onClose={handleClose}
            sweepIntent={sweepIntent}
            cards={cardsMode}
            onSaved={cardsMode === 'wrap' ? recordWrapDecision : undefined}
          />
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
