/**
 * RecentDrops.tsx - Recent Mind Drops list and animated card components
 *
 * Extracted from CatchAllNotepad.tsx for maintainability.
 * Contains: animation tracking, skeleton states, card components,
 * and the RecentDrops list component.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Platform,
  Pressable,
  View,
  ActionSheetIOS,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { AppScrollView } from '../../components/common/AppScrollView';
import * as Haptics from 'expo-haptics';
import { Text } from '../../ui/Text';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import {
  useHasCompletedFirstDrop,
  useNeedsMindDropTutorial,
} from '../../lib/store/lifecycleSelectors';
import type { QueuedDrop } from '../../lib/minddrop/dropQueue';
import type { UnifiedDrop } from '../../types/UnifiedDrop';
import {
  selectItemById,
  selectRecentNotes,
  selectRecentTodos,
  selectRecentHabits,
} from '../../lib/store/selectors';
import { useAuth } from '../../providers/AuthProvider';
import { useRepo } from '../../providers/RepoProvider';
import type { MindDropBucket, LogSubtype as MindDropLogSubtype } from '../../lib/minddrop/types';
import { runPhase2 } from '../../lib/minddrop/phase2';
import { useTheme } from '../../src/theme/useTheme';
import Reanimated, {
  FadeInUp,
  FadeOut,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing as ReanimatedEasing,
  type EntryAnimationsValues,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase/client';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { addOverlaySavedListener } from '../../lib/events/overlaySaved';
import { eventBus } from '../../lib/events/EventBus';
import { Camera, ChevronDown, ChevronRight } from 'lucide-react-native';
import { getDateService, nowTimestamp } from '../../lib/date/DateService';
import { getDisplayKindForChip, getDisplayKindForDrop } from '../../lib/minddrop/cardHelpers';
import { env } from '../../lib/env';
import { heldKindOf, keepsHeldNote, relationOf } from '../../lib/minddrop/dropRelation';
import { DropCard } from '../../components/minddrop/DropCard';
import { SplitBar } from '../../components/minddrop/SplitBar';
import { useReducedMotion } from '../../design/animations';
import { keptGroupsNow } from '../../lib/minddrop/splitActions';
import { dropPlaceOf } from '../../lib/minddrop/dropPlace';
import { WorldsChapterPicker } from '../../components/overlay/WorldsChapterPicker';
import { logAppEvent } from '../../lib/appEvents';
import {
  orderDropList,
  splitBarFor,
  splitPlaceOf,
  withoutPiecesOfCardsOnList,
} from '../../lib/minddrop/splitList';
import { CardAsk, CardDupe } from '../../components/minddrop/CardAsk';
import { cardDupeAsk, cardStripAsk, keptForSweep } from '../../lib/minddrop/asks';
import { dropCardKind, dropCardStage, metaParts } from '../../lib/minddrop/dropCardModel';
import { getSessionToken } from '../../lib/cortex/getSessionToken';
import { type Mood } from '../../lib/shared/moods';
import { makeStyles } from './CatchAllNotepad';

const UNSORTED_LABEL = 'needs_review';

/**
 * Apply Phase 2 enrichment result to a UnifiedDrop item
 * CRITICAL: Must include ALL chip-relevant fields so they all animate together
 * Missing any field means that chip appears later without the blur animation
 */
function applyEnrichmentToItem(
  item: UnifiedDrop,
  result: {
    smartTitle?: string;
    tags?: string[];
    timeEstimateMinutes?: number | null;
    extractedDate?: string | null; // Legacy - maps to due_date
    extractedStartDate?: string | null;
    extractedFrequency?: string | null;
    extractedDays?: number[] | null;
    cadence?: string | null;
    targetPerPeriod?: number | null;
    confirmationMessage?: string | null;
    people?: string[];
    mood?: string[] | null;
    priorityKind?: 'action' | 'blocker' | 'waiting' | 'decision' | 'momentum' | null;
    // Date Intelligence fields (Phase C)
    targetDate?: string | null;
    scheduledDate?: string | null;
    dateTypeAmbiguous?: boolean;
  },
): UnifiedDrop {
  return {
    ...item,
    tags: result.tags || item.tags,
    time_estimate_minutes: result.timeEstimateMinutes ?? item.time_estimate_minutes,
    // Date Intelligence: prefer new fields, fall back to legacy
    target_date: result.targetDate ?? item.target_date,
    scheduled_date: result.scheduledDate ?? item.scheduled_date,
    date_type_ambiguous: result.dateTypeAmbiguous ?? item.date_type_ambiguous,
    // Legacy date fields - still set for backwards compatibility
    due_date: result.extractedDate ?? result.scheduledDate ?? item.due_date,
    due_day: (result.extractedDate ?? result.scheduledDate)?.split('T')[0] ?? item.due_day,
    start_date: result.extractedStartDate ?? item.start_date,
    frequency: result.extractedFrequency ?? item.frequency,
    cadence: (result.cadence as 'daily' | 'weekly' | 'monthly' | null) ?? item.cadence,
    target_per_period: result.targetPerPeriod ?? item.target_per_period,
    days_active: result.extractedDays ?? item.days_active,
    mood: (result.mood as Mood[] | null) ?? item.mood,
    priority_kind: result.priorityKind ?? item.priority_kind,
    views: {
      ...item.views,
      minddrop_stage: 'enriched',
      ai_pending: false,
      confirmation_message: result.confirmationMessage ?? item.views?.confirmation_message,
      people: result.people ?? item.views?.people,
    },
  };
}

/**
 * Visual state for Mind Drop items in Recent Drops list
 * - 'pending': AI enrichment in progress (views.ai_pending = true)
 * - 'enriching': Phase 2 enrichment in progress (entity exists, refining)
 * - 'streaming': Phase 2 streaming in progress (fields arriving progressively)
 * - 'revealing': Typewriter reveal animation in progress
 * - 'failed': AI enrichment failed (views.ai_failed = true)
 * - 'complete': AI enrichment complete or not needed
 */
type MindDropVisualState =
  | 'pending'
  | 'enriching'
  | 'streaming'
  | 'revealing'
  | 'failed'
  | 'complete';

/**
 * Get visual state for a Mind Drop item based on views flags
 * Used only for Mind Drop / CatchAll notes to show processing status
 */
/**
 * Get visual state for a Mind Drop item based on views flags
 * Used only for Mind Drop / CatchAll notes to show processing status
 */
function getMindDropVisualState(entity: {
  views?: any;
  title?: string;
  tags?: any[];
}): MindDropVisualState {
  const views = entity.views ?? {};

  // Phase 1.5a streaming - title/confirmation arriving, show typewriter
  // CHECK THIS FIRST - streaming should override ai_pending
  if (views.minddrop_stage === 'streaming') {
    return 'streaming';
  }

  // Clarification processing - user just selected an option, API calls in progress
  if (views.clarification_processing === true || views.ai_pending === true) {
    return 'enriching';
  }

  // Phase 1 in progress - no entity yet, show skeleton
  if (views.minddrop_stage === 'pending') {
    return 'pending';
  }

  // Phase 2 in progress - entity exists, show enriching animation
  if (views.minddrop_stage === 'enriching') {
    return 'enriching';
  }

  // Explicitly failed
  if (views.ai_failed === true) {
    return 'failed';
  }

  // Phase 2 enrichment timed out or failed — show retry affordance
  if (views.minddrop_stage === 'enrichment_failed') {
    return 'failed';
  }

  // Successfully enriched
  if (views.minddrop_stage === 'enriched' || views.minddrop_stage === 'prefilled') {
    return 'complete';
  }

  // Default: complete
  return 'complete';
}

// Track which items have already been animated in (persists across re-renders)
const animatedInItemIds = new Set<string>();

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Custom LayoutAnimation config for smooth card slide-down (Phase 1)
// Made slower and more intentional so users clearly see cards "making room"
const CardInsertLayoutAnimation = {
  duration: 550,
  create: {
    type: LayoutAnimation.Types.easeOut,
    property: LayoutAnimation.Properties.opacity,
  },
  update: {
    // Spring animation for visible, bouncy slide-down effect
    type: LayoutAnimation.Types.spring,
    springDamping: 0.85, // Lower = more bouncy (0.85 = subtle bounce at end)
  },
};

/**
 * AnimatedCardInsert - Premium depth emergence animation synced with Phase 0 timing
 *
 * TIMING (synced with Phase 0 multi-detect ~700ms):
 *
 * 0ms    - User taps Drop, pending drop added to Zustand
 * 0-600ms - PHASE 1: Existing cards slide down via LayoutAnimation
 * 200ms  - PHASE 2 START: Card begins emerging from depth
 *          Initial state: scale 0.65, opacity 0.2 (far beneath surface)
 * 700ms  - Phase 0 returns: bucket + isMulti now known
 *          Card is at ~scale 0.84, opacity 0.67 (still visibly emerging)
 *          React re-renders with correct card type (single/multi)
 * 1100ms - PHASE 2 END: Card reaches full size
 *          Final state: scale 1.0, opacity 1.0 (fully surfaced)
 *          Card has "revealed" its true form during emergence
 *
 * The card content updates at 700ms while still scaled down (~0.84),
 * so the correct type (single/multi) is revealed as the card surfaces.
 * This creates a seamless "morph" effect - users never see a type switch.
 *
 * Math: Animation starts at 200ms, duration 900ms, ends at 1100ms.
 * At 700ms: (700-200)/900 = 55.6% through animation.
 * With easeOut(cubic), ~80% of value change completed.
 * Scale at 700ms: 0.65 + 0.35 * 0.80 ≈ 0.93
 */
const AnimatedCardInsert: React.FC<{
  itemId: string;
  children: React.ReactNode;
}> = ({ itemId, children }) => {
  // Check if this item has already been animated
  const hasAnimated = animatedInItemIds.has(itemId);

  // Animation values for depth emergence - start at final state if already animated
  // scale: 0.65 → 1.0 (rising from deep within the screen)
  // opacity: 0.2 → 1.0 (emerging through frosted glass layers)
  const scale = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.65), []);
  const opacity = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.2), []);

  React.useEffect(() => {
    // Skip animation if already animated
    if (hasAnimated) return;

    // Mark as animated immediately to prevent re-triggering
    animatedInItemIds.add(itemId);

    // NOTE: LayoutAnimation.configureNext is now called in addPendingDrop (Zustand store)
    // BEFORE the state change, so existing cards slide down properly.
    // Calling it here in useEffect would be TOO LATE (layout already changed).

    // Phase 2: Depth emergence animation
    // Starts at 200ms so card is mid-emergence when Phase 0 returns at ~700ms
    const timeout = setTimeout(() => {
      Animated.parallel([
        // Scale from 0.65 to 1.0 - rising from deep within the phone
        Animated.timing(scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Opacity from 0.2 to 1.0 - emerging through glass layers
        Animated.timing(opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);

    return () => clearTimeout(timeout);
  }, [itemId, hasAnimated, scale, opacity]);

  // If already animated, render without wrapper for performance
  if (hasAnimated) {
    return <>{children}</>;
  }

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ scale }],
      }}
    >
      {children}
    </Animated.View>
  );
};

// Module-level Set to track drop_ids that recently transitioned from pending→real
// These items should NOT have Layout animation enabled initially to avoid jolt
const recentlyPromotedDropIds = new Set<string>();

/**
 * AnimatedCardSlideDown - Wrapper for existing cards to animate their position
 * when new cards are inserted above them.
 *
 * Uses Reanimated's Layout transition for smooth position animation.
 * The 450ms duration matches CardInsertLayoutAnimation for visual consistency.
 *
 * CRITICAL: We use a smart delay system to prevent jolts:
 * 1. Items that just transitioned from pending→real skip Layout initially
 * 2. Items wait 500ms after mount before enabling Layout animation
 *
 * This prevents the "jolt" when pending items are removed and real items appear,
 * while still allowing smooth slide-down when NEW cards are inserted.
 */
