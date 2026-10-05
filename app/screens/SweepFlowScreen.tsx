/**
 * Sweep Flow Screen: the decision cards, and the week planner.
 *
 * The evening Sweep itself is the wrap up in today's thread (lib/wrapup).
 * This screen is what it opens, and what Plan my week opens:
 * - cards: 'wrap' | 'quick': the decision cards on their own, from the thread.
 *   Step 0.25 splits a drop with several things in it first, step 1 is the
 *   cards, each decision saved as it is made.
 * - week: the week planner. Its chooser, then step 1 cards, step 2 habits,
 *   events, step 3 intention, step 4 summary.
 * Opened with neither, it sends the person to the wrap up.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  TouchableOpacity,
  Image,
  Modal,
  Vibration,
  Dimensions,
  Alert,
} from 'react-native';
import Reanimated, {
  FadeIn,
  FadeInUp,
  Easing as ReanimatedEasing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  interpolate,
} from 'react-native-reanimated';

import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { Screen, Text, Button } from '../../ui';
import { Icon } from '../../design-system/Icon';
import { Flame, Sparkles, CheckCircle } from 'lucide-react-native';
import { useAuth } from '../../providers/AuthProvider';
import { BRAND } from '../../design/brand';
import { getDateService } from '../../lib/date';
// Zustand store - used for all Sweep data operations
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import type { ClarificationWhen } from '../../lib/minddrop/clarification';
import { useWeekDays } from '../../lib/store/weekGridSelectors';
import { useCanCreate } from '../../lib/store/lifecycleSelectors';
import {
  useActiveSpaces,
  useIsLoading,
  useSweepCandidatesUnified,
} from '../../lib/store/selectors';

import { supabase } from '../../lib/supabase/client';
import { env, getEnv } from '../../lib/env';
import { getSessionToken } from '../../lib/cortex/getSessionToken';
import { markSweepCompleted } from '../../lib/sweep/engine';
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
  SweepSummary,
  SweepSummaryItem,
} from '../../lib/sweep/types';
import { SweepCardNew } from '../../components/sweep/SweepCardNew';
import { WeekBoardOverlay } from '../../components/sweep/WeekBoardOverlay';
import { SweepDemoFlow } from '../../components/sweep/SweepDemoFlow';
import GremlyHelpCard from '../../components/help/GremlyHelpCard';
import { SweepMultiSplitStep } from '../../components/sweep/SweepMultiSplitStep';
import { SweepSectionTransition } from '../../src/components/sweep/SweepSectionTransition';
import { EntityChatScreen } from '../../components/chat/EntityChatScreen';
import { useOverlayController } from '../../hooks/useOverlayController';
import { useMascotActions } from '../../hooks/useMascotActions';
import celebrationController from '../../app/features/celebration/CelebrationController';
import MascotLottie from '../components/MascotLottie';
import { calculateSweepContribution } from '../../lib/constants/soulDocument';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { OverlayComponent } from '../../components/overlay';
import {
  emitOverlaySaved,
  addOverlaySavedListener,
  type OverlaySavedPayload,
} from '../../lib/events/overlaySaved';
import { emitOverlayClosed, addOverlayClosedListener } from '../../lib/events/overlayClosed';
import { eventBus } from '../../lib/events/EventBus';
// date-fns addDays/nextMonday removed — DateService used for timezone-safe date math
import { maybeAsk } from '../../lib/notifications/ask';
import type { ItemReminder } from '../../lib/types';
import type { AppRecord } from '../../lib/types';

import AgeUpCelebrationModal from '../../components/ritual/AgeUpCelebrationModal';
import { getTierForAge } from '../../lib/constants/soulDocument';
import { SweepIntentionStep } from '../components/sweep/SweepIntentionStep';
import { SweepHubChooser, type HubSectionKey } from '../components/sweep/SweepHubChooser';
import { SweepHabitsCheckInStep } from '../components/sweep/SweepHabitsCheckInStep';
import { SweepEventsStep } from '../components/sweep/SweepEventsStep';
import { selectWrapUp } from '../../lib/store/selectors';

import { SweepEndCard } from '../../components/sweep/SweepEndCard';
import { SweepEndItemList } from '../../components/sweep/SweepEndItemList';
import { ClarificationPopup } from '../../components/minddrop/ClarificationPopup';
import { RelationPopup, type RelationResolution } from '../../components/minddrop/RelationPopup';
import { relationOf } from '../../lib/minddrop/dropRelation';
import { sweepLog } from '../../lib/debug/sweepLogger';
import { quickSweepCards } from '../../lib/sweep/quickSweep';
import { applySweepDecision, type SweepDecision, type SweepRecord } from '../../lib/changes/sweep';
import {
  cardsClosed,
  cardsOpened,
  currentWrap,
  recordDecision as recordWrapDecision,
} from '../../lib/wrapup/session';
import { cardsLeft } from '../../lib/wrapup/state';
import { wrapNow } from '../../lib/wrapup/day';
import { todayThreadParams } from '../../lib/brief/pinned';

// Gremly mascot for summary step
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

// Navigation props - Sweep is now a full-screen card, not a modal
interface Props {
  navigation?: NativeStackNavigationProp<RootStackParamList, 'Sweep'>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step Components
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step Components
 */

export type SweepIntent = 'today' | 'tomorrow' | 'week' | 'skip';

/**
 * The decision cards: items that need a decision (keep, bring back later,
 * let go), one at a time.
 *
 * Opened from today's thread they are tonight's wrap up cards (or the brief's
 * quick sweep) and each decision is saved as it is made. In the week planner
 * they are Sweep's whole list and are saved at the end, as before.
 */

/** How long All sorted stays up before the cards close back to the thread. */
const ALL_SORTED_MS = 900;