const AnimatedCardSlideDown: React.FC<{
  itemId: string;
  dropId?: string | null;
  children: React.ReactNode;
}> = ({ itemId, dropId, children }) => {
  // Track if this item's layout animation is enabled
  const [layoutEnabled, setLayoutEnabled] = React.useState(false);

  React.useEffect(() => {
    // Check if this item just transitioned from pending
    // If so, we need to skip Layout animation to avoid the jolt
    const wasRecentlyPromoted = dropId && recentlyPromotedDropIds.has(dropId);

    if (wasRecentlyPromoted) {
      // Remove from set after checking (one-time skip)
      recentlyPromotedDropIds.delete(dropId);
      // Use longer delay for recently promoted items
      const timeout = setTimeout(() => {
        setLayoutEnabled(true);
      }, 2000);
      return () => clearTimeout(timeout);
    }

    // For normal items, enable Layout after a short delay
    // This prevents any initial mount jitter
    const timeout = setTimeout(() => {
      setLayoutEnabled(true);
    }, 500);
    return () => clearTimeout(timeout);
  }, [itemId, dropId]);

  // Before Layout is enabled, render without animation
  if (!layoutEnabled) {
    return <View>{children}</View>;
  }

  // After enabled, use Reanimated Layout for smooth position animation
  return (
    <Reanimated.View
      layout={Layout.duration(450).easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
    >
      {children}
    </Reanimated.View>
  );
};

// Export function to mark a drop as recently promoted (called from entity:created handler)
export const markDropAsRecentlyPromoted = (dropId: string) => {
  recentlyPromotedDropIds.add(dropId);
  // Auto-cleanup after 5 seconds
  setTimeout(() => recentlyPromotedDropIds.delete(dropId), 5000);
};

/**
 * How a new drop's card comes into the list (Mind Drop rethink, after the
 * stage 6 simulator check): slowly and softly, rising 16px as it fades in over
 * .9s, while the cards below make room over .65s. The slower arrival gives the
 * sort its moment. Reanimated skips both when reduced motion is on.
 */
const CARD_ENTER_MS = 1020;
const CARD_ENTERING = FadeInUp.delay(120)
  .duration(900)
  .easing(ReanimatedEasing.out(ReanimatedEasing.quad))
  .withInitialValues({ opacity: 0, transform: [{ translateY: 16 }] });
const CARD_LAYOUT = Layout.duration(650).easing(ReanimatedEasing.out(ReanimatedEasing.quad));

/**
 * Where each card sits on the list (its top), by item id and by drop id, so a
 * card can go into another (Keep just one, Keep as one) and a split's pieces
 * can come out of the card they were (Mind Drop rethink stage 7). A card's
 * top is kept for a moment after it goes, so the pieces that take its place
 * can still find it.
 */
const cardTops = new Map<string, number>();
const TOP_KEPT_MS = 3000;

/** How a card goes: see 'minddrop:cards_leaving' in EventBus. dy: to the card it goes into. */
export type CardLeaveAs = { as: 'slide' | 'fade' | 'fold' | 'into'; dy: number };

/**
 * How a card comes in: a new drop (CARD_ENTERING); a piece of a split, out of
 * the card it was (fromTop), 90ms after the piece before it; or the note a
 * split was kept as.
 */
export type CardEnterAs =
  | { as: 'drop' }
  | { as: 'piece'; index: number; fromTop: number }
  | { as: 'kept' };

/** A piece unzips out of the card it was: up from .94 with a slight overshoot (the prototype's .52s). */
const PIECE_IN_MS = 520;
const PIECE_STAGGER_MS = 90;
function pieceEntering(index: number, fromTop: number) {
  return (values: EntryAnimationsValues) => {
    'worklet';
    const delay = index * PIECE_STAGGER_MS;
    const config = { duration: PIECE_IN_MS, easing: ReanimatedEasing.bezier(0.2, 0.9, 0.3, 1.12) };
    return {
      initialValues: {
        opacity: 0,
        transform: [{ translateY: fromTop - values.targetOriginY }, { scale: 0.94 }],
      },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: PIECE_IN_MS })),
        transform: [
          { translateY: withDelay(delay, withTiming(0, config)) },
          { scale: withDelay(delay, withTiming(1, config)) },
        ],
      },
    };
  };
}
/** The note a split was kept as comes in where the pieces fold (the prototype's .38s). */
function keptEntering() {
  'worklet';
  const config = { duration: 380, easing: ReanimatedEasing.bezier(0.2, 0.8, 0.2, 1) };
  return {
    initialValues: { opacity: 0.4, transform: [{ scale: 0.97 }] },
    animations: { opacity: withTiming(1, config), transform: [{ scale: withTiming(1, config) }] },
  };
}
/** A drop sorted into its pieces fades as they come out of it. */
const UNZIP_EXITING = FadeOut.duration(220);

/**
 * UnifiedCardWrapper - Single wrapper for both pending and real items.
 *
 * CRITICAL: Using a single component prevents React from remounting children
 * when an item transitions from pending to real. This preserves modal state.
 *
 * - a new pending drop comes in with CARD_ENTERING; a split's pieces come out
 *   of the card they were; a split kept as one comes in where they fold
 * - every card moves with CARD_LAYOUT once it is in, so the list makes room
 *   smoothly when a drop arrives or a card leaves
 * - a card goes as it is told (leaveAs): it slides away to the right, fades
 *   where it is, folds into the first of its group, or glides into another
 */
const UnifiedCardWrapper = React.memo<{
  itemId: string;
  dropId?: string | null;
  isPending: boolean;
  children: React.ReactNode;
  /** the card is going (a yes cleared it, it was ticked off, archived or deleted) */
  leaving?: boolean;
  /** how it goes (slides away to the right when not given) */
  leaveAs?: CardLeaveAs;
  onLeft?: (itemId: string) => void;
  /** the card is coming back after an Undo: it slides back in from the right */
  returning?: boolean;
  onReturned?: (itemId: string) => void;
  /** how it comes in, decided once when it mounts */
  enterAs?: CardEnterAs;
  /** a drop sorted into its pieces: it fades as they come out of it */
  unzips?: boolean;
}>(
  ({
    itemId,
    dropId,
    isPending,
    children,
    leaving = false,
    leaveAs,
    onLeft,
    returning = false,
    onReturned,
    enterAs,
    unzips = false,
  }) => {
    const reduced = useReducedMotion();
    // Track animation state - starts true if was pending, then transitions
    const [wasPending, setWasPending] = React.useState(isPending);
    const [layoutEnabled, setLayoutEnabled] = React.useState(false);

    // How it comes in, once: decided when it mounts, and remembered by id so a
    // remount never plays it again
    const [entering] = React.useState(() => {
      if (!enterAs || animatedInItemIds.has(itemId)) return undefined;
      animatedInItemIds.add(itemId);
      if (enterAs.as === 'drop') return CARD_ENTERING;
      if (reduced) return undefined;
      if (enterAs.as === 'kept') return keptEntering;
      return pieceEntering(enterAs.index, enterAs.fromTop);
    });

    // Where it sits, for the cards that go into it and the pieces that come out of it
    const onLayout = React.useCallback(
      (e: { nativeEvent: { layout: { y: number } } }) => {
        const y = e.nativeEvent.layout.y;
        cardTops.set(itemId, y);
        if (dropId) cardTops.set(dropId, y);
      },
      [itemId, dropId],
    );
    // let its top go a moment after it has gone (not when it is promoted:
    // the card is still there, under its saved id)
    const idsRef = React.useRef({ itemId, dropId });
    idsRef.current = { itemId, dropId };
    React.useEffect(
      () => () => {
        const now = idsRef.current;
        const keys = now.dropId ? [now.itemId, now.dropId] : [now.itemId];
        const tops = keys.map((k) => cardTops.get(k));
        setTimeout(() => {
          keys.forEach((k, i) => {
            if (cardTops.get(k) === tops[i]) cardTops.delete(k);
          });
        }, TOP_KEPT_MS);
      },
      [],
    );

    // Leaving, as it is told. Slide: a small gather (the card draws back a
    // touch and settles), then it glides away to the right, picking up speed
    // with a slight tilt and fading at the end. Fade: it fades where it is.
    // Fold and into: it moves to the card it joins, shrinking and fading. The
    // list closes the gap once it has gone (the Layout transition below).
    // Coming back after an Undo runs the slide in reverse.
    const how: CardLeaveAs = leaveAs ?? { as: 'slide', dy: 0 };
    const leaveGather = React.useMemo(() => new Animated.Value(0), []);
    const leaveGlide = React.useMemo(() => new Animated.Value(returning ? 1 : 0), []);
    React.useEffect(() => {
      if (!leaving) {
        if (!returning) {
          leaveGather.setValue(0);
          leaveGlide.setValue(0);
        }
        return;
      }
      if (how.as !== 'fade') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const anim =
        how.as === 'slide'
          ? Animated.sequence([
              Animated.timing(leaveGather, {
                toValue: 1,
                duration: 140,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(leaveGlide, {
                toValue: 1,
                duration: 420,
                easing: Easing.bezier(0.45, 0, 0.7, 0.2),
                useNativeDriver: true,
              }),
            ])
          : Animated.timing(leaveGlide, {
              toValue: 1,
              duration: how.as === 'fade' ? 260 : how.as === 'fold' ? 420 : 520,
              easing: how.as === 'fade' ? Easing.out(Easing.quad) : Easing.bezier(0.45, 0, 0.2, 1),
              useNativeDriver: true,
            });
      anim.start(({ finished }) => {
        if (finished) onLeft?.(itemId);
      });
      return () => anim.stop();
      // the way it goes is set before it starts going
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leaving, returning, itemId, onLeft, leaveGather, leaveGlide]);
    React.useEffect(() => {
      if (!returning) return;
      leaveGather.setValue(0);
      const anim = Animated.timing(leaveGlide, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      anim.start(({ finished }) => {
        if (finished) onReturned?.(itemId);
      });
      return () => anim.stop();
    }, [returning, itemId, onReturned, leaveGather, leaveGlide]);
    const glideWidth = Dimensions.get('window').width + 48;
    const leaveStyle =
      how.as === 'slide'
        ? {
            opacity: leaveGlide.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.9, 0] }),
            transform: [
              {
                translateX: Animated.add(
                  leaveGather.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }),
                  leaveGlide.interpolate({ inputRange: [0, 1], outputRange: [0, glideWidth] }),
                ),
              },
              {
                scale: Animated.add(
                  leaveGather.interpolate({ inputRange: [0, 1], outputRange: [1, 0.975] }),
                  leaveGlide.interpolate({ inputRange: [0, 1], outputRange: [0, -0.03] }),
                ),
              },
              {
                rotate: leaveGlide.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '4deg'],
                }),
              },
            ],
          }
        : how.as === 'fade'
          ? {
              opacity: leaveGlide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [
                { scale: leaveGlide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) },
              ],
            }
          : {
              opacity: leaveGlide.interpolate({
                inputRange: [0, 0.65, 1],
                outputRange: [1, 0.55, 0],
              }),
              transform: [
                {
                  translateY: leaveGlide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, how.dy],
                  }),
                },
                {
                  scale: leaveGlide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, how.as === 'fold' ? 0.94 : 0.92],
                  }),
                },
              ],
            };

    // Handle pending→real transition
    React.useEffect(() => {
      if (wasPending && !isPending) {
        // Item just transitioned from pending to real
        // Mark that transition happened so we can skip Layout animation
        if (dropId) {
          recentlyPromotedDropIds.add(dropId);
        }
        setWasPending(false);
      }
    }, [isPending, wasPending, dropId]);

    // The cards around it make room smoothly (CARD_LAYOUT): a card that has
    // just been promoted from pending waits a moment, so its own update does not
    // slide; a card coming in waits until it is in; any other card, half a second
    React.useEffect(() => {
      const wasRecentlyPromoted = !isPending && !!dropId && recentlyPromotedDropIds.has(dropId);
      const delay = isPending || entering ? CARD_ENTER_MS : wasRecentlyPromoted ? 2000 : 500;

      if (wasRecentlyPromoted && dropId) {
        recentlyPromotedDropIds.delete(dropId);
        setLayoutEnabled(false);
      }

      const timeout = setTimeout(() => {
        setLayoutEnabled(true);
      }, delay);
      return () => clearTimeout(timeout);
    }, [isPending, dropId, entering]);

    // One shape for every state, so the card inside is never remounted (its
    // own state, and the question on it, stay as they are). A card going into
    // another moves over the cards between them.
    return (
      <Reanimated.View
        entering={entering}
        exiting={unzips && !reduced ? UNZIP_EXITING : undefined}
        layout={layoutEnabled ? CARD_LAYOUT : undefined}
        onLayout={onLayout}
        style={leaving && how.as !== 'slide' ? LEAVING_ON_TOP : undefined}
      >
        <Animated.View style={leaveStyle}>{children}</Animated.View>
      </Reanimated.View>
    );
  },
);
UnifiedCardWrapper.displayName = 'UnifiedCardWrapper';
const LEAVING_ON_TOP = { zIndex: 2 };

// "Talk it through with Gremly" on the newest drop, under a hairline
const TALK_ROW = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  marginTop: 10,
  paddingTop: 9,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: 'rgba(46, 85, 64, 0.14)',
};
/** How long after a drop its "Talk it through" link stays on the card */
export const TALK_WINDOW_MS = 10 * 60 * 1000;
/** Drops whose "Talk it through" link has been used this session */
const talkUsedIds = new Set<string>();

/**
 * Which drop, if any, offers "Talk it through with Gremly": only the newest
 * one, only once it is sorted, only for TALK_WINDOW_MS after it was made, not
 * during the first-week training, and not again once the link has been used.
 * Card-level states (a question, a split, a held drop, a failed load) are
 * checked on the card, where they already live.
 */
export function talkItemIdFor(
  items: Array<{
    id: string;
    drop_id?: string | null;
    created_at: string;
    views?: Record<string, any> | null;
  }>,
  opts: { pendingIds: Set<string>; nowMs: number; inTraining: boolean; used: Set<string> },
): string | null {
  if (opts.inTraining) return null;
  const top = items[0];
  if (!top) return null;
  if (opts.pendingIds.has(top.drop_id || top.id)) return null;
  if (opts.used.has(top.id)) return null;
  // a split's pieces and the note it was kept as settle without it (stage 7)
  if (top.views?.split_group || top.views?.kept_as_one) return null;
  const age = opts.nowMs - new Date(top.created_at).getTime();
  if (!(age >= 0 && age < TALK_WINDOW_MS)) return null;
  return top.id;
}
/**
 * TypewriterText - Character-by-character reveal animation
 * Creates magical "AI is writing" effect
 * Uses refs to prevent animation restart on parent re-renders
 */
export const TypewriterText: React.FC<{
  text: string;
  style?: any;
  duration?: number;
  delay?: number;
  onComplete?: () => void;
  fadeIn?: boolean;
}> = ({ text, style, duration = 350, delay = 0, onComplete, fadeIn = false }) => {
  const [displayedText, setDisplayedText] = React.useState(fadeIn ? text : '');
  const fadeOpacity = React.useMemo(() => new Animated.Value(0), []);

  // Use refs to avoid dependency issues and prevent re-triggering
  const textRef = React.useRef(text);
  const onCompleteRef = React.useRef(onComplete);
  const hasStartedRef = React.useRef(false);

  // Update refs when props change (but don't re-trigger animation)
  React.useEffect(() => {
    textRef.current = text;
    onCompleteRef.current = onComplete;
  }, [text, onComplete]);

  // Fade-in mode: render full text immediately with opacity animation
  React.useEffect(() => {
    if (!fadeIn) return;
    Animated.timing(fadeOpacity, {
      toValue: 1,
      duration: 1400,
      delay: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => onComplete?.());
  }, [fadeIn]);

  // Run typewriter animation only once on mount (skipped when fadeIn)
  React.useEffect(() => {
    if (fadeIn) return;
    if (hasStartedRef.current) return; // Already started, don't restart
    hasStartedRef.current = true;

    const targetText = textRef.current;
    if (!targetText) {
      setDisplayedText('');
      return;
    }

    let isMounted = true;

    const delayTimeout = setTimeout(() => {
      const chars = targetText.split('');
      const charDuration = Math.max(duration / chars.length, 12); // Min 12ms per char
      let index = 0;

      const interval = setInterval(() => {
        if (!isMounted) return;

        if (index < chars.length) {
          index++;
          setDisplayedText(targetText.substring(0, index));
        } else {
          clearInterval(interval);
          onCompleteRef.current?.();
        }
      }, charDuration);

      // Store interval for cleanup
      return () => clearInterval(interval);
    }, delay);

    return () => {
      isMounted = false;
      clearTimeout(delayTimeout);
    };
  }, [duration, delay, fadeIn]); // Only depend on timing values, not text/callback

  if (fadeIn) {
    return <Animated.Text style={[style, { opacity: fadeOpacity }]}>{text}</Animated.Text>;
  }

  return <Text style={style}>{displayedText}</Text>;
};

/**
 * Animated wrapper for Mind Drop card that smoothly transitions
 * from pending skeleton to final content when AI enrichment completes
 *
 * MEMOIZED to prevent re-renders when other cards update
 */
const AnimatedMindDropCard = React.memo<{
  item: UnifiedDrop;
  isPending: boolean;
  effectiveKind: 'note' | 'todo' | 'habit';
  displayKind: string;
  showLegacyUnsortedBadge: boolean | undefined;
  badgeStyleKey: string;
  c: any;
  styles: any;
  mode: string;
  handleEdit: (id: string, kind: UnifiedDrop['kind'], unsorted?: boolean) => void;
  handleDelete: (id: string, kind: UnifiedDrop['kind']) => void;
  index?: number; // For stagger delay in calm arrival animation
  // Set only on the newest drop while it offers "Talk it through with Gremly"
  onTalk?: (item: UnifiedDrop) => void;
  // A tap on where it lives (stage 9): the place picker opens
  onPlace?: (item: UnifiedDrop) => void;
}>(
  ({ item, isPending, handleEdit, onTalk, onPlace }) => {
    // The drop card, look A (Mind Drop rethink stage 5): its state follows the
    // fields stage 4 writes (lib/minddrop/dropCardModel.ts); DropCard draws it.
    // Its questions are asked on the card (stage 6, lib/minddrop/asks.ts): no
    // popup opens from here, and a tap on the card opens the item.

    // An older note still holding multi_items is one note now: its split lapses
    // as the store loads (asks.ts), and the split modal has left Mind Drop (stage 7)
    const isFailed = getMindDropVisualState(item) === 'failed';

    // Keep just one on another card folded a drop into this one: it pulses once
    const [pulseKey, setPulseKey] = React.useState(0);
    React.useEffect(
      () =>
        eventBus.on('minddrop:card_pulse', ({ id }) => {
          if (id === item.id) setPulseKey((k) => k + 1);
        }),
      [item.id],
    );

    const kind = dropCardKind(item);
    const stage = dropCardStage(item, isPending);
    const title = item.title || item.text;
    const rawTitle = item.text || item.title;
    const meta = React.useMemo(() => metaParts(item, kind), [item, kind]);
    // Where it lives (stage 9): a Chapter, else a World, else nothing
    const placeName = useGremlyStore((s) =>
      isPending
        ? null
        : (dropPlaceOf(item.id, {
            worldLinks: s.dropWorldLinks,
            chapterLinks: s.dropChapterLinks,
            worlds: s.worlds,
            chapters: s.chapters,
          })?.name ?? null),
    );

    // The card's questions (one strip at a time) and the quiet duplicate line
    const stripAsk = isPending ? null : cardStripAsk(item);
    const dupeAsk = isPending || stage !== 'settled' ? null : cardDupeAsk(item);

    const handleCardPress = () => {
      handleEdit(item.id, item.kind, item.unsorted);
    };

    const footer = isFailed ? (
      <Pressable
        onPress={() => {
          eventBus.emit('drop:retry_enrichment', {
            localId: item.drop_id || item.id,
            text: item.text || item.title || '',
            bucket: item.kind === 'note' ? 'log' : item.kind,
            subtype: item.noteSubtype || null,
          });
        }}
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, minHeight: 32 }}
        accessibilityRole="button"
        accessibilityLabel="Couldn't finish loading. Tap to retry."
      >
        <Animated.Image
          source={require('../../assets/buttonforHP.png')}
          style={{ width: 26, height: 26, marginRight: 8, borderRadius: 13 }}
        />
        <Text style={{ fontSize: 13, color: '#916908', fontWeight: '600' }}>
          Couldn't finish loading. Tap to retry.
        </Text>
      </Pressable>
    ) : null;

    const canTalk =
      !!onTalk &&
      !isFailed &&
      !stripAsk &&
      !dupeAsk &&
      !keptForSweep(item) &&
      item.views?.ai_pending !== true &&
      item.views?.clarification_processing !== true;

    return (
      <DropCard
        kind={kind}
        stage={stage}
        rawTitle={rawTitle || ''}
        title={title || ''}
        meta={meta}
        onPress={handleCardPress}
        testID={`minddrop-recent-${item.kind}-${item.id}`}
        onTalk={canTalk ? () => onTalk!(item) : undefined}
        talkTestID={`minddrop-talk-${item.id}`}
        footer={footer}
        askStrip={isPending ? null : <CardAsk item={item} ask={stripAsk} />}
        dupeLine={dupeAsk && !stripAsk ? <CardDupe item={item} ask={dupeAsk} /> : null}
        pulseKey={pulseKey}
        place={
          placeName ? { text: placeName, onPress: onPlace ? () => onPlace(item) : undefined } : null
        }
      />
    );
  },
  (prevProps, nextProps) => {
    // Re-render only when something this card draws has changed
    const a = prevProps.item;
    const b = nextProps.item;
    if (prevProps.isPending !== nextProps.isPending) return false;
    if (prevProps.effectiveKind !== nextProps.effectiveKind) return false;
    if (prevProps.onTalk !== nextProps.onTalk) return false;
    if (prevProps.onPlace !== nextProps.onPlace) return false;
    const fields: Array<keyof UnifiedDrop> = [
      'id',
      'kind',
      'title',
      'text',
      'noteSubtype',
      'due_day',
      'due_time',
      'target_date',
      'scheduled_date',
      'event_time',
      'time_estimate_minutes',
      'frequency',
      'cadence',
      'target_per_period',
      'start_date',
      'time_window',
      'needs_clarification',
      'clarification_resolved',
      'clarification_question',
      'clarification_options',
      'is_multi',
    ];
    for (const f of fields) if (a[f] !== b[f]) return false;
    if ((a.days_active || []).join(',') !== (b.days_active || []).join(',')) return false;
    if ((a.mood || []).join(',') !== (b.mood || []).join(',')) return false;
    const va = (a.views || {}) as Record<string, any>;
    const vb = (b.views || {}) as Record<string, any>;
    const viewFields = [
      'minddrop_stage',
      'bucket_confirmed',
      'needs_clarification',
      'clarification_resolved',
      'clarification_processing',
      'clarification_question',
      'clarification_options',
      'ai_pending',
      'ai_failed',
      'is_multi',
      // the ask rules (stage 6)
      'ask_since',
      'ask_on_card',
      'relation',
      'split',
      // a split's pieces and the note it was kept as (stage 7)
      'split_group',
      'kept_as_one',
    ];
    for (const f of viewFields) if (va[f] !== vb[f]) return false;
    return true;
  },
);

AnimatedMindDropCard.displayName = 'AnimatedMindDropCard';

type OverlayContextValue = ReturnType<typeof useGlobalOverlay>;
export type GlobalOverlayController = Pick<
  OverlayContextValue,
  | 'openCreate'
  | 'openEdit'
  | 'openView'
  | 'close'
  | 'openClarificationPopup'
  | 'closeClarificationPopup'
>;

export const noopOverlayController: GlobalOverlayController = {
  openCreate: () => {},
  openEdit: () => {},
  openView: () => {},
  close: () => {},
  openClarificationPopup: () => {},
  closeClarificationPopup: () => {},
};

export function useMaybeGlobalOverlay(): GlobalOverlayController | null {
  try {
    return useGlobalOverlay();
  } catch (error) {
    if (process.env.NODE_ENV === 'test') {
      return null;
    }
    throw error;
  }
}

// Stable no-op callbacks for pending items (avoids inline arrow functions defeating React.memo)
const NOOP_EDIT = () => {};
const NOOP_DELETE = () => {};