interface DecisionStepProps {
  onFinished: (summary: SweepSummary) => void;
  onClose?: () => void;
  sweepIntent?: Exclude<SweepIntent, 'skip'>;
  /**
   * Which cards. all: Sweep's full list (the week). quick: only the cards
   * that need a decision before the day is planned (lib/sweep/quickSweep.ts).
   * wrap: tonight's wrap up, counted from the person's day, without the ones
   * already settled tonight (lib/wrapup).
   */
  cards?: 'all' | 'quick' | 'wrap';
  /**
   * Save each decision as it is made (lib/changes/sweep.ts), so closing part
   * way loses nothing. There is no going back to an earlier card: what was
   * decided is put back with its Undo, from the thread.
   */
  saveEach?: boolean;
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

function SweepDecisionStep({
  onFinished,
  onClose,
  sweepIntent = 'tomorrow',
  cards = 'all',
  saveEach = false,
  onSaved,
}: DecisionStepProps) {
  // Get candidates from unified store selector (single source of truth)
  const allCandidates = useSweepCandidatesUnified();
  const storeIsLoading = useIsLoading();
  const wrapCards = useGremlyStore(selectWrapUp).cards;
  // the quick sweep asks only about what still needs a decision; the wrap up
  // has tonight's cards, without the ones already settled tonight
  const deck = useMemo(() => {
    if (cards === 'quick') return quickSweepCards(allCandidates, getDateService().today());
    if (cards === 'wrap') return cardsLeft(currentWrap(), wrapCards);
    return allCandidates;
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
  const updateTodo = useGremlyStore((state) => state.updateTodo);
  const archiveTodo = useGremlyStore((state) => state.archiveTodo);
  const updateNote = useGremlyStore((state) => state.updateNote);
  const archiveNote = useGremlyStore((state) => state.archiveNote);
  const _updateHabit = useGremlyStore((state) => state.updateHabit);
  const archiveHabit = useGremlyStore((state) => state.archiveHabit);
  const resolveEntityClarification = useGremlyStore((state) => state.resolveEntityClarification);
  const ensureEntityClarification = useGremlyStore((state) => state.ensureEntityClarification);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  // Use store data for overlay lookups
  const todos = useGremlyStore((state) => state.todos);
  const notes = useGremlyStore((state) => state.notes);
  const habits = useGremlyStore((state) => state.habits);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const spaces = useActiveSpaces();
  const overlayController = useOverlayController();

  // Which card is up
  const [currentIndex, setCurrentIndex] = useState(0);

  // Track summary stats for the sweep completion screen
  const [stats, setStats] = useState<SweepSummary>({ kept: 0, cleared: 0 });

  // Track age-up during sweep session
  // Use both state (for UI) and refs (for async callbacks that need latest values)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [didAgeUp, setDidAgeUp] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [finalAge, setFinalAge] = useState(useGremlyStore.getState().gremlyAge);
  const [showHelp, setShowHelp] = useState(false);
  const didAgeUpRef = useRef(false);
  const finalAgeRef = useRef(useGremlyStore.getState().gremlyAge);

  // Helper to update age-up state (both state and refs)
  const updateAgeUpState = useCallback((aged: boolean, newAge: number) => {
    if (aged) {
      sweepLog.debug('[Sweep] Age up! Setting didAgeUp=true, finalAge=', newAge);
      setDidAgeUp(true);
      setFinalAge(newAge);
      didAgeUpRef.current = true;
      finalAgeRef.current = newAge;
    }
  }, []);

  // Track decisions without committing them (allows back navigation)
  // Use both state (for UI re-renders) and ref (for immediate access in async operations)
  const [decisions, setDecisions] = useState<Map<string, SweepDecision>>(new Map());
  const decisionsRef = useRef<Map<string, SweepDecision>>(new Map());
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

  // Week grid commitment counts — reactive over store slices + in-session decisions.
  // decisions Map is SweepDecision (superset of sessionDecisions contract).
  const weekDays = useWeekDays(decisions as Map<string, { dueDateStr?: string; action: string }>);

  // Week board overlay state
  const [showWeekBoard, setShowWeekBoard] = useState(false);
  const reopenWeekBoardRef = useRef(false);

  // Reopen the board when returning from the Calendar screen
  useFocusEffect(
    useCallback(() => {
      if (reopenWeekBoardRef.current) {
        reopenWeekBoardRef.current = false;
        setShowWeekBoard(true);
      }
    }, []),
  );

  // Entity chat state (for chat button on sweep cards)
  const [showEntityChat, setShowEntityChat] = useState(false);
  const [chatPresetHint, setChatPresetHint] = useState<string | undefined>();
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  // Track which section transitions have been shown
  const [shownTransitions, setShownTransitions] = useState<
    Set<'todo' | 'habit' | 'note' | 'event'>
  >(new Set());

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

  // Track item details for summary display
  const itemDetailsRef = useRef<Map<string, { name: string; kind: 'todo' | 'habit' | 'note' }>>(
    new Map(),
  );

  // Helper to record a decision. For the week it is stored and committed at
  // the end; with saveEach it is saved now.
  const recordDecision = useCallback(
    (given: SweepDecision) => {
      // A card that was turned into another kind of item: the decision is
      // about the new item (the old one was put away when it was converted)
      const converted = convertedRef.current;
      const about = converted && converted.originalId === given.candidateId ? converted : null;
      // nothing here is saved on a habit: making it was the decision
      if (about && about.newKind === 'habit') return;
      const decision: SweepDecision = about
        ? { ...given, candidateId: about.newId, candidateKind: about.newKind as 'todo' | 'note' }
        : given;

      if (saveEach) {
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
        return;
      }

      // Update ref immediately (synchronous)
      decisionsRef.current.set(decision.candidateId, decision);
      // Update state for UI (triggers re-render)
      setDecisions((prev) => {
        const next = new Map(prev);
        next.set(decision.candidateId, decision);
        return next;
      });

      // Also store item name for summary display
      const candidate = candidatesWithMeta.find((c) => c.candidate.id === given.candidateId);
      if (candidate) {
        const name =
          candidate.candidate.kind === 'todo'
            ? (candidate.candidate.raw as any).name
            : candidate.candidate.kind === 'habit'
              ? (candidate.candidate.raw as any).name
              : (candidate.candidate.raw as any).title ||
                (candidate.candidate.raw as any).body?.slice(0, 30);
        itemDetailsRef.current.set(decision.candidateId, {
          name: name || 'Untitled',
          kind: decision.candidateKind,
        });
      }
    },
    [candidatesWithMeta, saveEach],
  );

  // Get existing decision for current card
  const currentDecision = useMemo(() => {
    const candidate = candidatesWithMeta[currentIndex]?.candidate;
    return candidate ? decisions.get(candidate.id) : undefined;
  }, [decisions, candidatesWithMeta, currentIndex]);

  // Compute section boundaries for transition cards
  const sectionBoundaries = useMemo(() => {
    const boundaries: {
      type: 'todo' | 'habit' | 'note' | 'event';
      startIndex: number;
      count: number;
    }[] = [];
    let lastKind: string | null = null;
    let currentCount = 0;

    candidatesWithMeta.forEach((item, index) => {
      const effectiveType =
        item.candidate.kind === 'note' && item.meta.noteCardType === 'event'
          ? 'event'
          : item.candidate.kind;
      if (effectiveType !== lastKind) {
        if (lastKind !== null && boundaries.length > 0) {
          boundaries[boundaries.length - 1].count = currentCount;
        }
        boundaries.push({
          type: effectiveType as 'todo' | 'habit' | 'note' | 'event',
          startIndex: index,
          count: 0,
        });
        lastKind = effectiveType;
        currentCount = 1;
      } else {
        currentCount++;
      }
    });

    if (boundaries.length > 0) {
      boundaries[boundaries.length - 1].count = currentCount;
    }

    return boundaries;
  }, [candidatesWithMeta]);

  // Check if current index is at a section boundary needing transition
  const currentTransition = useMemo(() => {
    // the wrap up and the quick sweep go straight from card to card
    if (saveEach) return null;
    const boundary = sectionBoundaries.find((b) => b.startIndex === currentIndex);
    if (boundary && !shownTransitions.has(boundary.type)) {
      return boundary;
    }
    return null;
  }, [currentIndex, sectionBoundaries, shownTransitions, saveEach]);

  // Handler for when user swipes past the transition card
  const handleTransitionContinue = useCallback(() => {
    if (currentTransition) {
      setShownTransitions((prev) => new Set([...prev, currentTransition.type]));
    }
  }, [currentTransition]);

  /**
   * Batch commit all recorded decisions to the database.
   * Called when sweep finishes or user saves and exits.
   * Uses ref instead of state to ensure we have the latest decisions
   * (state updates may not have been applied yet in the same render cycle).
   */
  /**
   * Compute a context-aware default reminder time based on the item's time_window.
   * morning → 09:00, day → 13:00, evening → 18:00, default → 09:00
   */
  function getDefaultReminderTime(timeWindow?: string | null): string {
    switch (timeWindow) {
      case 'morning':
        return '09:00';
      case 'day':
        return '13:00';
      case 'evening':
        return '18:00';
      default:
        return '09:00';
    }
  }

  const commitAllDecisions = useCallback(async () => {
    // saved as they were made: wait for the ones still on their way
    if (saveEach) {
      await Promise.all([...pendingSavesRef.current]);
      return;
    }
    const updates: Promise<void>[] = [];
    let keptCount = 0;
    let clearedCount = 0;

    // Use ref for immediate access to latest decisions
    decisionsRef.current.forEach((decision) => {
      if (decision.action === 'clear') {
        clearedCount++;
        if (decision.candidateKind === 'todo') {
          updates.push(archiveTodo(decision.candidateId, 'swept'));
        } else if (decision.candidateKind === 'note') {
          updates.push(archiveNote(decision.candidateId, 'swept'));
        }
      } else if (decision.action === 'keep') {
        keptCount++;
        if (decision.candidateKind === 'todo' && decision.resurfaceDateStr) {
          // Handle resurface date (remind me later)
          sweepLog.debug('[SweepFlowScreen] Setting resurface_at:', decision.resurfaceDateStr);

          // Look up the original todo to get time_window for context-aware reminder time
          const originalTodo = todos.find((t) => t.id === decision.candidateId);
          const reminderTime = getDefaultReminderTime(originalTodo?.time_window);

          // A reminder on the remind date (the server sends it)
          const reminder: ItemReminder = {
            id: `sweep-remind-${getDateService().now().getTime()}-${decision.candidateId.slice(0, 8)}`,
            time: reminderTime,
            frequency: 'once',
            date: decision.resurfaceDateStr,
          };

          updates.push(
            (async () => {
              // the server sends it; if notifications are off, this is the moment to ask
              void maybeAsk('bell');
              await updateTodo(decision.candidateId, {
                resurface_at: decision.resurfaceDateStr,
                scheduled_date: decision.resurfaceDateStr,
                due_day: decision.resurfaceDateStr,
                due_date: null,
                reminders: [reminder],
              } as any);
            })(),
          );
        } else if (decision.candidateKind === 'todo' && decision.dueDateStr) {
          // Get current reschedule count from store
          const currentTodo = todos.find((t) => t.id === decision.candidateId);
          const currentCount = currentTodo?.sweep_reschedule_count ?? 0;

          if (decision.reminderDateStr) {
            // Due date + reminder: schedule notification and persist both
            const reminderTime = decision.reminderTime || '09:00';

            const reminder: ItemReminder = {
              id: `sweep-remind-${getDateService().now().getTime()}-${decision.candidateId.slice(0, 8)}`,
              time: reminderTime,
              frequency: 'once',
              date: decision.reminderDateStr,
            };

            updates.push(
              (async () => {
                // the server sends it; if notifications are off, this is the moment to ask
                void maybeAsk('bell');
                await updateTodo(decision.candidateId, {
                  scheduled_date: decision.dueDateStr,
                  due_day: decision.dueDateStr,
                  skipped_in_sweep_at: null,
                  resurface_at: null,
                  sweep_reschedule_count: currentCount + 1,
                  reminders: [reminder],
                } as any);
              })(),
            );
          } else {
            // Due date only, no reminder
            updates.push(
              updateTodo(decision.candidateId, {
                scheduled_date: decision.dueDateStr,
                due_day: decision.dueDateStr,
                skipped_in_sweep_at: null,
                resurface_at: null,
                sweep_reschedule_count: currentCount + 1,
              } as any),
            );
          }
        } else if (
          decision.candidateKind === 'todo' &&
          !decision.resurfaceDateStr &&
          !decision.dueDateStr
        ) {
          // Bare keep (e.g. from 'changed' outcome) — just clear skipped flag
          updates.push(
            updateTodo(decision.candidateId, {
              skipped_in_sweep_at: null,
            } as any),
          );
        } else if (decision.candidateKind === 'note') {
          // Check if this is a resurface action
          if (decision.noteAction === 'resurface' && decision.resurfaceDateStr) {
            sweepLog.debug(
              '[SweepFlowScreen] Setting note resurface_at:',
              decision.resurfaceDateStr,
            );

            // Get current resurface_count
            const originalNote = notes.find((n) => n.id === decision.candidateId);
            const currentResurfaceCount = (originalNote as any)?.resurface_count ?? 0;

            // Resurface = NO notification, just set the date for future sweep inclusion
            updates.push(
              updateNote(decision.candidateId, {
                resurface_at: decision.resurfaceDateStr,
                swept_at: getDateService().nowTimestamp(),
                skipped_in_sweep_at: null,
                resurface_count: currentResurfaceCount + 1,
                ...(decision.spaceId ? { space_id: decision.spaceId } : {}),
              } as any),
            );
          } else if (
            decision.noteAction === 'fine' ||
            (!decision.resurfaceDateStr && !decision.reminderDateStr && !decision.prepTodoText)
          ) {
            // "Fine as is" or no special action — mark as swept
            sweepLog.debug('[SweepFlowScreen] Marking note as swept:', decision.candidateId);
            updates.push(
              updateNote(decision.candidateId, {
                swept_at: getDateService().nowTimestamp(),
                skipped_in_sweep_at: null,
                resurface_at: null,
                ...(decision.spaceId ? { space_id: decision.spaceId } : {}),
              } as any),
            );
          } else if (decision.reminderDateStr || decision.prepTodoText) {
            // Event reminder and/or prep todo
            const originalNote = notes.find((n) => n.id === decision.candidateId);

            // Create prep todo if requested
            if (decision.prepTodoText) {
              const userId = useGremlyStore.getState().userId;
              if (userId) {
                updates.push(
                  (async () => {
                    const { data: newTodo } = await supabase
                      .from('todos')
                      .insert({
                        owner_id: userId,
                        name: decision.prepTodoText,
                        title: decision.prepTodoText,
                        body: `Prep for: ${originalNote?.title || ''}`,
                        status: 'active',
                        origin: 'sweep',
                        target_date: originalNote?.target_date || null,
                        due_day: originalNote?.target_date || null,
                        date_confidence: originalNote?.target_date ? 'user_set' : null,
                        linked_event_id: decision.candidateId,
                        energy_type: 'administrative',
                        updated_at: getDateService().nowTimestamp(),
                      })
                      .select()
                      .single();

                    if (newTodo) {
                      useGremlyStore.setState((state) => ({
                        todos: [
                          ...state.todos,
                          { ...newTodo, type: 'todo' as const, reminders: [] },
                        ],
                      }));
                    }
                  })(),
                );
              }
            }

            if (decision.reminderDateStr) {
              // Event reminder — this IS a push notification
              sweepLog.debug('[SweepFlowScreen] Setting event reminder:', decision.reminderDateStr);

              const reminder: ItemReminder = {
                id: `sweep-remind-${getDateService().now().getTime()}-${decision.candidateId.slice(0, 8)}`,
                time: '09:00',
                frequency: 'once',
                date: decision.reminderDateStr,
              };

              updates.push(
                (async () => {
                  // the server sends it; if notifications are off, this is the moment to ask
                  void maybeAsk('bell');
                  await updateNote(decision.candidateId, {
                    swept_at: getDateService().nowTimestamp(),
                    skipped_in_sweep_at: null,
                    reminders: [reminder],
                    ...(decision.spaceId ? { space_id: decision.spaceId } : {}),
                  } as any);
                })(),
              );
            } else {
              // Prep todo only, no reminder — still mark as swept
              updates.push(
                updateNote(decision.candidateId, {
                  swept_at: getDateService().nowTimestamp(),
                  skipped_in_sweep_at: null,
                  ...(decision.spaceId ? { space_id: decision.spaceId } : {}),
                } as any),
              );
            }
          }
        }
      } else if (decision.action === 'skip') {
        // Mark as skipped so it reappears in the next sweep session
        const now = getDateService().nowTimestamp();
        if (decision.candidateKind === 'todo') {
          updates.push(updateTodo(decision.candidateId, { skipped_in_sweep_at: now } as any));
        } else if (decision.candidateKind === 'note') {
          updates.push(updateNote(decision.candidateId, { skipped_in_sweep_at: now } as any));
        }
      }
    });

    try {
      await Promise.all(updates);
      sweepLog.debug('[Sweep] Committed', updates.length, 'decisions');
    } catch (error) {
      sweepLog.error('[Sweep] Error committing decisions:', error);
    }

    return { keptCount, clearedCount };
  }, [archiveTodo, archiveNote, updateTodo, updateNote, saveEach]);

  /**
   * Handle save and exit - commits all decisions before closing.
   */
  const handleSaveAndExit = useCallback(async () => {
    await commitAllDecisions();
    if (onClose) {
      onClose();
    }
  }, [commitAllDecisions, onClose]);

  // The X. With saveEach every decision is already saved, so it waits for the
  // last one and closes; for the week it closes without saving, as before.
  const handleCloseCards = useCallback(async () => {
    if (saveEach) await Promise.all([...pendingSavesRef.current]);
    onClose?.();
  }, [saveEach, onClose]);

  /**
   * Handle completing all cards - commits decisions then calls onFinished.
   */
  const handleAllCardsComplete = useCallback(
    async (summary: SweepSummary) => {
      await commitAllDecisions();
      // a card that could not be saved is back on screen: not finished yet
      if (saveEach && saveFailedRef.current) {
        saveFailedRef.current = false;
        return;
      }
      // the screen closes on this, so it is only said once: All sorted, a
      // moment to read it, then back to the thread
      if (saveEach) {
        if (finishedRef.current) return;
        finishedRef.current = true;
        setAllSorted(true);
        await new Promise((resolve) => setTimeout(resolve, ALL_SORTED_MS));
      }

      // Build detailed items breakdown for summary
      const todos: SweepSummaryItem[] = [];
      const thoughts: SweepSummaryItem[] = [];
      const habits: SweepSummaryItem[] = [];

      decisionsRef.current.forEach((decision, id) => {
        const details = itemDetailsRef.current.get(id);
        if (!details) return;

        let outcome: SweepSummaryItem['outcome'];
        let scheduledDate: string | undefined;

        if (decision.action === 'clear') {
          // Todos = "Cleared", Notes = "Archived"
          outcome = details.kind === 'note' ? 'archived' : 'cleared';
        } else if (decision.action === 'keep') {
          // Helper to format YYYY-MM-DD string for display
          const formatDateStr = (dateStr: string) => getDateService().formatForChip(dateStr);

          if (decision.resurfaceDateStr) {
            outcome = 'remind';
            scheduledDate = formatDateStr(decision.resurfaceDateStr);
          } else if (decision.dueDateStr) {
            outcome = 'scheduled';
            scheduledDate = formatDateStr(decision.dueDateStr);
          } else if (details.kind === 'note') {
            outcome = 'saved';
          } else {
            outcome = 'kept';
          }
        } else {
          // skip or other
          outcome = 'kept';
        }

        const item: SweepSummaryItem = { id, name: details.name, outcome, scheduledDate };

        if (details.kind === 'todo') {
          todos.push(item);
        } else if (details.kind === 'note') {
          thoughts.push(item);
        } else if (details.kind === 'habit') {
          habits.push(item);
        }
      });

      onFinished({
        ...summary,
        items: { todos, thoughts, habits },
        didAgeUp: didAgeUpRef.current,
        finalAge: finalAgeRef.current,
      });
    },
    [commitAllDecisions, onFinished, saveEach],
  );

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
      sweepLog.debug('[SweepFlow] Candidates from store:', {
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
          // Batch: sets skipped_in_sweep_at on commit
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'skip',
          });
          setStats((prev) => ({ ...prev, kept: prev.kept + 1 }));
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'clear': {
          // Batch: archives on commit
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'clear',
          });
          setStats((prev) => ({ ...prev, cleared: prev.cleared + 1 }));
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'changed': {
          // Batch: clears skipped_in_sweep_at on commit
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'keep',
          });
          setStats((prev) => ({ ...prev, kept: prev.kept + 1 }));
          setCurrentIndex((prev) => prev + 1);
          break;
        }