const RecentDrops: React.FC<{
  overlay: GlobalOverlayController;
  onEdited?: () => void;
  onDeleted?: () => void;
  onTodayCountChange?: (count: number) => void; // Callback to sync counter with actual Today items
  onDropCountsChange?: (todayCount: number, olderCount: number) => void; // Callback for empty state logic
  refreshSignal?: number; // bump to force reload after submit
  initiallyOpen?: boolean;
  eagerLoad?: boolean;
}> = ({
  overlay,
  onEdited,
  onDeleted,
  onTodayCountChange,
  onDropCountsChange,
  refreshSignal,
  initiallyOpen = true,
  eagerLoad = false,
}) => {
  // DEBUG: Log every RecentDrops render with timestamp (disabled to reduce Metro noise)
  // console.log('[RecentDrops] 🔄 Render', { timestamp: Date.now() });

  // Direct store access - no adapter
  const hasCompletedFirstDrop = useHasCompletedFirstDrop();
  const deleteNote = useGremlyStore((s) => s.deleteNote);
  const deleteTodo = useGremlyStore((s) => s.deleteTodo);
  const deleteHabit = useGremlyStore((s) => s.deleteHabit);
  const repo = useRepo();

  // Queue items from Zustand (driven by dropQueue.ts syncQueueToZustand)
  const queueItems = useGremlyStore((s) => s.queueItems);

  // Configure smooth layout animation when queue items content changes
  // This prevents jolt when Phase 1 data (smart titles) arrive for segments
  // BUT we skip animation when:
  // - Drops are just being removed (promoted to entity)
  // - A drop just became multi (bounce animation handles that)
  const prevPendingDropsVersionRef = React.useRef<string>('');
  const prevPendingDropsCountRef = React.useRef<number>(0);
  const prevMultiIdsRef = React.useRef<Set<string>>(new Set());
  React.useLayoutEffect(() => {
    const currentDrops = queueItems.filter((d) => d.phase !== 'complete' && d.phase !== 'failed');
    const currentCount = currentDrops.length;

    // Track which drops are multi
    const currentMultiIds = new Set(currentDrops.filter((d) => d.isMulti).map((d) => d.localId));

    // Check if any drop just became multi (bounce animation handles this)
    const newlyMulti = [...currentMultiIds].some((id) => !prevMultiIdsRef.current.has(id));

    // Create a "version" string based on segment count and titles
    // This detects meaningful changes that could affect card height
    const version = currentDrops
      .map(
        (d) =>
          `${d.localId}:${d.multiSegments?.length ?? 0}:${d.multiSegments?.[0]?.smart_title ?? ''}`,
      )
      .join('|');

    // Only animate if:
    const contentChanged = version !== prevPendingDropsVersionRef.current;
    const notInitialMount = prevPendingDropsVersionRef.current !== '';
    const notRemoval = currentCount >= prevPendingDropsCountRef.current;

    if (contentChanged && notInitialMount && notRemoval && !newlyMulti) {
      // console.log('[CatchAllNotepad] 🔄 Pending drops data changed, configuring layout animation');
      LayoutAnimation.configureNext({
        duration: 200,
        update: {
          type: LayoutAnimation.Types.easeInEaseOut,
          // Use opacity instead of scaleY to avoid conflict with bounce animation
          property: LayoutAnimation.Properties.opacity,
        },
      });
    }

    prevPendingDropsVersionRef.current = version;
    prevPendingDropsCountRef.current = currentCount;
    prevMultiIdsRef.current = currentMultiIds;
  }, [queueItems]);

  // Synchronous lookups from store
  const getItemById = React.useCallback(
    (id: string) => selectItemById(useGremlyStore.getState(), id),
    [],
  );

  const { c, mode: themeMode } = useTheme();
  const { userId } = useAuth();
  const styles = React.useMemo(() => makeStyles(c, themeMode), [c, themeMode]);

  const [open, setOpen] = React.useState(initiallyOpen); // open by default for inline confirmation
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<UnifiedDrop[]>([]);

  // Cards that are going (a yes cleared them, or they were ticked off, archived
  // or deleted): they slide away, then leave the list. A popup that is still
  // showing its confirmation holds them until it has gone (or asks for a
  // delay), so the slide is seen on its own. What they looked like is kept so
  // an Undo can slide them back in.
  const leavingRef = React.useRef<Set<string>>(new Set());
  // Drops whose card has gone from the list (archived, ticked off, split or
  // kept as one): never shown again as on their way in, though the queue may
  // still be finishing them (stage 7)
  const leftDropIds = React.useRef<Set<string>>(new Set());
  const [leavingIds, setLeavingIds] = React.useState<Set<string>>(() => new Set());
  const [returningIds, setReturningIds] = React.useState<Set<string>>(() => new Set());
  const leftSnapshots = React.useRef<Map<string, UnifiedDrop>>(new Map());
  const leaveTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  // How each card goes (stage 7), and where to, worked out as it starts going
  const leaveHowRef = React.useRef<Map<string, { as: CardLeaveAs['as']; into?: string }>>(
    new Map(),
  );
  const leaveAsRef = React.useRef<Map<string, CardLeaveAs>>(new Map());

  const startLeaving = React.useCallback(
    (ids: string[], delayMs = 0, hold = false, how?: { as?: CardLeaveAs['as']; into?: string }) => {
      ids.forEach((id) => {
        leavingRef.current.add(id);
        if (how?.as) leaveHowRef.current.set(id, { as: how.as, into: how.into });
      });
      // held: marked as going, so nothing else moves them, until told to go
      if (hold) return;
      const show = () => {
        ids.forEach((id) => {
          const want = leaveHowRef.current.get(id);
          if (!want) return;
          // into a card on the list: the distance to it now; a card that is not
          // on the list slides away (into) or fades (fold) where it is
          const from = cardTops.get(id);
          const to = want.into ? cardTops.get(want.into) : undefined;
          if (
            (want.as === 'into' || want.as === 'fold') &&
            (from === undefined || to === undefined)
          ) {
            leaveAsRef.current.set(id, { as: want.as === 'into' ? 'slide' : 'fade', dy: 0 });
          } else {
            leaveAsRef.current.set(id, { as: want.as, dy: (to ?? 0) - (from ?? 0) });
          }
        });
        setLeavingIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => leavingRef.current.has(id) && next.add(id));
          return next;
        });
      };
      if (delayMs > 0) leaveTimers.current.push(setTimeout(show, delayMs));
      else show();
    },
    [],
  );

  useEffect(() => {
    const timers = leaveTimers.current;
    const unsubLeaving = eventBus.on(
      'minddrop:cards_leaving',
      ({ ids, delayMs, hold, as, into }) => {
        startLeaving(ids, delayMs, hold, { as, into });
      },
    );
    const unsubGo = eventBus.on('minddrop:cards_go', ({ ids }) => {
      const still = ids.filter((id) => leavingRef.current.has(id));
      if (still.length) startLeaving(still);
    });
    const unsubStay = eventBus.on('minddrop:cards_stay', ({ ids }) => {
      ids.forEach((id) => {
        leavingRef.current.delete(id);
        leaveHowRef.current.delete(id);
        leaveAsRef.current.delete(id);
      });
      setLeavingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    });
    return () => {
      unsubLeaving();
      unsubGo();
      unsubStay();
      timers.forEach(clearTimeout);
    };
  }, [startLeaving]);

  const handleCardReturned = React.useCallback((id: string) => {
    setReturningIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleCardLeft = React.useCallback((id: string) => {
    leavingRef.current.delete(id);
    leaveHowRef.current.delete(id);
    leaveAsRef.current.delete(id);
    setLeavingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Only a card that really went leaves (a change that did not go through keeps it)
    const s = useGremlyStore.getState();
    const note = s.notes.find((n) => n.id === id) as any;
    const todo = s.todos.find((t) => t.id === id) as any;
    const habit = s.habits.find((h) => h.id === id) as any;
    const entity = note || todo || habit;
    const gone = !entity || entity.archived === true || (!!todo && !!todo.completed_at);
    if (!gone) return;
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) leftSnapshots.current.set(id, item);
      if (item?.drop_id) leftDropIds.current.add(item.drop_id);
      return prev.filter((i) => i.id !== id);
    });
  }, []);
  const [todayCount, setTodayCount] = React.useState(0); // Track today's drop count for toggle label
  const [olderCount, setOlderCount] = React.useState(0); // Track older drops count
  const [filter, setFilter] = React.useState<'today' | 'older'>('today'); // Filter selection
  const prevRefreshSignalRef = React.useRef(refreshSignal);
  const canonicalTypesOn = env.feature.canonicalTypes;

  // Animated chevron rotation
  const chevronRotation = useSharedValue(1); // 1 = expanded (pointing down), 0 = collapsed (pointing up)
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value * 180}deg` }],
  }));

  // Toggle open state with chevron animation
  const handleChevronPress = React.useCallback(() => {
    setOpen((v) => {
      const newOpen = !v;
      chevronRotation.value = withTiming(newOpen ? 1 : 0, { duration: 200 });
      return newOpen;
    });
  }, [chevronRotation]);

  // Show filter picker (Today / Older)
  const handleFilterPress = React.useCallback(() => {
    const options = ['Today', 'Older', 'Cancel'];
    const cancelButtonIndex = 2;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        title: 'Show drops from',
      },
      (buttonIndex) => {
        if (buttonIndex === 0) {
          setFilter('today');
        } else if (buttonIndex === 1) {
          setFilter('older');
        }
      },
    );
  }, []);

  // Transform queue items to UnifiedDrop array
  // Uses a ref-based cache keyed by QueuedDrop object reference to preserve
  // UnifiedDrop references for unchanged drops (prevents unnecessary re-renders)
  const prevDropMappingRef = React.useRef<Map<QueuedDrop, UnifiedDrop>>(new Map());

  // Drops whose saved item is already in the list (Mind Drop rethink stage 4:
  // a drop is saved at the sort, and from then its own item is its card)
  const savedDropIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) if (item.drop_id) ids.add(item.drop_id);
    return ids;
  }, [items]);

  const pendingItems = React.useMemo((): UnifiedDrop[] => {
    // its item is on the list, or was and has gone (a yes, a split or Keep as
    // one while the queue is still finishing it): either way no longer pending
    const seen = (dropId: string) => savedDropIds.has(dropId) || leftDropIds.current.has(dropId);
    const hasSavedItem = (drop: QueuedDrop) =>
      seen(drop.localId) || (drop.pieceRows ?? []).some((piece) => seen(piece.dropId));
    const activeDrops = queueItems.filter(
      (drop) =>
        drop.phase !== 'complete' &&
        drop.phase !== 'failed' &&
        // saved (isDropSaved in dropQueue.ts) and its item is in the list
        !((!!drop.supabaseId || !!drop.pieceRows?.length) && hasSavedItem(drop)),
    );

    const newMapping = new Map<QueuedDrop, UnifiedDrop>();

    const result = activeDrops
      .map((drop): UnifiedDrop => {
        // If the QueuedDrop reference is the same, reuse the old UnifiedDrop
        const cached = prevDropMappingRef.current.get(drop);
        if (cached) {
          newMapping.set(drop, cached);
          return cached;
        }

        // QueuedDrop changed — create new UnifiedDrop
        // An unsure split sorts as the kind it is saved as (stage 4)
        const sortedAs =
          drop.isMulti && drop.split !== 'clear'
            ? (drop.asOne ?? { bucket: 'log' as const, subtype: 'general' as const })
            : { bucket: drop.bucket, subtype: drop.subtype };
        const kind: 'todo' | 'habit' | 'note' =
          sortedAs.bucket === 'todo' ? 'todo' : sortedAs.bucket === 'habit' ? 'habit' : 'note';

        const noteSubtype =
          kind === 'note'
            ? sortedAs.subtype === 'journal'
              ? 'journal'
              : sortedAs.subtype === 'idea'
                ? 'idea'
                : sortedAs.subtype === 'event'
                  ? 'event'
                  : 'catchall'
            : undefined;

        const hasEnrichmentFields = !!drop.smartTitle || !!drop.confirmationMessage;

        const minddropStage =
          !drop.phase || drop.phase === 'queued'
            ? 'pending'
            : drop.phase === 'sorted'
              ? hasEnrichmentFields
                ? 'streaming'
                : 'enriching'
              : drop.phase === 'saved'
                ? 'streaming'
                : drop.phase === 'classified' && hasEnrichmentFields
                  ? 'streaming'
                  : drop.phase === 'classified'
                    ? 'enriching'
                    : drop.phase === 'titled'
                      ? 'streaming'
                      : drop.phase === 'enriched'
                        ? 'enriched'
                        : drop.phase === 'multi_detected'
                          ? 'classifying'
                          : drop.phase === 'multi_awaiting'
                            ? 'enriching'
                            : drop.phase === 'failed'
                              ? 'enrichment_failed'
                              : 'pending';

        const bucketConfirmed = !!drop.bucket && drop.phase !== 'queued';

        // The title once the title call has answered, else the words as typed;
        // the card wraps rather than cutting either
        const displayTitle = drop.smartTitle || drop.text;

        const unified: UnifiedDrop = {
          id: drop.localId,
          kind,
          title: displayTitle,
          text: drop.text,
          created_at: drop.createdAt,
          drop_id: drop.localId,
          noteSubtype,
          tags: drop.tags || [],
          labels: [],
          due_date: drop.extractedDate ?? null,
          due_day: drop.extractedDate?.split('T')[0] ?? null,
          views: {
            ai_pending: true,
            minddrop_stage: minddropStage,
            confirmation_message: drop.confirmationMessage,
            people: drop.people,
            chip_data_ready: drop.phase === 'enriched',
            bucket_confirmed: bucketConfirmed,
            // A drop with several things in it is sorted into one item that asks,
            // or its pieces (stage 4); the old split modal is for older notes only
            is_multi: false,
            needs_clarification: drop.needsClarification,
            clarification_type: drop.clarificationType,
            clarification_question: drop.clarificationQuestion,
            clarification_options: drop.clarificationOptions,
            clarification_resolved: false,
            // "Is this one you already have?" once the pipeline has asked (dropRelation.ts)
            relation: drop.relation ?? undefined,
            // a clear split: the card gives way to its pieces, which come out of it
            unzips: drop.isMulti === true && drop.split === 'clear',
          },
          time_estimate_minutes: drop.timeEstimateMinutes ?? null,
          frequency: drop.extractedFrequency ?? null,
          days_active: drop.extractedDays ?? null,
          mood: drop.mood ? (drop.mood as any) : null,
          is_multi: false,
        };

        newMapping.set(drop, unified);
        return unified;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    prevDropMappingRef.current = newMapping;
    return result;
  }, [queueItems, savedDropIds]);

  // Get drop_ids of all pending items to filter out duplicates from real items
  const pendingDropIds = React.useMemo(() => {
    return new Set(pendingItems.map((p) => p.drop_id).filter(Boolean));
  }, [pendingItems]);

  // Filter real items to exclude any that still have a pending version
  // This prevents the "jolt" when a pending item is promoted to a real entity.
  // A clear split's pieces (drop id split-<localId>-<index>) wait for their
  // parent's card to go, so the drop never shows twice.
  // A card split with Split on its card keeps its place until it has gone; its
  // pieces come out of it then (stage 7).
  const filteredItems = React.useMemo(() => {
    const splitPrefixes = [...pendingDropIds].map((id) => `split-${id}-`);
    return withoutPiecesOfCardsOnList(items, (item) => leavingRef.current.has(item.id)).filter(
      (item) =>
        !item.drop_id ||
        (!pendingDropIds.has(item.drop_id) &&
          !splitPrefixes.some((prefix) => item.drop_id!.startsWith(prefix))),
    );
    // leavingIds: a held card that stays (cards_stay) lets a kept note show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pendingDropIds, leavingIds]);

  // Memoized combined list: merge pending + real items, sort, deduplicate.
  // Uses original object references (no spread) so React.memo on cards stays effective.
  // A split's pieces stay together, in their order, where the drop was, and the
  // note a split was kept as takes their place (stage 7).
  const { combinedItems, pendingIdSet } = React.useMemo(() => {
    const pending = new Set(pendingItems.map((p) => p.drop_id || p.id));
    const merged = orderDropList([...pendingItems, ...filteredItems]);
    // Defensive deduplication: prefer first occurrence (pending before real)
    const seen = new Set<string>();
    const deduped = merged.filter((item) => {
      const key = item.drop_id || `${item.kind}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { combinedItems: deduped, pendingIdSet: pending };
  }, [pendingItems, filteredItems]);

  // Split into 3 and Keep as one, under a clear split's pieces while they are
  // the newest cards and all still there (stage 7)
  const splitBar = React.useMemo(
    () =>
      filter === 'today'
        ? splitBarFor(
            combinedItems,
            (item) => pendingIdSet.has(item.drop_id || item.id),
            (item) => leavingIds.has(item.id),
          )
        : null,
    [combinedItems, filter, pendingIdSet, leavingIds],
  );

  // Where a drop lives (stage 9): a tap on the place opens the picker; the
  // person's choice is theirs, and filing never moves it again
  const [placeFor, setPlaceFor] = React.useState<{
    id: string;
    kind: 'todo' | 'habit' | 'note';
    was: 'chapter' | 'world' | null;
  } | null>(null);
  const handlePlace = React.useCallback((item: UnifiedDrop) => {
    const s = useGremlyStore.getState();
    const was =
      dropPlaceOf(item.id, {
        worldLinks: s.dropWorldLinks,
        chapterLinks: s.dropChapterLinks,
        worlds: s.worlds,
        chapters: s.chapters,
      })?.kind ?? null;
    setPlaceFor({ id: item.id, kind: item.kind, was });
  }, []);

  // "Talk it through with Gremly" on the newest drop (rules in talkItemIdFor)
  const inTraining = useNeedsMindDropTutorial();
  const [talkClock, setTalkClock] = React.useState(0);
  const talkItemId = React.useMemo(
    () =>
      filter === 'today'
        ? talkItemIdFor(combinedItems, {
            pendingIds: pendingIdSet,
            nowMs: getDateService().now().getTime(),
            inTraining,
            used: talkUsedIds,
          })
        : null,
    // talkClock re-checks when the window ends or the link is used
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combinedItems, pendingIdSet, filter, inTraining, talkClock],
  );
  const talkItemCreatedAt = talkItemId ? combinedItems[0]?.created_at : null;
  React.useEffect(() => {
    if (!talkItemCreatedAt) return;
    const endsIn =
      new Date(talkItemCreatedAt).getTime() + TALK_WINDOW_MS - getDateService().now().getTime();
    const timer = setTimeout(() => setTalkClock((n) => n + 1), Math.max(endsIn, 0) + 250);
    return () => clearTimeout(timer);
  }, [talkItemCreatedAt]);
  // Opens the Chat page with this drop attached and Gremly's opener; nothing
  // is sent (and nothing costs) until the user replies
  const handleTalk = React.useCallback((drop: UnifiedDrop) => {
    talkUsedIds.add(drop.id);
    setTalkClock((n) => n + 1);
    const title = String(drop.title || drop.text || '').trim();
    if (!title) return;
    eventBus.emit('minddrop:talk_about', {
      id: drop.id,
      type: drop.kind,
      title,
      label: getDisplayKindForChip(drop.kind, drop),
    });
  }, []);

  /**
   * Helper to merge a DB record into the local items state
   * Used when real-time updates arrive from Supabase
   */
  const mergeDbRecordIntoItems = React.useCallback(
    (prev: UnifiedDrop[], record: any, kind: 'todo' | 'habit' | 'note'): UnifiedDrop[] => {
      if (!record?.id) return prev;

      // If the record is archived (note) or completed (todo/habit), remove it from the list;
      // a card already going (a yes, a split, Keep as one) leaves when its motion ends
      if (kind === 'note' && record.archived === true) {
        if (leavingRef.current.has(record.id)) return prev;
        const gone = prev.find((item) => item.id === record.id);
        if (gone?.drop_id) leftDropIds.current.add(gone.drop_id);
        return prev.filter((item) => item.id !== record.id);
      }

      // Check if this is a new item we don't have yet
      const existingIndex = prev.findIndex((item) => item.id === record.id && item.kind === kind);

      if (existingIndex === -1) {
        // New item - add it to the list
        const newItem: UnifiedDrop = {
          id: record.id,
          kind,
          title: record.title ?? record.name ?? '',
          text: record.body ?? record.name ?? record.title ?? '',
          created_at: record.created_at,
          drop_id: record.drop_id ?? null,
          tags: Array.isArray(record.tags) ? record.tags : [],
          views: record.views ?? {},
          labels: Array.isArray(record.labels) ? record.labels : [],
          due_date: record.due_date ?? null,
          due_day: record.due_day ?? null,
          due_time: record.due_time ?? null,
          target_date: record.target_date ?? null,
          scheduled_date: record.scheduled_date ?? null,
          event_time: record.event_time ?? record.views?.event_time ?? null,
          start_date: record.start_date ?? null,
          time_window: record.time_window ?? null,
          mood: record.mood ?? null,
          noteSubtype: kind === 'note' ? (record.subtype ?? 'catchall') : undefined,
          canonical_type: record.canonical_type ?? null,
          days_active: Array.isArray(record.days_active) ? record.days_active : null,
          time_estimate_minutes: record.time_estimate_minutes ?? null,
          // Habit frequency fields
          frequency: record.frequency ?? null,
          cadence: record.cadence ?? null,
          target_per_period: record.target_per_period ?? null,
          // Reminders (Supabase column is reminders_json, TS field is reminders)
          reminders: record.reminders ?? record.reminders_json ?? null,
          // Multi-entity support: extract from views to top level
          is_multi: record.views?.is_multi === true,
        };
        return [newItem, ...prev];
      }

      // Existing item - update it
      return prev.map((item) => {
        if (item.id !== record.id || item.kind !== kind) return item;

        // Capture all Phase 2 enrichment fields
        const views = (record as any).views ?? item.views ?? {};
        const title = (record as any).title ?? (record as any).name ?? item.title;
        const tags = Array.isArray((record as any).tags)
          ? (record as any).tags.filter((t: unknown) => typeof t === 'string')
          : (item.tags ?? []);
        const dueDate = (record as any).due_date ?? item.due_date ?? null;
        const dueDay = (record as any).due_day ?? item.due_day ?? null;

        // console.debug('[RecentDrops] Merging Phase 2 update', {
        //   id: record.id,
        //   oldTitle: item.title?.substring(0, 20),
        //   newTitle: title?.substring(0, 20),
        //   oldTags: item.tags?.length ?? 0,
        //   newTags: tags.length,
        //   stage: views.minddrop_stage,
        // });

        return {
          ...item,
          title,
          tags,
          views,
          due_date: dueDate,
          due_day: dueDay,
          // the card's meta line follows the row (Mind Drop rethink stage 5)
          due_time: 'due_time' in record ? record.due_time : item.due_time,
          target_date: 'target_date' in record ? record.target_date : item.target_date,
          scheduled_date: 'scheduled_date' in record ? record.scheduled_date : item.scheduled_date,
          event_time: 'event_time' in record ? record.event_time : item.event_time,
          start_date: 'start_date' in record ? record.start_date : item.start_date,
          time_window: 'time_window' in record ? record.time_window : item.time_window,
          mood: 'mood' in record ? record.mood : item.mood,
          drop_id: (record as any).drop_id ?? item.drop_id ?? null,
          archived: (record as any).archived ?? item.archived ?? false,
          labels: Array.isArray((record as any).labels)
            ? (record as any).labels
            : (item.labels ?? []),
          noteSubtype:
            kind === 'note'
              ? ((record as any).subtype ?? item.noteSubtype ?? 'catchall')
              : item.noteSubtype,
          canonical_type: (record as any).canonical_type ?? item.canonical_type ?? null,
          days_active: Array.isArray((record as any).days_active)
            ? (record as any).days_active
            : (item.days_active ?? null),
          time_estimate_minutes:
            (record as any).time_estimate_minutes ?? item.time_estimate_minutes ?? null,
          // Habit frequency fields - use record value if present, else preserve existing
          frequency: (record as any).frequency ?? item.frequency ?? null,
          cadence: (record as any).cadence ?? item.cadence ?? null,
          target_per_period: (record as any).target_per_period ?? item.target_per_period ?? null,
          // Multi-entity support: extract from views to top level
          is_multi: views?.is_multi === true,
          // Clarification fields - CRITICAL for removing the Clarify chip after resolution
          needs_clarification:
            (record as any).needs_clarification ??
            views?.needs_clarification ??
            item.needs_clarification ??
            false,
          clarification_resolved:
            (record as any).clarification_resolved ??
            views?.clarification_resolved ??
            item.clarification_resolved ??
            false,
          clarification_question:
            (record as any).clarification_question ??
            views?.clarification_question ??
            item.clarification_question ??
            undefined,
          clarification_options:
            (record as any).clarification_options ??
            views?.clarification_options ??
            item.clarification_options ??
            undefined,
          clarification_type:
            (record as any).clarification_type ??
            views?.clarification_type ??
            item.clarification_type ??
            undefined,
          // Reminders (Supabase column is reminders_json, TS field is reminders)
          reminders:
            (record as any).reminders ?? (record as any).reminders_json ?? item.reminders ?? null,
        };
      });
    },
    [],
  );

  /**
   * Load recent Mind Drops for the Catch-All / Recent Mind Drops list
   *
   * Mind Drop v3 Architecture:
   * - Catch-All = "Raw + in-flight Mind Drops" (pending/classified stage)
   * - Today/Habits/Logs = "Final destinations for converted drops" (prefilled stage)
   *
   * Filter Behavior:
   * - v3: Shows only pending/in-flight notes (not fully processed canonical entities)
   * - v2: Shows all Mind Drop items (notes, todos, habits) regardless of stage
   *
   * This prevents duplication: once a Mind Drop is converted to a canonical todo/habit,
   * it appears only in Today/Habits/Logs, not in Catch-All.
   */
  const load = React.useCallback(async () => {
    const isTest = process.env.JEST_WORKAROUND === '1';
    if (!isTest) setLoading(true);
    try {
      // Synchronous access from store - no async needed
      const state = useGremlyStore.getState();
      const notes = selectRecentNotes(state, 50);
      const todos = selectRecentTodos(state, 50);
      const habits = selectRecentHabits(state, 50);

      // Time boundaries for filtering
      const start = getDateService().startOfRitualDay();
      const todayCutoff = start.getTime();

      // 3 days ago at start of day (for "Show older" toggle)
      const threeDaysAgo = getDateService().dayNow();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);
      const olderCutoff = threeDaysAgo.getTime();

      const toTagList = (raw: unknown): string[] => {
        if (!Array.isArray(raw)) return [];
        return raw
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter((tag) => tag.length > 0);
      };

      // DEDUPLICATION RULE: One row per drop_id, prefer canonical items over unsorted notes
      // When an unsorted note is converted to a habit/todo/log:
      // - The original note is archived (archived=true)
      // - A new canonical item (habit/todo/note with canonicalType) is created with same drop_id
      // - We filter out archived notes and dedupe by drop_id, keeping canonical items

      // DEBUG: Log notes with views before mapping (disabled to reduce Metro noise)
      // (Array.isArray(notes) ? notes : []).forEach((note) => {
      //   const noteAny = note as any;
      //   if (noteAny?.views?.is_multi || noteAny?.title?.includes('Call Mom + Quit')) {
      //     console.log('[DEBUG:NoteMapping]', {
      //       id: noteAny.id,
      //       title: noteAny.title?.substring(0, 30),
      //       has_views: !!noteAny.views,
      //       views_keys: noteAny.views ? Object.keys(noteAny.views) : [],
      //       is_multi: noteAny.views?.is_multi,
      //     });
      //   }
      // });

      const noteDrops: UnifiedDrop[] = (Array.isArray(notes) ? notes : [])
        .filter((n) => {
          // Show ALL recent notes regardless of origin (Mind Drop, Space chat, manual add, etc.)
          // Exclude archived notes (converted unsorted notes)
          if (n?.archived === true) return false;

          return true;
        })
        .map((n) => {
          const labels = Array.isArray(n?.labels) ? n.labels : [];
          const unsorted = labels.includes(UNSORTED_LABEL);
          const rawSubtype = typeof n?.subtype === 'string' ? n.subtype : null;
          // Default to 'catchall' for all Mind Drop notes - ensures they display as "log" not "unsorted"
          const noteSubtype = rawSubtype ?? 'catchall';
          const noteAny = n as any;
          const rawText = n.body || n.title || noteAny.text || noteAny.content || '';
          // The card shows the saved title as it is (Mind Drop rethink stage 5):
          // no words cut or dropped on the way to the screen

          return {
            id: n.id,
            kind: 'note' as const,
            title: (n.title || '').trim() || rawText || 'Untitled note',
            text: n.body || n.title || noteAny.text || noteAny.content || '',
            created_at: n.created_at,
            unsorted,
            noteSubtype,
            tags: toTagList(noteAny?.tags),
            drop_id: noteAny?.drop_id ?? null,
            archived: n?.archived === true,
            canonical_type: noteAny?.canonical_type ?? null,
            labels: Array.isArray(noteAny?.labels) ? noteAny.labels : [],
            views: noteAny?.views ?? {},
            hasPhotos: noteAny?.views?.has_photos === true,
            mood: noteAny?.mood ?? null,
            reminders: noteAny?.reminders ?? null,
            // Date Intelligence fields (for notes with event dates)
            target_date: noteAny?.target_date ?? null,
            event_time: noteAny?.event_time ?? noteAny?.views?.event_time ?? null,
            // Multi-entity support: extract from views to top level
            is_multi: noteAny?.views?.is_multi === true,
          };
        });

      const todoDrops: UnifiedDrop[] = (Array.isArray(todos) ? todos : [])
        .filter((t) => {
          // Show ALL recent todos regardless of origin (Mind Drop, Space chat, manual add, etc.)
          // Exclude completed todos
          if ((t as any)?.completed_at) return false;

          // Exclude archived todos
          if ((t as any)?.status === 'archived') return false;

          return true;
        })
        .map((t) => {
          const rawText = t.name || t.title || '';
          return {
            id: t.id,
            kind: 'todo' as const,
            title: rawText.trim() || 'Untitled',
            text: (t as any).body || rawText,
            created_at: t.created_at,
            due_date: t.due_date ?? null,
            due_day: (t as any).due_day ?? null,
            due_time: (t as any).due_time ?? null,
            // Date Intelligence fields
            target_date: (t as any).target_date ?? null,
            scheduled_date: (t as any).scheduled_date ?? null,
            date_type_ambiguous: (t as any).date_type_ambiguous ?? false,
            tags: toTagList((t as any)?.tags),
            drop_id: (t as any)?.drop_id ?? null,
            canonical_type: (t as any)?.canonical_type ?? null,
            labels: Array.isArray((t as any)?.labels) ? (t as any).labels : [],
            views: (t as any)?.views ?? {},
            time_estimate_minutes: (t as any)?.time_estimate_minutes ?? null,
            reminders: (t as any)?.reminders ?? null,
          };
        });

      const habitDrops: UnifiedDrop[] = (Array.isArray(habits) ? habits : [])
        .filter((h) => {
          // Show ALL recent habits regardless of origin (Mind Drop, Space chat, manual add, etc.)
          // Exclude completed habits
          if ((h as any)?.completed_at) return false;

          // Exclude archived habits
          if ((h as any)?.archived === true) return false;

          return true;
        })
        .map((h) => {
          const rawText = h.name || '';
          return {
            id: h.id,
            kind: 'habit' as const,
            title: rawText.trim() || 'Untitled',
            text: (h as any).notes || rawText,
            created_at: h.created_at,
            frequency: h.frequency ?? null,
            cadence: (h as any)?.cadence ?? null,
            target_per_period: (h as any)?.target_per_period ?? null,
            tags: toTagList((h as any)?.tags),
            drop_id: (h as any)?.drop_id ?? null,
            canonical_type: (h as any)?.canonical_type ?? null,
            labels: Array.isArray((h as any)?.labels) ? (h as any).labels : [],
            views: (h as any)?.views ?? {},
            start_date: (h as any)?.start_date ?? null,
            days_active: (h as any)?.days_active ?? null,
            time_window: (h as any)?.time_window ?? null,
            time_estimate_minutes: (h as any)?.time_estimate_minutes ?? null,
            reminders: (h as any)?.reminders ?? null,
          };
        });

      // Merge all drops, filter valid items
      let unified = [...noteDrops, ...todoDrops, ...habitDrops].filter(
        (i) => i.text && i.created_at,
      );

      // DEDUPLICATION: Group by drop_id and prefer canonical items (habit/todo) over unsorted notes
      // This ensures that when an unsorted note is converted to a habit, we only show the habit
      const dropIdMap = new Map<string, UnifiedDrop>();
      const noDropIdItems: UnifiedDrop[] = [];

      for (const item of unified) {
        if (!item.drop_id) {
          // No drop_id: keep as-is (shouldn't happen for Mind Drop items, but be safe)
          noDropIdItems.push(item);
          continue;
        }

        const existing = dropIdMap.get(item.drop_id);
        if (!existing) {
          // First item with this drop_id
          dropIdMap.set(item.drop_id, item);
          continue;
        }

        // Conflict: prefer canonical items (habit/todo) over unsorted notes
        // Priority: habit > todo > note (non-unsorted) > note (unsorted/catchall)
        // A note is considered "unsorted" if:
        // - unsorted === true (has 'needs_review' label), OR
        // - noteSubtype === 'catchall', OR
        // - labels includes 'needs_review' or 'catchall'
        const isUnsortedNote = (drop: UnifiedDrop) =>
          drop.kind === 'note' &&
          (drop.unsorted === true ||
            drop.noteSubtype === 'catchall' ||
            (Array.isArray(drop.labels) &&
              (drop.labels.includes('needs_review') || drop.labels.includes('catchall'))));

        const getPriority = (drop: UnifiedDrop): number => {
          if (drop.kind === 'habit') return 3;
          if (drop.kind === 'todo') return 2;
          if (drop.kind === 'note' && !isUnsortedNote(drop)) return 1;
          return 0; // unsorted/catchall notes have lowest priority
        };

        const itemPriority = getPriority(item);
        const existingPriority = getPriority(existing);

        if (itemPriority > existingPriority) {
          // Replace with higher-priority item
          dropIdMap.set(item.drop_id, item);
        }
        // Otherwise keep existing (it has higher or equal priority)
      }

      // Combine deduplicated items with no-drop-id items
      unified = [...Array.from(dropIdMap.values()), ...noDropIdItems];

      // console.debug('[MindDrop.UI] Unified items after dedup', {
      //   count: unified.length,
      //   items: unified.map((i) => ({
      //     id: i.id,
      //     kind: i.kind,
      //     title: i.title?.substring(0, 30),
      //     drop_id: i.drop_id,
      //     due_date: (i as any).due_date,
      //     space_id: (i as any).space_id,
      //   })),
      // });

      // Calculate today count before any filtering
      const todayItems = unified.filter((i) => {
        const ts = new Date(i.created_at).getTime();
        return Number.isFinite(ts) && ts >= todayCutoff; // "Today"
      });

      // Calculate older items (last 3 days, excluding today)
      const olderItems = unified.filter((i) => {
        const ts = new Date(i.created_at).getTime();
        return Number.isFinite(ts) && ts >= olderCutoff && ts < todayCutoff;
      });

      // Filter based on selection
      if (filter === 'today') {
        unified = todayItems;
      } else {
        unified = olderItems;
      }

      unified = unified
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 25); // keep snappy; scroll handles overflow

      setItems(unified);
      setTodayCount(todayItems.length); // Update today count for toggle label
      setOlderCount(olderItems.length); // Update older count for toggle label

      // Log loaded items with their visual states for debugging
      const visualStates = unified.map((item) => ({
        id: item.id,
        kind: item.kind,
        drop_id: item.drop_id,
        visualState: getMindDropVisualState(item),
      }));
      // console.debug('[RecentDrops] Loaded items:', {
      //   total: unified.length,
      //   pending: visualStates.filter((s) => s.visualState === 'pending').length,
      //   complete: visualStates.filter((s) => s.visualState === 'complete').length,
      //   failed: visualStates.filter((s) => s.visualState === 'failed').length,
      // });
      void visualStates; // Suppress unused variable warning

      // Note: Pending items now come from Zustand pendingDrops - auto-cleanup is handled by the store

      // Notify parent of today count (for "X thoughts organized today" counter)
      // This ensures the counter always matches the actual number of items in Today section
      onTodayCountChange?.(todayItems.length);

      // Notify parent of both counts for empty state logic
      onDropCountsChange?.(todayItems.length, olderItems.length);
    } finally {
      if (!isTest) setLoading(false);
    }
  }, [filter, onTodayCountChange, onDropCountsChange]);

  useEffect(() => {
    // Reset to 'today' view when refresh signal changes (new drop added)
    // This ensures users see their newly added drop
    if (
      typeof refreshSignal === 'number' &&
      refreshSignal > 0 &&
      refreshSignal !== prevRefreshSignalRef.current
    ) {
      setFilter('today');
      prevRefreshSignalRef.current = refreshSignal;
    }
    void load();
  }, [load, refreshSignal]);

  useLayoutEffect(() => {
    if (eagerLoad) void load();
  }, [eagerLoad, load]);

  // Listen for overlay saves and optimistically update the due_date for todos
  useEffect(() => {
    const unsub = addOverlaySavedListener((payload) => {
      if (payload.type === 'todo' && payload.savedEntity?.due_at !== undefined) {
        setItems((prevItems) =>
          prevItems.map((item) => {
            if (item.kind === 'todo' && item.id === payload.id) {
              return {
                ...item,
                due_date: payload.savedEntity?.due_at ?? null,
              };
            }
            return item;
          }),
        );
      }
      // Always reload to catch any other changes
      void load();
    });
    return unsub;
  }, [load]);

  // Real-time subscription for Mind Drop items (Stage A/B enrichment)
  useEffect(() => {
    if (!userId) return;

    // console.debug('[RecentDrops] Setting up real-time subscriptions for userId:', userId);

    // Subscribe to todos, habits, and notes for Mind Drop origin items
    const todosChannel = supabase
      .channel('minddrop-todos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'todos',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as any;
          if (!record || record.origin !== 'catchall') return;

          // console.debug('[RecentDrops] Todos DB update:', {
          //   event: payload.eventType,
          //   id: record.id,
          //   drop_id: record.drop_id,
          //   views: record.views ?? null,
          // });

          // Merge into items list - pending drops are managed by Zustand pendingDrops
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'todo'));
        },
      )
      .subscribe();

    const habitsChannel = supabase
      .channel('minddrop-habits')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'habits',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as any;
          if (!record || record.origin !== 'catchall') return;

          // console.debug('[RecentDrops] Habits DB update:', {
          //   event: payload.eventType,
          //   id: record.id,
          //   drop_id: record.drop_id,
          //   views: record.views ?? null,
          // });

          // Merge into items list - pending drops are managed by Zustand pendingDrops
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'habit'));
        },
      )
      .subscribe();

    const notesChannel = supabase
      .channel('minddrop-notes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `owner_id=eq.${userId}`,
        },
        (payload) => {
          const record = payload.new as any;
          if (!record || record.origin !== 'catchall') return;

          // console.debug('[RecentDrops] Notes DB update:', {
          //   event: payload.eventType,
          //   id: record.id,
          //   drop_id: record.drop_id,
          //   views: record.views ?? null,
          // });

          // Merge into items list - pending drops are managed by Zustand pendingDrops
          setItems((prev) => mergeDbRecordIntoItems(prev, record, 'note'));
        },
      )
      .subscribe();

    return () => {
      // console.debug('[RecentDrops] Cleaning up real-time subscriptions');
      void todosChannel.unsubscribe();
      void habitsChannel.unsubscribe();
      void notesChannel.unsubscribe();
    };
  }, [userId, load, mergeDbRecordIntoItems]);

  // Listen for entity:deleted events from overlay and immediately remove from list
  useEffect(() => {
    const unsubscribe = eventBus.on(
      'entity:deleted',
      (event: { id: string; type?: string; spaceId?: string | null; source?: string }) => {
        // console.log('[RecentDrops] entity:deleted event:', {
        //   id: event.id,
        //   type: event.type,
        //   source: event.source,
        // });
        // A card on screen slides away; a clarification that turns it into
        // another kind replaces it in place, so that one goes at once
        if (leavingRef.current.has(event.id)) return;
        if (event.source !== 'clarification-bucket-change') {
          startLeaving([event.id]);
          return;
        }
        // Remove the item immediately from local state
        setItems((prev) => {
          const filtered = prev.filter((item) => item.id !== event.id);
          // console.log('[RecentDrops] Removed item from list, remaining:', filtered.length);
          return filtered;
        });
        // Note: Pending items are managed by Zustand pendingDrops - no cleanup needed here
      },
    );

    const unsubEntityCreated = eventBus.on(
      'entity:created',
      (payload: { entity: any; type: string; spaceId?: string | null; source?: string }) => {
        const dropId = payload.entity?.drop_id;
        // A card still sliding away for this drop gives way to its replacement
        if (dropId) {
          setItems((prev) => {
            const stale = prev.filter(
              (item) =>
                item.drop_id === dropId &&
                item.id !== payload.entity?.id &&
                leavingRef.current.has(item.id),
            );
            if (!stale.length) return prev;
            stale.forEach((item) => leavingRef.current.delete(item.id));
            return prev.filter((item) => !stale.includes(item));
          });
        }
        // console.log('[CatchAllNotepad] entity:created received', {
        //   dropId,
        //   type: payload.type,
        //   entityId: payload.entity?.id,
        //   source: payload.source,
        //   title: payload.entity?.title ?? payload.entity?.name,
        // });

        // DEBUG: Log multi-entity note details (disabled to reduce Metro noise)
        // if (payload.type === 'note') {
        //   console.log('[DEBUG:EntityCreated:Note]', {
        //     entityId: payload.entity?.id,
        //     has_views: !!payload.entity?.views,
        //     views_is_multi: payload.entity?.views?.is_multi,
        //     views_keys: payload.entity?.views ? Object.keys(payload.entity.views) : [],
        //   });
        // }

        // Merge entity into items list - pending drops are managed by Zustand pendingDrops
        if (dropId && payload.entity) {
          const entityType = payload.type as 'todo' | 'habit' | 'note';
          const entity = payload.entity;

          // Mark this drop as recently promoted to skip Layout animation jolt
          markDropAsRecentlyPromoted(dropId);

          const realItem: UnifiedDrop = {
            id: entity.id,
            kind: entityType,
            title: entity.title ?? entity.name ?? '',
            text: entity.body ?? entity.name ?? entity.title ?? '',
            created_at: entity.created_at,
            drop_id: dropId,
            tags: Array.isArray(entity.tags) ? entity.tags : [],
            views: entity.views ?? { minddrop_stage: 'classified', ai_pending: true },
            labels: Array.isArray(entity.labels) ? entity.labels : [],
            due_date: entity.due_date ?? entity.due_at ?? null,
            due_day: entity.due_day ?? null,
            due_time: entity.due_time ?? null,
            target_date: entity.target_date ?? null,
            scheduled_date: entity.scheduled_date ?? null,
            time_window: entity.time_window ?? null,
            event_time: entity.event_time ?? entity.views?.event_time ?? null,
            noteSubtype: entityType === 'note' ? (entity.subtype ?? 'catchall') : undefined,
            mood: entityType === 'note' ? (entity.mood ?? null) : undefined,
            time_estimate_minutes: entity.time_estimate_minutes ?? null,
            // Habit frequency fields
            frequency: entity.frequency ?? null,
            cadence: entity.cadence ?? null,
            target_per_period: entity.target_per_period ?? null,
            days_active: entity.days_active ?? null,
            start_date: entity.start_date ?? null,
            // Reminders (may come from store as reminders or DB as reminders_json)
            reminders: entity.reminders ?? entity.reminders_json ?? null,
            // Multi-entity support: extract from views to top level
            is_multi: entity.views?.is_multi === true,
          };

          // console.log('[CatchAllNotepad] Adding new entity to items list', {
          //   entityId: realItem.id,
          //   kind: realItem.kind,
          //   title: realItem.title,
          //   drop_id: realItem.drop_id,
          // });

          // Merge into items - pending drops will be automatically removed from Zustand when synced
          setItems((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === realItem.id);
            if (existingIndex >= 0) {
              // console.log('[CatchAllNotepad] Updating existing item at index', existingIndex);
              const updated = [...prev];
              updated[existingIndex] = realItem;
              return updated;
            }
            // console.log(
            //   '[CatchAllNotepad] Prepending new item to list, total items:',
            //   prev.length + 1,
            // );
            return [realItem, ...prev];
          });
        }
      },
    );

    // Listen for Phase 2 enrichment completion to update card smoothly
    const unsubEntityEnriched = eventBus.on('entity:enriched', (payload) => {
      // console.debug('[RecentDrops] entity:enriched received', payload);

      // Update the item in local state immediately for smooth card update
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== payload.entityId) return item;
          return {
            ...item,
            title: payload.smartTitle,
            tags: payload.tags,
            due_date: payload.dueDate ?? item.due_date,
            frequency: payload.frequency ?? item.frequency,
            // Date Intelligence: target_date for deadline/event context
            target_date: payload.targetDate ?? item.target_date,
            scheduled_date: payload.scheduledDate ?? item.scheduled_date,
            // Canonical frequency fields (SINGLE SOURCE OF TRUTH for display)
            ...(payload.cadence !== undefined && { cadence: payload.cadence }),
            ...(payload.target_per_period !== undefined && {
              target_per_period: payload.target_per_period,
            }),
            // Days active from extracted_days (for habit day-specific scheduling)
            ...(payload.extracted_days !== undefined && { days_active: payload.extracted_days }),
            hasPhotos: payload.hasPhotos ?? item.hasPhotos,
            time_estimate_minutes: payload.timeEstimate ?? item.time_estimate_minutes,
            start_date: payload.startDate ?? item.start_date,
            // Mood for journal entries (multi-select array)
            ...(payload.mood !== undefined && { mood: payload.mood as Mood[] | null }),
            views: {
              ...item.views,
              minddrop_stage: 'enriched',
              ai_pending: false,
              confirmation_message: payload.confirmationMessage ?? item.views?.confirmation_message,
              people: payload.people ?? item.views?.people,
              // Date Intelligence in views as backup
              target_date: payload.targetDate ?? item.views?.target_date,
              scheduled_date: payload.scheduledDate ?? item.views?.scheduled_date,
              date_type_ambiguous: payload.dateTypeAmbiguous ?? item.views?.date_type_ambiguous,
            },
          };
        }),
      );
    });

    // Listen for Phase 2 streaming field updates for progressive UI
    const unsubFieldUpdated = eventBus.on('entity:field_updated', (payload) => {
      const { entityId, field, value } = payload;
      // console.log('🔵 [RecentDrops] entity:field_updated received', { entityId, field, value });

      setItems((prev) => {
        const matchingItem = prev.find((item) => item.id === entityId);
        // console.log('🔵 [RecentDrops] Found matching item?', !!matchingItem, matchingItem?.id);
        void matchingItem; // Suppress unused warning

        return prev.map((item) => {
          if (item.id !== entityId) return item;

          // Update the specific field that changed
          if (field === 'smart_title') {
            // console.log('🔴 UPDATING TITLE IN STATE:', value);
            return { ...item, title: value };
          }
          if (field === 'confirmation_message') {
            // console.log('🟡 UPDATING CONFIRMATION IN STATE:', value);
            return {
              ...item,
              views: { ...item.views, confirmation_message: value },
            };
          }
          if (field === 'tags') {
            // console.log('🟢 UPDATING TAGS IN STATE:', value);
            return { ...item, tags: value };
          }
          // CRITICAL: Do NOT update minddrop_stage via field_updated events!
          // The stage should ONLY be set to 'enriched' via the entity:enriched event
          // which contains ALL fields at once. If we set 'enriched' here before
          // time_estimate_minutes arrives, chips animate in without the time estimate.
          if (field === 'minddrop_stage') {
            // console.log('🟣 IGNORING minddrop_stage via field_updated (wait for entity:enriched)');
            return item; // Don't update - wait for entity:enriched
          }
          if (field === 'time_estimate_minutes') {
            // console.log('⏱️ UPDATING TIME ESTIMATE IN STATE:', value);
            return { ...item, time_estimate_minutes: value };
          }

          return item;
        });
      });
    });

    // Remove completed items from list immediately
    const unsubItemCompleted = eventBus.on(
      'ItemCompleted',
      (payload: { id: string; type: 'habit' | 'todo' }) => {
        // console.debug('[RecentDrops] ItemCompleted event:', payload.id, payload.type);
        // Ticked off: the card slides away (and leaves when its slide ends)
        if (!leavingRef.current.has(payload.id)) startLeaving([payload.id]);
        // Note: Pending items are managed by Zustand pendingDrops - no cleanup needed here
      },
    );

    // Listen for ItemUpdated events from Zustand store (e.g., same-bucket clarification resolution)
    const unsubItemUpdated = eventBus.on(
      'ItemUpdated',
      (payload: { id: string; source?: string }) => {
        // console.log('[RecentDrops] ItemUpdated event:', payload.id);

        // Fetch the updated entity from Zustand and merge into local state
        const store = useGremlyStore.getState();

        // Check all entity types
        const note = store.notes.find((n) => n.id === payload.id);
        const todo = store.todos.find((t) => t.id === payload.id);
        const habit = store.habits.find((h) => h.id === payload.id);

        const entity = note || todo || habit;
        const entityType = note ? 'note' : todo ? 'todo' : habit ? 'habit' : null;

        if (!entity || !entityType) {
          console.warn('[RecentDrops] ItemUpdated: entity not found in store', payload.id);
          return;
        }

        const views = (entity as any).views || {};

        // Archived or ticked off: it leaves the list, as it would on a reload
        // (a card sliding out after a yes leaves when its slide ends)
        const gone =
          (entity as any).archived === true ||
          (entityType === 'todo' && !!(entity as any).completed_at);
        if (gone) {
          if (!leavingRef.current.has(payload.id)) startLeaving([payload.id]);
          return;
        }

        // Put back by an Undo after a yes: it returns as it was, with what changed since
        const snapshot = leftSnapshots.current.get(payload.id);
        if (snapshot) {
          leftSnapshots.current.delete(payload.id);
          setReturningIds((prev) => new Set(prev).add(payload.id));
          setItems((prev) =>
            prev.some((item) => item.id === payload.id)
              ? prev
              : [
                  ...prev,
                  {
                    ...snapshot,
                    title: (entity as any).title ?? (entity as any).name ?? snapshot.title,
                    views,
                  },
                ],
          );
          return;
        }

        // console.log('[RecentDrops] ItemUpdated: merging updated entity', {
        //   id: payload.id,
        //   type: entityType,
        //   title: (entity as any).title ?? (entity as any).name,
        //   needs_clarification: (entity as any).needs_clarification,
        //   clarification_resolved: (entity as any).clarification_resolved,
        //   ai_pending: views.ai_pending,
        //   clarification_processing: views.clarification_processing,
        // });

        // Update the item in local state
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== payload.id) return item;

            return {
              ...item,
              title: (entity as any).title ?? (entity as any).name ?? item.title,
              tags: Array.isArray((entity as any).tags) ? (entity as any).tags : item.tags,
              views: views,
              due_date: (entity as any).due_date ?? (entity as any).due_at ?? item.due_date,
              due_day: (entity as any).due_day ?? item.due_day,
              // A day or time changed from a card (chat or Mind Drop) shows straight away
              due_time: 'due_time' in (entity as any) ? (entity as any).due_time : item.due_time,
              target_date:
                'target_date' in (entity as any) ? (entity as any).target_date : item.target_date,
              event_time:
                'event_time' in (entity as any) ? (entity as any).event_time : item.event_time,
              // the rest of the card's meta line (Mind Drop rethink stage 5)
              scheduled_date:
                'scheduled_date' in (entity as any)
                  ? (entity as any).scheduled_date
                  : item.scheduled_date,
              mood: 'mood' in (entity as any) ? (entity as any).mood : item.mood,
              start_date:
                'start_date' in (entity as any) ? (entity as any).start_date : item.start_date,
              days_active:
                'days_active' in (entity as any) ? (entity as any).days_active : item.days_active,
              time_window:
                'time_window' in (entity as any) ? (entity as any).time_window : item.time_window,
              // Note subtype - CRITICAL for correct chip after clarification resolution
              noteSubtype:
                entityType === 'note'
                  ? ((entity as any).subtype ?? item.noteSubtype ?? 'catchall')
                  : item.noteSubtype,
              // Habit-specific fields - CRITICAL for frequency chip updates from Phase 2
              frequency: (entity as any).frequency ?? item.frequency,
              cadence: (entity as any).cadence ?? item.cadence,
              target_per_period: (entity as any).target_per_period ?? item.target_per_period,
              time_estimate_minutes:
                (entity as any).time_estimate_minutes ?? item.time_estimate_minutes,
              // Clarification fields - CRITICAL for removing the Clarify chip
              needs_clarification:
                (entity as any).needs_clarification ?? views.needs_clarification ?? false,
              clarification_resolved:
                (entity as any).clarification_resolved ?? views.clarification_resolved ?? false,
              clarification_question: views.clarification_question ?? item.clarification_question,
              clarification_options: views.clarification_options ?? item.clarification_options,
              clarification_type: views.clarification_type ?? item.clarification_type,
            };
          }),
        );
      },
    );

    // Timeout mechanism for stuck cards - recover after 30 seconds
    const stuckCardInterval = setInterval(() => {
      const now = getDateService().now().getTime();
      const STUCK_THRESHOLD_MS = 30000; // 30 seconds

      setItems((prev) => {
        let hasChanges = false;
        const updated = prev.map((item) => {
          const stage = item.views?.minddrop_stage;
          if (stage === 'streaming' || stage === 'enriching' || stage === 'pending') {
            const createdAt = new Date(item.created_at).getTime();
            if (now - createdAt > STUCK_THRESHOLD_MS) {
              console.warn('[RecentDrops] Recovering stuck card:', item.id, stage);
              hasChanges = true;
              return {
                ...item,
                views: {
                  ...item.views,
                  minddrop_stage: 'enriched',
                  ai_pending: false,
                },
              };
            }
          }
          return item;
        });
        return hasChanges ? updated : prev;
      });
    }, 10000); // Check every 10 seconds

    return () => {
      unsubscribe();
      unsubEntityCreated();
      unsubEntityEnriched();
      unsubFieldUpdated();
      unsubItemCompleted();
      unsubItemUpdated();
      clearInterval(stuckCardInterval);
    };
  }, [load, startLeaving]);

  // Listen for enrichment retry events from failed cards
  React.useEffect(() => {
    const handleRetry = async (payload: {
      localId: string;
      text: string;
      bucket: string;
      subtype: string | null;
    }) => {
      console.log('[RecentDrops] Retrying enrichment', { localId: payload.localId });

      // Queued drops retry via the pipeline (saveDrop → syncQueueToZustand)
      const isInQueue = queueItems.some((d) => d.localId === payload.localId);
      if (isInQueue) return;

      // 1. Set card back to enriching state (shows shimmer)
      setItems((prev) =>
        prev.map((item) =>
          item.drop_id === payload.localId || item.id === payload.localId
            ? {
                ...item,
                views: {
                  ...item.views,
                  minddrop_stage: 'enriching',
                  ai_pending: true,
                  ai_failed: false,
                },
              }
            : item,
        ),
      );

      // 2. Re-run Phase 2 for synced entity
      try {
        const bucket = payload.bucket as 'todo' | 'habit' | 'log';
        const subtype = payload.subtype as any;
        const entityId = payload.localId;
        const item = items.find((i) => i.id === entityId || i.drop_id === entityId);
        if (item) {
          const result = await runPhase2(entityId, payload.text, bucket, subtype, repo);
          if (result) {
            setItems((prev) =>
              prev.map((i) => (i.id === entityId ? applyEnrichmentToItem(i, result) : i)),
            );
          }
        }
      } catch (err) {
        console.warn('[RecentDrops] Retry enrichment failed', { error: String(err) });
        setItems((prev) =>
          prev.map((item) =>
            item.drop_id === payload.localId || item.id === payload.localId
              ? {
                  ...item,
                  views: {
                    ...item.views,
                    minddrop_stage: 'enrichment_failed',
                    ai_pending: false,
                    ai_failed: true,
                  },
                }
              : item,
          ),
        );
      }
    };

    const unsub = eventBus.on('drop:retry_enrichment', handleRetry);
    return () => unsub();
  }, [queueItems, items, repo]);

  const handleEdit = React.useCallback(
    async (id: string, kind: UnifiedDrop['kind'], _unsorted?: boolean) => {
      try {
        // Synchronous lookup from store
        const record = getItemById(id);

        if (record && record.type === kind) {
          overlay.openEdit({
            record: record as any,
            spaceId: (record as any).space_id ?? null,
          });
          onEdited?.();
        } else {
          console.warn('[RecentDrops] handleEdit: record not found or type mismatch', { id, kind });
          // Fallback to minimal record if fetch fails
          overlay.openEdit({
            record: { id, type: kind } as any,
            spaceId: null,
          });
          onEdited?.();
        }
      } catch (error) {
        console.error('[RecentDrops] handleEdit: failed to fetch record', error);
        // Fallback to minimal record if fetch fails
        overlay.openEdit({
          record: { id, type: kind } as any,
          spaceId: null,
        });
        onEdited?.();
      }
    },
    [getItemById, overlay, onEdited],
  );

  const handleDelete = React.useCallback(
    async (id: string, kind: UnifiedDrop['kind']) => {
      try {
        // Look up drop_id from store instead of local state to avoid dependency on `items`
        const state = useGremlyStore.getState();
        let dropId: string | undefined;

        if (kind === 'todo') {
          dropId = state.todos.find((t) => t.id === id)?.drop_id ?? undefined;
        } else if (kind === 'habit') {
          dropId = state.habits.find((h) => h.id === id)?.drop_id ?? undefined;
        } else {
          dropId = state.notes.find((n) => n.id === id)?.drop_id ?? undefined;
        }

        if (dropId) {
          // Archive all items with this drop_id
          const todosToDelete = state.todos.filter((t) => t.drop_id === dropId);
          const habitsToDelete = state.habits.filter((h) => h.drop_id === dropId);
          const notesToDelete = state.notes.filter((n) => n.drop_id === dropId);

          // Delete each item by type
          await Promise.all([
            ...todosToDelete.map((t) => deleteTodo(t.id)),
            ...habitsToDelete.map((h) => deleteHabit(h.id)),
            ...notesToDelete.map((n) => deleteNote(n.id)),
          ]);

          // Remove all items with this drop_id from local state
          setItems((prev) => prev.filter((item) => item.drop_id !== dropId));
        } else {
          // No drop_id: fallback to single-item delete
          if (kind === 'todo') {
            await deleteTodo(id);
          } else if (kind === 'habit') {
            await deleteHabit(id);
          } else {
            await deleteNote(id);
          }

          // Remove only this item from local state
          setItems((prev) => prev.filter((item) => item.id !== id));
        }

        onDeleted?.();
      } catch (err) {
        // optional: error UI
        console.error('[handleDelete] Failed to delete:', err);
      }
    },
    [deleteTodo, deleteHabit, deleteNote, onDeleted],
  );

  // Derive hasTodayDrops from reactive items state (not todayCount which can be stale)
  const hasTodayDrops = React.useMemo(() => {
    if (pendingItems.length > 0) return true;
    const todayCutoff = getDateService().startOfRitualDay().getTime();
    return items.some((item) => {
      const ts = new Date(item.created_at).getTime();
      return Number.isFinite(ts) && ts >= todayCutoff;
    });
  }, [items, pendingItems]);

  // Determine what to show: empty state only when no today drops AND viewing 'today' filter
  const showingOlder = filter === 'older';
  const showEmptyState = !hasTodayDrops && !showingOlder && !loading && hasCompletedFirstDrop;
  const showDropsList = hasTodayDrops || showingOlder;

  // Handler for "Show older drops" link in empty state
  const handleShowOlderFromEmpty = React.useCallback(() => {
    setFilter('older');
    setOpen(true);
  }, []);

  return (
    <View style={styles.recentRoot}>
      {/* Two-zone toggle: show when there are today drops OR viewing older */}
      {showDropsList && (
        <View style={styles.recentToggleRow}>
          {/* Tap zone 1: Filter picker (Today/Older) */}
          <Pressable
            testID="minddrop-recent-filter"
            onPress={handleFilterPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Show ${filter === 'today' ? 'today' : 'older'} drops. Tap to change.`}
          >
            <Text style={styles.recentToggleText}>
              {filter === 'today'
                ? `Today${todayCount > 0 ? ` (${todayCount})` : ''}`
                : `Older${olderCount > 0 ? ` (${olderCount})` : ''}`}
            </Text>
          </Pressable>

          {/* Tap zone 2: Collapse/expand chevron */}
          <Pressable
            testID="minddrop-recent-chevron"
            onPress={handleChevronPress}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel="Toggle recent drops"
            accessibilityState={{ expanded: open }}
            style={styles.recentChevronBtn}
          >
            <Reanimated.View style={chevronAnimatedStyle}>
              <ChevronDown size={18} color={c.mossGreen} />
            </Reanimated.View>
          </Pressable>
        </View>
      )}

      {/* Empty state: show when no today drops and viewing 'today' filter */}
      {showEmptyState ? (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateTitle}>New day! Ready for anything.</Text>
          {olderCount > 0 && (
            <Pressable onPress={handleShowOlderFromEmpty} style={styles.showOlderLink}>
              <Text style={styles.showOlderText}>Show older drops ({olderCount})</Text>
            </Pressable>
          )}
        </View>
      ) : open ? (
        <View testID="minddrop-recent-list" style={styles.recentList}>
          {loading ? (
            <Text style={styles.recentEmpty}>Loading…</Text>
          ) : filteredItems.length === 0 && pendingItems.length === 0 ? (
            hasCompletedFirstDrop ? (
              <View style={styles.recentEmptyContainer}>
                <Text style={styles.recentEmptyPrimary}>
                  {filter === 'today' ? 'No drops today yet.' : 'No older drops.'}
                </Text>
              </View>
            ) : null
          ) : (
            <AppScrollView
              contentContainerStyle={styles.recentScrollContent}
              showsVerticalScrollIndicator
            >
              {/* Combined list: pending items first, then real items (sorted by created_at) */}
              {/* Using a single loop ensures React maintains component identity when */}
              {/* a pending item is promoted to a real item (prevents modal from closing) */}
              {combinedItems.map((item) => {
                const itemIsPending = pendingIdSet.has(item.drop_id || item.id);
                // A drop an older build held as a note shows the kind it will become
                const held = item.kind === 'note' ? relationOf(item.views) : null;
                const heldKind =
                  held?.status === 'pending' && keepsHeldNote(held) ? heldKindOf(held).kind : null;
                const effectiveKind = heldKind ?? item.optimisticKind ?? item.kind;
                const displayKind = getDisplayKindForDrop(item, canonicalTypesOn);
                const showLegacyUnsortedBadge =
                  !canonicalTypesOn && effectiveKind === 'note' && (item as any).unsorted;
                const badgeStyleKey =
                  effectiveKind === 'todo'
                    ? 'badge_todo'
                    : effectiveKind === 'habit'
                      ? 'badge_habit'
                      : item.noteSubtype === 'journal' || item.canonical_type === 'journal'
                        ? 'badge_journal'
                        : item.noteSubtype === 'idea' || item.canonical_type === 'idea'
                          ? 'badge_idea'
                          : item.noteSubtype === 'event' || item.views?.subtype === 'event'
                            ? 'badge_event'
                            : 'badge_note';

                // Get visual state for pending/failed/final rendering
                const visualState = getMindDropVisualState(item);
                const isPending = itemIsPending || visualState === 'pending';

                // Use drop_id for key to maintain component identity across pending→real transition
                const stableKey = item.drop_id || `${item.kind}:${item.id}`;

                // Use UnifiedCardWrapper for BOTH pending and real items
                // This prevents remounting when transitioning (preserves modal state)
                // A piece of a split comes out of the card it was; a split kept as
                // one comes in where the pieces fold (stage 7)
                const place = splitPlaceOf(item);
                const parentTop = place && place.index >= 0 ? cardTops.get(place.group) : undefined;
                const enterAs: CardEnterAs | undefined = itemIsPending
                  ? { as: 'drop' }
                  : place && place.index < 0 && keptGroupsNow.has(place.group)
                    ? { as: 'kept' }
                    : place && parentTop !== undefined
                      ? { as: 'piece', index: place.index, fromTop: parentTop }
                      : undefined;

                return (
                  <React.Fragment key={stableKey}>
                    <UnifiedCardWrapper
                      itemId={item.id}
                      dropId={item.drop_id}
                      isPending={itemIsPending}
                      leaving={leavingIds.has(item.id)}
                      leaveAs={leaveAsRef.current.get(item.id)}
                      onLeft={handleCardLeft}
                      returning={returningIds.has(item.id)}
                      onReturned={handleCardReturned}
                      enterAs={enterAs}
                      unzips={itemIsPending && item.views?.unzips === true}
                    >
                      <AnimatedMindDropCard
                        item={item}
                        isPending={isPending}
                        effectiveKind={effectiveKind}
                        displayKind={displayKind}
                        showLegacyUnsortedBadge={
                          itemIsPending ? undefined : showLegacyUnsortedBadge
                        }
                        badgeStyleKey={badgeStyleKey}
                        c={c}
                        styles={styles}
                        mode={themeMode}
                        handleEdit={itemIsPending ? NOOP_EDIT : handleEdit}
                        handleDelete={itemIsPending ? NOOP_DELETE : handleDelete}
                        onTalk={item.id === talkItemId ? handleTalk : undefined}
                        onPlace={itemIsPending ? undefined : handlePlace}
                      />
                    </UnifiedCardWrapper>
                    {splitBar && item.id === splitBar.lastId ? (
                      <Reanimated.View exiting={FadeOut.duration(150)} layout={CARD_LAYOUT}>
                        <SplitBar
                          groupId={splitBar.groupId}
                          count={splitBar.count}
                          testID={`minddrop-splitbar-${splitBar.groupId}`}
                        />
                      </Reanimated.View>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </AppScrollView>
          )}
        </View>
      ) : null}

      {/* Where it lives: change it from the card (stage 9) */}
      <WorldsChapterPicker
        visible={!!placeFor}
        entityId={placeFor?.id ?? null}
        entityDropType={placeFor?.kind ?? 'note'}
        onClose={() => setPlaceFor(null)}
        onSaved={(change) => {
          if (!placeFor) return;
          // how many went in and out, and what was there, with no names
          void logAppEvent(
            'place_change',
            { type: placeFor.kind, id: placeFor.id },
            {
              from: 'drop_card',
              was: placeFor.was,
              worlds_in: change.worldsIn,
              worlds_out: change.worldsOut,
              chapters_in: change.chaptersIn,
              chapters_out: change.chaptersOut,
            },
          );
        }}
      />
    </View>
  );
};

// Memoize RecentDrops to avoid re-rendering when parent state (trust, tips) changes
const RecentDropsMemo = React.memo(RecentDrops);

// Named export for tests to import the isolated component
export const RecentDropsTestable = RecentDrops;

export default RecentDropsMemo;