        case 'stay':
          // Do nothing - keep current card visible
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
            '[SweepFlow] Candidate already converted, ignoring duplicate:',
            converting.sourceId,
          );
          convertingCandidateRef.current = null;
          return;
        }

        sweepLog.debug(
          `[SweepFlow] ${converting.sourceKind} converted to ${converting.targetType} (in-place):`,
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
        // Clear the editing ref but DON'T advance - this is "peek and close"
        editingCandidateIdRef.current = null;
      }
    });

    return () => {
      unsubscribeSaved();
      unsubscribeClosed();
    };
  }, []); // Empty deps - uses refs to avoid re-subscribing

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
        sweepLog.debug('[SweepFlow] Clarification bucket change detected:', {
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
  // Card Action Handlers (record decisions, don't commit immediately)
  // ─────────────────────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    // Increment sweep count for ritual progress
    useGremlyStore
      .getState()
      .incrementSweepCount()
      .then(({ didAgeUp: aged, newAge }) => {
        updateAgeUpState(aged, newAge);
      })
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

    // Update stats
    const newStats = { ...stats, kept: stats.kept + 1 };
    setStats(newStats);

    // Move to next card (or finish if last)
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete(newStats);
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete]);

  const handleClear = useCallback(() => {
    // Increment sweep count for ritual progress
    useGremlyStore
      .getState()
      .incrementSweepCount()
      .then(({ didAgeUp: aged, newAge }) => {
        updateAgeUpState(aged, newAge);
      })
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

    // Update stats
    const newStats = { ...stats, cleared: stats.cleared + 1 };
    setStats(newStats);

    // Move to next card
    if (currentIndex < candidatesWithMeta.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleAllCardsComplete(newStats);
    }
  }, [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete]);

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
      sweepLog.warn('[SweepDecisionStep] handleOpenEdit: record not found in store, using raw');
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
      sweepLog.debug('[SweepFlow] Candidate already converted, ignoring:', candidate.id);
      return;
    }

    // Prevent re-triggering while conversion is in progress
    if (convertingCandidateRef.current?.sourceId === candidate.id) {
      sweepLog.debug('[SweepFlow] Conversion already in progress for:', candidate.id);
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
        if (saveEach && candidate.kind !== 'habit') {
          // saved with its Undo, and shown on the receipt as let go
          recordDecision({
            candidateId: candidate.id,
            candidateKind: candidate.kind as 'todo' | 'note',
            action: 'clear',
            archiveReason: 'user_deleted',
          });
        } else if (candidate.kind === 'todo') {
          archiveTodo(candidate.id, 'user_deleted');
        } else if (candidate.kind === 'note') {
          archiveNote(candidate.id, 'user_deleted');
        } else if (candidate.kind === 'habit') {
          archiveHabit(candidate.id, 'user_deleted');
        }
        const newStats = { ...stats, cleared: stats.cleared + 1 };
        setStats(newStats);
        if (currentIndex < candidatesWithMeta.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          handleAllCardsComplete(newStats);
        }
        return;
      }

      // If target type is the same as current, do nothing
      if (candidate.kind === targetType) return;

      // Prevent duplicate conversions
      if (convertedCandidatesRef.current.has(candidate.id)) {
        sweepLog.debug('[SweepFlow] Candidate already converted, ignoring:', candidate.id);
        return;
      }

      // Prevent re-triggering while conversion is in progress
      if (convertingCandidateRef.current?.sourceId === candidate.id) {
        sweepLog.debug('[SweepFlow] Conversion already in progress for:', candidate.id);
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
      archiveTodo,
      archiveNote,
      archiveHabit,
      overlayController,
      stats,
      handleAllCardsComplete,
      saveEach,
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
        sweepLog.debug('[SweepFlow] Updated event date to:', newDateStr);
      } catch (error) {
        sweepLog.error('[SweepFlow] Failed to update event date:', error);
      }
    },
    [candidatesWithMeta, currentIndex, updateNote],
  );

  /**
   * Handle confirmed quick date (user selected + swiped right)
   * Records decision with calculated date - actual save happens in batch commit
   */
  const handleConfirmQuickDate = useCallback(
    (option: 'tomorrow' | 'nextweek') => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      // Only works for todos and notes (not habits)
      if (candidate.kind === 'habit') return;

      // Calculate the target date using DateService (timezone-safe string math)
      const ds = getDateService();
      let targetDateStr: string;
      switch (option) {
        // counted from the person's day, which after midnight is still yesterday
        case 'tomorrow':
          targetDateStr = ds.addDays(ds.ritualDay(), 1);
          break;
        case 'nextweek':
          targetDateStr = ds.toLocalDate(
            ds.getNextWeekday(1, ds.fromLocalDate(ds.ritualDay()) ?? undefined),
          ); // Monday=1
          break;
      }

      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind as 'todo' | 'note',
        action: 'keep',
        dueDateStr: targetDateStr,
      });

      // Update stats and move to next card
      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Handle confirmed remind later (user picked resurface date + swiped right)
   * Records decision with resurface date - item will reappear in sweep on that date
   */
  const handleConfirmRemindLater = useCallback(
    (resurfaceDate: Date) => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      // Only works for todos and notes (not habits)
      if (candidate.kind === 'habit') return;

      const ds = getDateService();
      const resurfaceDateStr = ds.toLocalDate(resurfaceDate);
      sweepLog.debug('[SweepFlowScreen] Recording remind later decision:', {
        id: candidate.id,
        kind: candidate.kind,
        resurfaceDateStr,
      });

      // Record decision with resurface date (not due date)
      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind as 'todo' | 'note',
        action: 'keep',
        resurfaceDateStr,
      });

      // Update stats and move to next card
      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Handle confirmed note action (fine / resurface / event reminder)
   * Called by SweepCardNew on swipe right for notes — bundles noteAction, dates, and spaceId.
   */
  const handleConfirmNoteAction = useCallback(
    (action: {
      noteAction: 'fine' | 'resurface';
      resurfaceDateStr?: string;
      reminderDateStr?: string;
      spaceId?: string;
      resurfaceTiming?: 'nextweek' | '2weeks' | 'pick';
      eventReminder?: 'daybefore' | 'weekbefore' | 'custom';
    }) => {
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
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
        spaceId: action.spaceId,
        resurfaceTiming: action.resurfaceTiming,
        eventReminder: action.eventReminder,
      });

      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Handle confirmed todo action (due date + optional reminder in a single decision)
   */
  const handleConfirmTodoAction = useCallback(
    (action: { dueDateStr?: string; reminderDateStr?: string; reminderTime?: string }) => {
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      recordDecision({
        candidateId: candidate.id,
        candidateKind: 'todo',
        action: 'keep',
        dueDateStr: action.dueDateStr,
        reminderDateStr: action.reminderDateStr,
        reminderTime: action.reminderTime,
      });

      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [
      candidatesWithMeta,
      currentIndex,
      recordDecision,
      stats,
      handleAllCardsComplete,
      updateAgeUpState,
    ],
  );

  const handleConfirmEventAction = useCallback(
    (action: {
      reminderDateStr: string;
      reminderTime?: string;
      spaceId?: string;
      eventReminder?: 'daybefore' | 'weekbefore' | 'custom';
      prepTodoText?: string;
    }) => {
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
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
        spaceId: action.spaceId,
        eventReminder: action.eventReminder,
        prepTodoText: action.prepTodoText,
      });

      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [
      candidatesWithMeta,
      currentIndex,
      recordDecision,
      stats,
      handleAllCardsComplete,
      updateAgeUpState,
    ],
  );

  /**
   * Handle confirmed custom date (user picked date in date picker + swiped right)
   * Records decision with custom date - actual save happens in batch commit
   */
  const handleConfirmCustomDate = useCallback(
    (date: Date) => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const { candidate } = candidateWithMeta;

      // Only works for todos and notes (not habits)
      if (candidate.kind === 'habit') return;

      const ds = getDateService();
      recordDecision({
        candidateId: candidate.id,
        candidateKind: candidate.kind as 'todo' | 'note',
        action: 'keep',
        dueDateStr: ds.toLocalDate(date),
      });

      // Update stats and move to next card
      const newStats = { ...stats, kept: stats.kept + 1 };
      setStats(newStats);

      if (currentIndex < candidatesWithMeta.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        handleAllCardsComplete(newStats);
      }
    },
    [candidatesWithMeta, currentIndex, recordDecision, stats, handleAllCardsComplete],
  );

  /**
   * Add to Space Handler - Assigns item to selected space and moves to next card
   * Used for logs that user wants to organize into a Space
   */
  const handleAddToSpace = useCallback(
    async (spaceId: string) => {
      // Increment sweep count for ritual progress
      useGremlyStore
        .getState()
        .incrementSweepCount()
        .then(({ didAgeUp: aged, newAge }) => {
          updateAgeUpState(aged, newAge);
        })
        .catch((err) => {
          sweepLog.warn('[Sweep] Failed to increment sweep count:', err);
        });

      const candidateWithMeta = candidatesWithMeta[currentIndex];
      if (!candidateWithMeta) return;
      const candidate = candidateWithMeta.candidate;

      sweepLog.debug('[SweepFlow] Adding to space:', candidate.id, 'space:', spaceId);

      try {
        // Update the item with the space_id
        if (candidate.kind === 'note') {
          await updateNote(candidate.id, {
            space_id: spaceId,
            swept_at: getDateService().nowTimestamp(),
            skipped_in_sweep_at: null,
            resurface_at: null, // Clear any old resurface date
          } as any);
        } else if (candidate.kind === 'todo') {
          await updateTodo(candidate.id, { space_id: spaceId });
        }

        // Record decision
        recordDecision({
          candidateId: candidate.id,
          candidateKind: candidate.kind as 'todo' | 'note',
          action: 'keep',
        });

        // Update stats
        const newStats = { ...stats, kept: stats.kept + 1 };
        setStats(newStats);

        // Move to next card (or finish if last)
        if (currentIndex < candidatesWithMeta.length - 1) {
          setCurrentIndex(currentIndex + 1);
        } else {
          handleAllCardsComplete(newStats);
        }
      } catch (error) {
        sweepLog.error('[SweepFlow] Failed to add to space:', error);
      }
    },
    [
      candidatesWithMeta,
      currentIndex,
      updateNote,
      updateTodo,
      recordDecision,
      stats,
      handleAllCardsComplete,
    ],
  );

  /**
   * Go Back Handler - Navigate to previous card
   * Allows user to review/change previous decisions
   */
  const handleGoBackCard = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  /**
   * Open Entity Chat Handler - Opens chat modal for current card
   */
  const handleOpenChat = useCallback((presetHint?: string) => {
    setChatPresetHint(presetHint);
    setShowEntityChat(true);
  }, []);

  /**
   * Clarification Selection Handler - User picks an option to clarify ambiguous item
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
        // Still close popup on error - user can retry via edit
        setShowClarification(false);
      } finally {
        setIsSubmittingClarification(false);
      }
    },
    [candidatesWithMeta, currentIndex, resolveEntityClarification],
  );

  /**
   * Clarification Skip Handler - User skips clarification, proceeds with card as-is
   */
  const handleClarificationSkip = useCallback(() => {
    // User skips - close popup, proceed with card as-is
    setShowClarification(false);
  }, []);

  // A held drop on the current card asks "is this one you already have?",
  // like a question or a split. The candidates are a snapshot, so what was
  // asked is tracked here rather than read back from the card.
  const relationCandidate = candidatesWithMeta[currentIndex]?.candidate;
  const relationHeld =
    relationCandidate?.kind === 'note' ? relationOf(relationCandidate.raw?.views) : null;
  const relationNoteId =
    relationCandidate &&
    relationHeld?.status === 'pending' &&
    !relationHandledIds.has(relationCandidate.id)
      ? relationCandidate.id
      : null;

  const markRelationHandled = useCallback((id: string | null) => {
    if (!id) return;
    setRelationHandledIds((prev) => new Set(prev).add(id));
  }, []);

  const handleRelationResolved = useCallback(
    (outcome: RelationResolution, targetId?: string) => {
      markRelationHandled(relationNoteId);
      if (outcome === 'applied') {
        // Sweep saves its decisions at the end; an earlier one on the item
        // just changed would undo what the user said yes to
        if (targetId) decisionsRef.current.delete(targetId);
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

  // Auto-advance to summary when all cards are processed (fallback)
  useEffect(() => {
    if (!isLoading && candidatesWithMeta.length > 0 && currentIndex >= candidatesWithMeta.length) {
      // All cards processed - auto-finish to show summary
      // This is a fallback - normally last card handler calls handleAllCardsComplete
      handleAllCardsComplete(stats);
    }
  }, [isLoading, candidatesWithMeta.length, currentIndex, stats, handleAllCardsComplete]);

  // Build effective candidate - if this card was converted, use the new entity data
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
      spaces,
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
          const newMeta = computeSweepCardMeta(convertedTodoCandidate, spaces);
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
          const newMeta = computeSweepCardMeta(convertedHabitCandidate, spaces);
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
          const newMeta = computeSweepCardMeta(convertedNoteCandidate, spaces);
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
  }, [
    currentIndex,
    candidatesWithMeta,
    convertedCandidate,
    todos,
    habits,
    notes,
    spaces,
    allCandidates,
  ]);

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

  // Empty state - nothing to sweep
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
          <Button
            title="Done"
            variant="primary"
            onPress={() => onFinished({ kept: 0, cleared: 0 })}
          />
        </View>
      </View>
    );
  }

  // All cards processed - show brief transition (auto-advances via useEffect above)
  if (currentIndex >= candidatesWithMeta.length || allSorted) {
    if (saveEach) {
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
    return (
      <View style={styles.stepContainer}>
        <View style={styles.decisionLoadingContainer}>
          <ActivityIndicator size="large" color={BRAND.colors.mossGreen} />
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

  // Check if current candidate needs clarification before showing sweep actions
  // Clarification data is stored in views (from the AI classification pipeline)
  const candidateViews = currentCandidate?.raw?.views as Record<string, any> | undefined;
  const rawAny = currentCandidate?.raw as Record<string, any> | undefined;
  const needsClarification =
    candidateViews?.needs_clarification === true || rawAny?.needs_clarification === true;
  const candidateClarificationQuestion = candidateViews?.clarification_question as
    | string
    | undefined;
  const candidateClarificationOptions = candidateViews?.clarification_options as
    | Array<{ id: string; label: string }>
    | undefined;

  return (
    <View style={styles.decisionStepContainer}>
      {/* Decision Step Header - Back on left, Close on right */}
      <View style={styles.decisionHeader}>
        {/* Back button - only show if not on first card */}
        {currentIndex > 0 && !saveEach ? (
          <TouchableOpacity
            style={styles.decisionBackButton}
            onPress={handleGoBackCard}
            activeOpacity={0.7}
            accessibilityLabel="Go back to previous card"
            accessibilityRole="button"
          >
            <Icon name="ChevronLeft" size="sm" color={BRAND.colors.mossGreen} />
            <Text style={styles.decisionBackText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.decisionHeaderSpacer} />
        )}

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
            {saveEach
              ? `${currentIndex + 1} of ${candidatesWithMeta.length}`
              : `${currentIndex + 1} of ${candidatesWithMeta.length} items`}
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
        {!currentTransition && (
          <>
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
              onConfirmQuickDate={handleConfirmQuickDate}
              onConfirmRemindLater={handleConfirmRemindLater}
              onConfirmCustomDate={handleConfirmCustomDate}
              onConfirmTodoAction={handleConfirmTodoAction}
              onConfirmEventAction={handleConfirmEventAction}
              onAddToSpace={handleAddToSpace}
              onConfirmNoteAction={handleConfirmNoteAction}
              onClose={handleCloseCards}
              onGoBack={currentIndex > 0 && !saveEach ? handleGoBackCard : undefined}
              previousDecision={saveEach ? undefined : currentDecision}
              onOpenChat={handleOpenChat}
              onShowHelp={() => setShowHelp(true)}
              onConvertToType={handleConvertToType}
              onUpdateEventDate={handleUpdateEventDate}
              onRequestPhotoPreview={setPhotoPreviewUrl}
              sweepIntent={sweepIntent}
              weekDays={sweepIntent === 'week' ? weekDays : undefined}
              onSeeMyWeek={sweepIntent === 'week' ? () => setShowWeekBoard(true) : undefined}
            />

            {/* Clarification Popup - shown when current card needs clarification */}
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

            {/* "Is this one you already have?" - shown when the current card is a held drop */}
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
          </>
        )}
      </View>

      {/* Bottom section - Save and exit */}
      {!currentTransition && (
        <View style={styles.bottomSection}>
          {/* Save and exit; with saveEach, how many are saved already */}
          {saveEach ? (
            savedCount > 0 ? (
              <View style={styles.savedSoFar} testID="sweep-cards-saved">
                <Icon name="Check" size="xs" color={BRAND.colors.mossGreen} strokeWidth={2.5} />
                <Text style={styles.savedSoFarText}>{savedCount} saved so far</Text>
              </View>
            ) : null
          ) : (
            onClose && (
              <TouchableOpacity onPress={handleSaveAndExit} style={styles.saveExitButton}>
                <Text style={styles.saveExitText}>Need a break? Save and exit</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      )}

      {/* Section Transition Modal */}
      <Modal visible={!!currentTransition} animationType="fade" statusBarTranslucent={true}>
        <SweepSectionTransition
          sectionType={currentTransition?.type || 'todo'}
          itemCount={currentTransition?.count || 0}
          onContinue={handleTransitionContinue}
          onClose={onClose}
          sweepIntent={sweepIntent}
        />
      </Modal>

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

      {/* Week board overlay */}
      <WeekBoardOverlay
        visible={showWeekBoard}
        days={weekDays}
        onClose={() => setShowWeekBoard(false)}
        onOpenCalendarForDay={(date) => {
          reopenWeekBoardRef.current = true;
          setShowWeekBoard(false);
          navigation.navigate('CalendarScreen', { initialDate: date });
        }}
        onConfirmMove={(itemId, targetDay) => {
          recordDecision({
            candidateId: itemId,
            candidateKind: 'todo',
            action: 'keep',
            dueDateStr: targetDay,
          });
        }}
      />

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
            <Image
              source={{ uri: photoPreviewUrl }}
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

/**
 * Step 3: Summary/Celebration
 *
 * Shows the user a calm summary of their sweep session.
 * Displays counts of items kept and cleared.
 * Non-gamified, gentle "you did it" feel.
 */
interface SummaryStepProps {
  keptCount: number;
  clearedCount: number;
  items?: {
    todos: SweepSummaryItem[];
    thoughts: SweepSummaryItem[];
    habits: SweepSummaryItem[];
  };
  gremlyAge: number;
  onDone: () => void;
  onPlanTomorrow: () => void;
  onNavigateBack: () => void;
}

function SweepSummaryStep({
  keptCount,
  clearedCount,
  items,
  onDone,
  onPlanTomorrow,
  onNavigateBack,
}: SummaryStepProps) {
  const ds = getDateService();
  const totalProcessed = keptCount + clearedCount;

  // Two-page state
  const [page, setPage] = useState<1 | 2>(1);

  // Store subscriptions
  const feedingGaugeValue = useGremlyStore((s) => s.feedingGaugeValue);
  const isFedToday = useGremlyStore((s) => s.isFedToday);
  const sweepStreak = useGremlyStore((state) => state.sweepStreak);
  const gremlyAge = useGremlyStore((s) => s.gremlyAge);
  const fedDaysCount = useGremlyStore((s) => s.fedDaysCount);

  const { celebrate, celebrateFed } = useMascotActions();

  // Capture pre-sweep gauge value on mount (before any preview)
  const preSweepGaugeRef = useRef(feedingGaugeValue);

  // Calculate projected contribution for display
  const sweepContribution = useMemo(() => {
    return calculateSweepContribution(totalProcessed, false);
  }, [totalProcessed]);

  const projectedPercent = Math.min(
    Math.round((preSweepGaugeRef.current + sweepContribution) * 100),
    100,
  );
  const preSweepPercent = Math.round(preSweepGaugeRef.current * 100);
  const contributionPercent = Math.round(sweepContribution * 100);
  const willCrossFed =
    preSweepGaugeRef.current < 1.0 && preSweepGaugeRef.current + sweepContribution >= 1.0;

  // Display-adjusted fed days: if isFedToday is true but fedDaysCount
  // hasn't caught up from the server yet, ensure at least 1 shows.
  // Also account for sweep optimistic crossing during this session.
  const displayFedDays = useMemo(() => {
    if (willCrossFed) {
      return fedDaysCount + 1;
    }
    if (isFedToday) {
      return Math.max(fedDaysCount, 1);
    }
    return fedDaysCount;
  }, [fedDaysCount, isFedToday, willCrossFed]);

  // Tomorrow data (same as before)
  const allTodos = useGremlyStore((state) => state.todos);
  const allHabits = useGremlyStore((state) => state.habits);
  const tomorrowTodos = useMemo(() => {
    const tomorrowStr = ds.tomorrow();
    return allTodos.filter((t) => !t.archived && !t.completed_at && t.due_day === tomorrowStr);
  }, [allTodos]);
  const tomorrowHabits = useMemo(() => {
    return allHabits.filter((h) => !h.archived);
  }, [allHabits]);
  const hasTomorrow = tomorrowTodos.length > 0 || tomorrowHabits.length > 0;
  const tomorrowSubtitle = useMemo(
    () =>
      [
        tomorrowTodos.length > 0
          ? `${tomorrowTodos.length} ${tomorrowTodos.length === 1 ? 'todo' : 'todos'}`
          : null,
        tomorrowHabits.length > 0
          ? `${tomorrowHabits.length} ${tomorrowHabits.length === 1 ? 'habit' : 'habits'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    [tomorrowTodos, tomorrowHabits],
  );

  // ─── ANIMATIONS ───

  // Broom mascot position
  const broomX = useSharedValue(-200); // Start off screen left
  const broomOpacity = useSharedValue(0);
  const hoverY = useSharedValue(0);

  // MascotLottie (page 2)
  const lottieOpacity = useSharedValue(0);
  const lottieScale = useSharedValue(0.8);

  // Title
  const glowOpacity = useSharedValue(0);
  const titleAnimatedStyle = useAnimatedStyle(() => ({
    textShadowColor: `rgba(46, 85, 64, ${glowOpacity.value})`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: interpolate(glowOpacity.value, [0, 0.8], [0, 20]),
  }));

  const broomAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: broomX.value }, { translateY: hoverY.value }],
    opacity: broomOpacity.value,
  }));

  const lottieAnimatedStyle = useAnimatedStyle(() => ({
    opacity: lottieOpacity.value,
    transform: [{ scale: lottieScale.value }],
  }));

  // Page 1 mount: broom flies in from left, starts hovering
  useEffect(() => {
    if (page !== 1) return;

    Vibration.vibrate([0, 100, 50, 100, 50, 200], false);

    // Fly in from left
    broomOpacity.value = withTiming(1, { duration: 300 });
    broomX.value = withTiming(0, {
      duration: 900,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });

    // Start hover after fly-in completes
    const hoverTimer = setTimeout(() => {
      // eslint-disable-next-line react-hooks/immutability
      hoverY.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 1200, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
          withTiming(0, { duration: 1200, easing: ReanimatedEasing.inOut(ReanimatedEasing.ease) }),
        ),
        -1,
        true,
      );
    }, 900);

    // Title glow
    glowOpacity.value = withDelay(
      300,
      withSequence(
        withTiming(0.8, { duration: 600, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
        withDelay(
          2000,
          withTiming(0, { duration: 800, easing: ReanimatedEasing.in(ReanimatedEasing.cubic) }),
        ),
      ),
    );

    return () => clearTimeout(hoverTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/immutability
  }, [page]);

  // Handle Continue tap: transition to page 2
  const handleContinue = useCallback(() => {
    // Fly broom out to the right
    // eslint-disable-next-line react-hooks/immutability
    broomX.value = withTiming(400, {
      duration: 500,
      easing: ReanimatedEasing.in(ReanimatedEasing.cubic),
    });
    // eslint-disable-next-line react-hooks/immutability
    broomOpacity.value = withTiming(0, { duration: 400 });

    // After broom exits, switch to page 2
    setTimeout(() => {
      setPage(2);
    }, 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/immutability
  }, []);

  // Page 2 mount: fade in MascotLottie, then animate gauge after a beat
  useEffect(() => {
    if (page !== 2) return;

    // Fade in the MascotLottie
    lottieOpacity.value = withDelay(
      200,
      withTiming(1, { duration: 500, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
    );
    lottieScale.value = withDelay(
      200,
      withTiming(1, { duration: 500, easing: ReanimatedEasing.out(ReanimatedEasing.cubic) }),
    );

    // After a beat (1.2s), fire the optimistic gauge preview
    // This updates the store, MascotLottie reacts and shows the fill rising
    const timer = setTimeout(() => {
      const { justCrossedFed } = useGremlyStore.getState().previewSweepGauge(totalProcessed, false);

      // Trigger the correct Lottie animation
      if (justCrossedFed) {
        celebrateFed();
      } else {
        celebrate();
      }

      if (justCrossedFed) {
        const nextFedDay = useGremlyStore.getState().fedDaysCount + 1;

        // Show fed toast after gauge animation completes.
        // Age-up celebrations are handled by the store when the
        // server confirms via update_gauge_atomic.
        setTimeout(() => {
          celebrationController.showFedCelebration(nextFedDay);
          useGremlyStore.setState({
            todayFedCelebrationShownAt: getDateService().nowTimestamp(),
          });
        }, 1200);
      }
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/immutability
  }, [page, totalProcessed]);

  // Handle Done: fire server reconciliation, navigate
  const handleDone = useCallback(() => {
    // Fire completeSweepSession for server reconciliation (non-blocking)
    if (totalProcessed > 0) {
      useGremlyStore
        .getState()
        .completeSweepSession(totalProcessed, false)
        .catch((err: unknown) => {
          sweepLog.warn('[SweepFlowScreen] Sweep gauge reconciliation failed:', err);
        });
    }
    // Navigate back directly, bypassing old age-up check
    onNavigateBack();
  }, [totalProcessed, onNavigateBack]);

  // ─── PAGE 1: SWEEP STATS ───
  if (page === 1) {
    return (
      <View style={styles.summaryContainer}>
        <ScrollView
          contentContainerStyle={styles.summaryScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Broom Gremly - flies in from left, hovers */}
          <View style={styles.summaryMascotContainer}>
            <Reanimated.Image
              source={GREMLY_MASCOT_CELEBRATE}
              style={[styles.summaryMascotImage, broomAnimatedStyle]}
              resizeMode="contain"
              testID="sweep-summary-mascot"
              accessibilityLabel="Gremly mascot riding a broom"
            />
          </View>

          {/* Title */}
          <Reanimated.Text
            entering={FadeInUp.duration(400).delay(100).springify().damping(12)}
            style={[styles.summaryTitle, styles.summaryTitleText, titleAnimatedStyle]}
          >
            Nice sweep!
          </Reanimated.Text>

          {/* Subtext */}
          {totalProcessed > 0 && (
            <Text style={styles.summarySubtext}>
              Your mind is {totalProcessed} {totalProcessed === 1 ? 'item' : 'items'} lighter.
            </Text>
          )}

          {/* Expandable Summary */}
          {totalProcessed > 0 && items ? (
            <View style={styles.expandableSummaryContainer}>
              {(() => {
                const sortedTodos = items.todos.filter(
                  (i) => i.outcome !== 'cleared' && i.outcome !== 'archived',
                );
                const sortedThoughts = items.thoughts.filter((i) => i.outcome !== 'archived');
                const sortedHabits = items.habits.filter((i) => i.outcome !== 'removed');
                const clearedTodos = items.todos.filter(
                  (i) => i.outcome === 'cleared' || i.outcome === 'archived',
                );
                const clearedThoughts = items.thoughts.filter((i) => i.outcome === 'archived');
                const clearedHabits = items.habits.filter((i) => i.outcome === 'removed');

                const sortedCount =
                  sortedTodos.length + sortedThoughts.length + sortedHabits.length;
                const clearedItemCount =
                  clearedTodos.length + clearedThoughts.length + clearedHabits.length;

                return (
                  <>
                    {sortedCount > 0 && (
                      <SweepEndCard
                        icon={<CheckCircle size={20} color={BRAND.colors.mossGreen} />}
                        title={`${sortedCount} ${sortedCount === 1 ? 'item' : 'items'} sorted`}
                        expandable={true}
                      >
                        <SweepEndItemList
                          todos={sortedTodos.map((i) => ({
                            id: i.id,
                            name: i.name,
                            outcome: i.scheduledDate ? `Due ${i.scheduledDate}` : 'Saved',
                          }))}
                          notes={sortedThoughts.map((i) => ({
                            id: i.id,
                            name: i.name,
                            outcome: i.scheduledDate ? `Remind ${i.scheduledDate}` : 'Saved',
                          }))}
                          habits={sortedHabits.map((i) => ({
                            id: i.id,
                            name: i.name,
                            outcome:
                              i.outcome === 'logged'
                                ? 'Done ✓'
                                : i.outcome === 'skipped'
                                  ? 'Skipped'
                                  : 'Kept',
                          }))}
                        />
                      </SweepEndCard>
                    )}
                    {clearedItemCount > 0 && (
                      <SweepEndCard
                        icon={<Sparkles size={20} color={BRAND.colors.goldenPear} />}
                        title={`${clearedItemCount} ${clearedItemCount === 1 ? 'thing' : 'things'} let go`}
                        expandable={true}
                      >
                        <SweepEndItemList
                          clearedItems={[
                            ...clearedTodos.map((i) => ({
                              id: i.id,
                              name: i.name,
                              type: 'todo' as const,
                            })),
                            ...clearedThoughts.map((i) => ({
                              id: i.id,
                              name: i.name,
                              type: 'note' as const,
                            })),
                            ...clearedHabits.map((i) => ({
                              id: i.id,
                              name: i.name,
                              type: 'habit' as const,
                            })),
                          ]}
                        />
                      </SweepEndCard>
                    )}
                  </>
                );
              })()}
            </View>
          ) : (
            <View style={styles.summaryEmptyContainer}>
              <Text variant="body" style={styles.summaryEmptyText}>
                Nothing needed your attention this time — you're all clear.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Streak display - page 1 */}
        {sweepStreak >= 1 && (
          <View style={styles.streakContainer}>
            <Flame size={16} color={BRAND.colors.goldenPear} />
            <Text style={styles.streakText}>{sweepStreak} day streak</Text>
          </View>
        )}

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <Button title="Continue" variant="primary" onPress={handleContinue} />
        </View>
      </View>
    );
  }

  // ─── PAGE 2: GAUGE REVEAL ───
  return (
    <View style={styles.summaryContainer}>
      <ScrollView
        contentContainerStyle={[styles.summaryScrollContent, { alignItems: 'center' }]}
        showsVerticalScrollIndicator={false}
      >
        <Reanimated.View entering={FadeIn.duration(500).delay(200)} style={styles.gaugeRevealCard}>
          {/* MascotLottie */}
          <View style={styles.gaugeRevealMascotContainer}>
            <Reanimated.View style={lottieAnimatedStyle}>
              <MascotLottie />
            </Reanimated.View>
          </View>

          {/* Thin divider */}
          <View style={styles.gaugeRevealDivider} />

          {/* Age + fed days */}
          <Reanimated.View
            entering={FadeIn.duration(400).delay(1600)}
            style={styles.gaugeRevealAgeContainer}
          >
            <Text style={styles.gaugeRevealAge}>Age {gremlyAge}</Text>
            <View style={styles.gaugeRevealFedDots}>
              {[1, 2, 3].map((day) => (
                <View
                  key={day}
                  style={[
                    styles.gaugeRevealDot,
                    day <= displayFedDays
                      ? styles.gaugeRevealDotFilled
                      : styles.gaugeRevealDotEmpty,
                  ]}
                />
              ))}
              <Text style={styles.gaugeRevealFedText}>{displayFedDays} of 3 fed days</Text>
            </View>
          </Reanimated.View>

          {/* Gauge progress bar */}
          <Reanimated.View
            entering={FadeIn.duration(400).delay(1800)}
            style={styles.gaugeRevealBarContainer}
          >
            <View style={styles.gaugeRevealBarTrack}>
              <Reanimated.View
                style={[
                  styles.gaugeRevealBarFill,
                  { width: `${Math.min(Math.round(feedingGaugeValue * 100), 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.gaugeRevealBarLabel}>
              {Math.min(Math.round(feedingGaugeValue * 100), 100)}% fed
            </Text>
          </Reanimated.View>

          {/* Impact text */}
          <Reanimated.View
            entering={FadeIn.duration(400).delay(2000)}
            style={styles.gaugeRevealTextContainer}
          >
            {willCrossFed || isFedToday ? (
              <Text style={styles.gaugeRevealImpact}>Gremly is fed for today!</Text>
            ) : (
              <Text style={styles.gaugeRevealImpact}>
                This sweep added {contributionPercent}%.
                {projectedPercent >= 60 ? ' Almost there.' : ''}
              </Text>
            )}
          </Reanimated.View>
        </Reanimated.View>
      </ScrollView>

      {/* Plan Tomorrow CTA with stats underneath */}
      <Reanimated.View entering={FadeIn.duration(300).delay(2400)}>
        <View style={styles.gaugeRevealPlanSection}>
          <Pressable style={styles.planTomorrowButton} onPress={onPlanTomorrow}>
            <Text style={styles.planTomorrowText}>Plan your tomorrow →</Text>
          </Pressable>
          {hasTomorrow && <Text style={styles.gaugeRevealTomorrowStats}>{tomorrowSubtitle}</Text>}
        </View>
      </Reanimated.View>

      {/* Done Button - page 2 */}
      <Reanimated.View entering={FadeIn.duration(300).delay(2400)}>
        <View style={styles.buttonContainer}>
          <Button title="Done" variant="primary" onPress={handleDone} />
        </View>
      </Reanimated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SweepFlowScreen - Main container for the Evening Sweep wizard
 *
 * Manages step state and renders the appropriate step component.
 * Steps:
 * - 0: Mood check-in
 * - 1: Wrap up today
 * - 2: Decision cards
 * - 3: Summary/celebration
 */
export default function SweepFlowScreen({ navigation: navProp }: Props) {
  // Use hook for navigation to ensure we always have access
  const navigationHook = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const navigation = navProp || navigationHook;

  const route = useRoute<RouteProp<RootStackParamList, 'Sweep'>>();
  const demoMode = route.params?.demoMode === true;
  // The cards on their own, opened from today's thread: tonight's wrap up, or
  // the brief's quick sweep in the morning. Only the decision cards (and
  // splitting a drop with several things in it), each decision saved as it is
  // made, then straight back to the thread.
  const cardsMode: 'wrap' | 'quick' | null = route.params?.cards ?? null;
  const quick = cardsMode !== null;
  useEffect(() => {
    if (cardsMode !== 'wrap') return undefined;
    cardsOpened();
    return () => cardsClosed();
  }, [cardsMode]);

  const { user } = useAuth();
  const demoSweepCompletedAt = useGremlyStore((s) => s.demoSweepCompletedAt);
  const canCreate = useCanCreate();

  // Suppress the global age-up modal while sweep screen is active.
  // The sweep has its own local AgeUpCelebrationModal shown post-summary.
  useEffect(() => {
    celebrationController.suppressAgeUpCelebration(true);
    return () => celebrationController.suppressAgeUpCelebration(false);
  }, []);

  // This screen is two things now. Opened with cards, it is the decision
  // cards on their own, from today's thread. Opened with week, it is the week
  // planner (Plan my week), which starts on its chooser. The evening Sweep
  // itself is the wrap up in today's thread (lib/wrapup): anything that still
  // opens this screen with neither is sent there.
  const weekEntry = route.params?.week === true;
  const evening = !quick && !weekEntry && !demoMode;
  useEffect(() => {
    if (!evening || !demoSweepCompletedAt) return;
    navigation.replace('Tabs', { screen: 'Gremly', params: todayThreadParams('wrap') } as never);
  }, [evening, demoSweepCompletedAt, navigation]);

  // ── Week-mode hub state ──────────────────────────────────────────────────
  // Sentinel step value for the hub chooser screen. Must not collide with
  // existing steps (0.25, 0.75, 1, 2, 3, 4).
  const HUB = 0.1;
  const EVENTS = 0.2; // Events spoke sentinel
  const [step, setStep] = useState<number>(quick ? 1 : HUB);
  // The morning's quick sweep sorts for today. Tonight's wrap up sorts for the
  // next day, unless it is before the evening, when today still has room. The
  // week planner sorts for the week.
  const sweepIntent: SweepIntent = useMemo(() => {
    if (cardsMode === 'wrap') return wrapNow().evening ? 'tomorrow' : 'today';
    return quick ? 'today' : 'week';
  }, [cardsMode, quick]);
  const hubMode = !quick;
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  const [guidedAll, setGuidedAll] = useState(false);
  const [activeSection, setActiveSection] = useState<HubSectionKey | null>(null);

  // Get unresolved multi-drops from NOTES (not queueItems - they're promoted before sweep starts)
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
    sweepLog.debug('[SweepFlowScreen] notes count:', notes.length);
    sweepLog.debug('[SweepFlowScreen] unresolvedMultiDrops count:', multiNotes.length);
    if (multiNotes.length > 0) {
      multiNotes.forEach((note) => {
        const views = note.views as any;
        sweepLog.debug('[SweepFlowScreen] multi-note:', {
          id: note.id,
          title: note.title,
          multiItemsCount: views?.multi_items?.length ?? 0,
          minddropStage: views?.minddrop_stage,
        });
      });
    }
    return multiNotes;
  }, [notes]);

  // the quick sweep splits a drop with several things in it first, as Sweep does
  useEffect(() => {
    if (quick && unresolvedMultiDrops.length > 0) setStep(0.25);
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

  // Track sweep stats across the session
  const [keptCount, setKeptCount] = useState(0);
  const [clearedCount, setClearedCount] = useState(0);

  // Track detailed item breakdown for summary display
  const [summaryItems, setSummaryItems] = useState<SweepSummary['items']>(undefined);

  // Track Gremly age for summary display
  const [summaryGremlyAge, setSummaryGremlyAge] = useState(0);
  const [summaryDidAgeUp, setSummaryDidAgeUp] = useState(false);
  const [showAgeUpModal, setShowAgeUpModal] = useState(false);
  const [celebrationAge, setCelebrationAge] = useState(0);

  // ─────────────────────────────────────────────────────────────────────────
  // Global Overlay State - render overlay ON TOP of Sweep modal
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
    // Emit close event so SweepDecisionStep knows user cancelled (didn't save)
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

  // ── Hub helpers ──────────────────────────────────────────────────────────
  const backToHub = useCallback(() => {
    setActiveSection(null);
    setStep(HUB);
  }, [HUB]);

  const addCompletedSection = useCallback((key: HubSectionKey) => {
    setCompletedSections((prev) => new Set(prev).add(key));
  }, []);

  const handleHubPickSection = useCallback(
    (key: HubSectionKey) => {
      setActiveSection(key);
      if (key === 'todos') setStep(1);
      else if (key === 'intention') setStep(3);
      else if (key === 'habits') setStep(2);
      else if (key === 'events') setStep(EVENTS);
    },
    [EVENTS],
  );

  const handleHubLeadThroughAll = useCallback(() => {
    setGuidedAll(true);
    setActiveSection(null);
    setStep(1); // Start linear chain: decisions → intention → summary
  }, []);

  const handleHubFinish = useCallback(() => {
    setStep(4); // Jump to summary
  }, []);

  const handleEventsFinish = useCallback(() => {
    if (hubMode && !guidedAll) {
      addCompletedSection('events');
      backToHub();
      return;
    }
    setStep(3); // Events → Intention in guided chain
  }, [hubMode, guidedAll, addCompletedSection, backToHub]);

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

      // Create each item as proper entity - they'll appear in sweep automatically
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
          // Log bucket - create as note
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

      if (__DEV__) {
        sweepLog.debug(
          '[SweepFlowScreen] handleMultiSplit: created',
          selectedItems.length,
          'items',
        );
      }
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
      const { resolveMultiDropAsSingle, updateNote, createTodo, createHabit, archiveNote } = state;
      const note = state.notes.find((n) => n.id === dropId);

      if (!note) {
        sweepLog.warn('[SweepFlowScreen] handleMultiKeepAsOne: note not found', { dropId });
        return;
      }

      const views = note.views as {
        dominant_bucket?: string;
        dominant_subtype?: string;
        space_id?: string | null;
        multi_items?: Array<{ text: string }>;
      } | null;

      const dominantBucket = views?.dominant_bucket;
      const dominantSubtype = views?.dominant_subtype;
      const originalText = note.body || note.title || '';
      const spaceId = views?.space_id ?? null;

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
              space_id: spaceId,
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
              sweepLog.debug('[SweepFlowScreen] Converted multi-drop to todo:', entityId);
            }
          } else if (dominantBucket === 'habit') {
            // Convert note → habit
            const newHabit = await createHabit?.({
              name: note.title || originalText,
              title: note.title || originalText,
              notes: originalText,
              frequency: 'daily',
              subtype: 'start_habit',
              space_id: spaceId,
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
              sweepLog.debug('[SweepFlowScreen] Converted multi-drop to habit:', entityId);
            }
          } else {
            // Keep as note — clear multi flag, set up for enrichment
            resolveMultiDropAsSingle?.(dropId);
          }

          // Run Phase 1.5a + Phase 2 enrichment
          const cortexUrl = readCortexUrl();
          if (!cortexUrl) {
            sweepLog.warn('[SweepFlowScreen] Missing cortex URL, skipping enrichment');
            return;
          }
          const sessionToken = await getSessionToken();

          const ds = getDateService();
          const currentDateStr = ds.today();
          const dayOfWeek = ds.getDayOfWeek();
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

          sweepLog.debug(
            '[SweepFlowScreen] Running Phase 1.5a + Phase 2 for kept-as-single:',
            entityId,
          );

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
                sweepLog.warn('[SweepFlowScreen] Phase 1.5a failed:', err);
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
                sweepLog.warn('[SweepFlowScreen] Phase 2 failed:', err);
                return null;
              }
            })(),
          ]);

          sweepLog.debug('[SweepFlowScreen] Phase 1.5a result:', JSON.stringify(phase15aResult));
          sweepLog.debug('[SweepFlowScreen] Phase 2 result:', JSON.stringify(phase2Result));

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
            sweepLog.debug('[SweepFlowScreen] Enrichment applied for:', entityId);
          }
        } catch (error) {
          sweepLog.error('[SweepFlowScreen] Keep-as-single enrichment failed:', error);
          // Silent failure — the entity is already saved, just without enrichment
        }
      })();
    },
    [canCreate, navigation],
  );

  // Splitting is done: on to the cards
  const handleMultiSplitComplete = useCallback(() => {
    setStep(1);
  }, []);

  const handleIntentionContinue = () => {
    // Picked on its own from the chooser, the intention goes back to it
    if (hubMode && !guidedAll) {
      addCompletedSection('intention');
      backToHub();
      return;
    }
    setStep(4); // Intention → Summary
  };

  const handleHabitsContinue = () => {
    // Picked on its own from the chooser, the habits deck goes back to it
    if (hubMode && !guidedAll) {
      addCompletedSection('habits');
      backToHub();
      return;
    }
    setStep(EVENTS); // Habits → Events
  };

  const handleDecisionFinished = useCallback(
    async (summary: SweepSummary) => {
      // the quick sweep ends with the cards: straight back to the brief, and it
      // is not the evening Sweep (no streak, no habits, journal or summary)
      if (quick) {
        navigation.goBack();
        return;
      }
      setKeptCount(summary.kept);
      setClearedCount(summary.cleared);
      if (summary.items) {
        setSummaryItems(summary.items);
      }

      // Set Gremly age for summary display (from SweepDecisionStep tracking)
      setSummaryGremlyAge(summary.finalAge ?? useGremlyStore.getState().gremlyAge);
      setSummaryDidAgeUp(summary.didAgeUp ?? false);

      // Record completion in DB and get streak
      if (user?.id) {
        try {
          const result = await markSweepCompleted(user.id, supabase, {
            kept: summary.kept,
            cleared: summary.cleared,
          });
          sweepLog.debug('[SweepFlowScreen] Sweep completed, streak:', result.streak);

          // Update Zustand store with new sweep preferences
          const { setSweepPreferences, totalSweepCount } = useGremlyStore.getState();
          setSweepPreferences({
            lastSweepCompletedAt: getDateService().nowTimestamp(),
            sweepStreak: result.streak,
            totalSweepCount: totalSweepCount + 1,
          });
        } catch (err) {
          sweepLog.error('[SweepFlowScreen] Failed to mark sweep as completed:', err);
        }
      }

      // In hub a-la-carte mode, return to hub after decisions
      if (hubMode && !guidedAll) {
        addCompletedSection('todos');
        backToHub();
        return;
      }
      // Advance to Habits step
      setStep(2); // Decision → Habits
    },
    [quick, navigation, user, hubMode, guidedAll, addCompletedSection, backToHub],
  );

  const handleSummaryDone = () => {
    if (summaryDidAgeUp) {
      setCelebrationAge(summaryGremlyAge);
      setShowAgeUpModal(true);
    } else {
      navigation.goBack();
    }
  };

  const celebrationTier = celebrationAge ? getTierForAge(celebrationAge) : null;
  const previousTier =
    celebrationAge && celebrationAge > 0 ? getTierForAge(celebrationAge - 1) : null;
  const isCelebrationTierTransition =
    celebrationTier && previousTier ? celebrationTier.name !== previousTier.name : false;

  const handleAgeModalDismiss = () => {
    setShowAgeUpModal(false);
    navigation.goBack();
  };

  // Handler for X close button.
  // In à-la-carte hub mode: X inside a spoke returns to the hub chooser.
  // From the hub itself, guided mode, or non-hub mode: X exits the sweep.
  const handleClose = useCallback(() => {
    if (hubMode && !guidedAll && step !== HUB && step > 0) {
      backToHub();
      return;
    }
    navigation.goBack();
  }, [hubMode, guidedAll, step, HUB, backToHub, navigation]);

  // Intercept gesture/hardware back in à-la-carte hub mode so the user
  // returns to the hub chooser instead of leaving the sweep entirely.
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (hubMode && !guidedAll && step !== HUB && step > 0) {
        e.preventDefault();
        backToHub();
      }
    });
  }, [navigation, hubMode, guidedAll, step, HUB, backToHub]);

  // Handler for back chevron - goes to previous step or closes if on first step
  const handleGoBack = useCallback(() => {
    // From a spoke in a-la-carte hub mode, go back to the hub
    if (hubMode && !guidedAll && step !== HUB && step > 0) {
      backToHub();
      return;
    }
    // From the hub (or guided mode), exit or go to previous step; the quick
    // sweep has nothing before its cards
    if (step === HUB || step <= 0 || (quick && step <= 1)) {
      navigation.goBack();
      return;
    }
    setStep(step - 1);
  }, [quick, step, hubMode, guidedAll, HUB, backToHub, navigation]);

  // ── Demo: show for ANY user who hasn't completed the demo yet ──
  if (!demoSweepCompletedAt) {
    return (
      <SweepDemoFlow
        onComplete={() => {
          if (demoMode) {
            navigation.goBack();
          }
          // else: do nothing — Zustand re-render handles the transition
        }}
        returnsToMindDrop={demoMode}
      />
    );
  }

  // Opened with neither cards nor week: nothing to show here, the effect
  // above is taking the person to the wrap up in today's thread
  if (evening) {
    return (
      <Screen edges={['top', 'bottom']} padded={false} style={styles.screenBackground}>
        {null}
      </Screen>
    );
  }

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
            {/* Left - back chevron */}
            <TouchableOpacity
              style={styles.headerBackButton}
              onPress={handleGoBack}
              activeOpacity={0.7}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Icon name="ChevronLeft" size="md" color={BRAND.colors.charcoalInk} strokeWidth={2} />
            </TouchableOpacity>

            {/* Center - subtle title */}
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

        {/* Step Content - Full-bleed for decision step */}
        <View
          style={
            step === 1 ? styles.contentDecision : step === HUB ? styles.contentHub : styles.content
          }
        >
          {step === HUB && sweepIntent === 'week' && (
            <SweepHubChooser
              completed={completedSections}
              onPickSection={handleHubPickSection}
              onLeadThroughAll={handleHubLeadThroughAll}
              onFinish={handleHubFinish}
              onExit={handleClose}
              weekLabel={(() => {
                const _ds = getDateService();
                const MONTHS = [
                  'January',
                  'February',
                  'March',
                  'April',
                  'May',
                  'June',
                  'July',
                  'August',
                  'September',
                  'October',
                  'November',
                  'December',
                ];
                const start = _ds.getStartOfWeek();
                const end = _ds.addDays(start, 6);
                const s = _ds.fromLocalDate(start);
                const e = _ds.fromLocalDate(end);
                if (!s || !e) return '';
                const sLabel = `${MONTHS[s.getMonth()]} ${s.getDate()}`;
                const eLabel =
                  e.getMonth() === s.getMonth()
                    ? `${e.getDate()}`
                    : `${MONTHS[e.getMonth()]} ${e.getDate()}`;
                return `${sLabel} to ${eLabel}`;
              })()}
            />
          )}
          {step === 0.25 && (
            <SweepMultiSplitStep
              multiDrops={unresolvedMultiDropsForStep}
              onSplit={handleMultiSplit}
              onKeepAsOne={handleMultiKeepAsOne}
              onComplete={handleMultiSplitComplete}
            />
          )}
          {step === 1 && (
            <SweepDecisionStep
              onFinished={handleDecisionFinished}
              onClose={handleClose}
              sweepIntent={sweepIntent}
              cards={cardsMode ?? 'all'}
              saveEach={quick}
              onSaved={cardsMode === 'wrap' ? recordWrapDecision : undefined}
            />
          )}
          {step === 2 && sweepIntent === 'week' && (
            <SweepHabitsCheckInStep onFinish={handleHabitsContinue} />
          )}
          {step === EVENTS && sweepIntent === 'week' && (
            <SweepEventsStep onFinish={handleEventsFinish} />
          )}
          {step === 3 && sweepIntent === 'week' && (
            <SweepIntentionStep
              weekStartDate={getDateService().getStartOfWeek()}
              onContinue={handleIntentionContinue}
              onSkip={handleIntentionContinue}
            />
          )}
          {step === 4 && (
            <SweepSummaryStep
              keptCount={keptCount}
              clearedCount={clearedCount}
              items={summaryItems}
              gremlyAge={summaryGremlyAge}
              onDone={handleSummaryDone}
              onNavigateBack={() => navigation.goBack()}
              onPlanTomorrow={() => {
                // Close sweep first, then emit event for NowScreenV1 to open tomorrow brief
                navigation.goBack();
                setTimeout(() => {
                  eventBus.emit('openTomorrowBrief', {});
                }, 300); // Small delay to let sweep dismissal animation complete
              }}
            />
          )}
        </View>
      </Screen>

      {/* Local Overlay Portal - renders ON TOP of Sweep modal
          Since Sweep is presented as a modal, the global OverlayHost renders
          below it. We render the overlay here so it appears above Sweep. */}
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

      {/* Age-Up Celebration Modal */}
      <AgeUpCelebrationModal
        visible={showAgeUpModal}
        newAge={celebrationAge}
        tierName={celebrationTier?.name}
        isTierTransition={isCelebrationTierTransition}
        previousTierName={isCelebrationTierTransition ? previousTier?.name : undefined}
        onDismiss={handleAgeModalDismiss}
      />
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
    // No shadow, no border - pure Linen Cream
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
  contentHub: {
    flex: 1,
    paddingHorizontal: 0, // Full-bleed for the week chooser
    backgroundColor: BRAND.colors.linenCream,
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
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: BRAND.colors.linenCream,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '500',
    color: BRAND.colors.inkMuted,
  },
  planTomorrowButton: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 4,
  },
  planTomorrowText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2E5540',
    opacity: 0.8,
  },

  // SweepDecisionStep styles - White background with sage card
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
  decisionBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 2,
  },
  decisionBackText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  decisionCloseButton: {
    padding: 8,
  },
  // Bottom section styles - Compact chrome at bottom, clearly separated from card
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
  saveExitButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  saveExitText: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(34, 34, 34, 0.45)',
    letterSpacing: 0.1,
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
  // SweepSummaryStep styles
  summaryContainer: {
    flex: 1,
    paddingTop: 24,
    backgroundColor: BRAND.colors.linenCream,
  },
  summaryScrollContent: {
    flexGrow: 1,
    paddingBottom: 12,
  },
  summaryTitle: {
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  summaryTitleText: {
    fontSize: 28,
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    textAlign: 'center',
  },
  summarySubtext: {
    fontSize: 16,
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    marginBottom: 12,
  },
  summaryMascotContainer: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  summaryMascotImage: {
    width: 140,
    height: 140,
  },
  gaugeRevealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 20,
    marginTop: 24,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    // Soft shadow
    shadowColor: '#2E5540',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  gaugeRevealMascotContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    height: 120,
  },
  gaugeRevealDivider: {
    width: 40,
    height: 2,
    backgroundColor: BRAND.colors.borderSubtle,
    borderRadius: 1,
    marginBottom: 16,
  },
  gaugeRevealAgeContainer: {
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 4,
  },
  gaugeRevealAge: {
    fontSize: 24,
    fontFamily: 'PlusJakartaSans-Bold',
    fontWeight: '700',
    color: BRAND.colors.charcoalInk,
    lineHeight: 34,
    marginBottom: 8,
  },
  gaugeRevealFedDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gaugeRevealDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gaugeRevealDotFilled: {
    backgroundColor: BRAND.colors.mossGreen,
  },
  gaugeRevealDotEmpty: {
    backgroundColor: BRAND.colors.borderSubtle,
  },
  gaugeRevealFedText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    marginLeft: 4,
  },
  gaugeRevealBarContainer: {
    width: '100%',
    marginBottom: 16,
    alignItems: 'center',
  },
  gaugeRevealBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: BRAND.colors.borderSubtle,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  gaugeRevealBarFill: {
    height: '100%',
    backgroundColor: BRAND.colors.mossGreen,
    borderRadius: 3,
  },
  gaugeRevealBarLabel: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    fontWeight: '500',
    color: BRAND.colors.mossGreen,
  },
  gaugeRevealTextContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  gaugeRevealImpact: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  gaugeRevealPlanSection: {
    alignItems: 'center',
    marginBottom: 8,
  },
  gaugeRevealTomorrowStats: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
    marginTop: 4,
  },
  summaryEmptyContainer: {
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  summaryEmptyText: {
    fontSize: 15,
    color: BRAND.colors.inkSubtle,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Expandable summary styles
  expandableSummaryContainer: {
    paddingHorizontal: 16,
    gap: 6,
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
