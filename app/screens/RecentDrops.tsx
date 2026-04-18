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
  Easing,
  Alert,
  Platform,
  Pressable,
  View,
  ViewStyle,
  ActionSheetIOS,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { AppScrollView } from '../../components/common/AppScrollView';
import { Text } from '../../ui/Text';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { useHasCompletedFirstDrop, useCanCreate } from '../../lib/store/lifecycleSelectors';
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
import { MultiSplitModal } from '../components/minddrop/MultiSplitModal';
import type {
  MultiDropItem,
  MindDropBucket,
  LogSubtype as MindDropLogSubtype,
} from '../../lib/minddrop/types';
import { runPhase2 } from '../../lib/minddrop/phase2';
import { useTheme } from '../../src/theme/useTheme';
import Reanimated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing as ReanimatedEasing,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase/client';
import { useNavigation } from '@react-navigation/native';
import { useGlobalOverlay } from '../../contexts/OverlayContext';
import { addOverlaySavedListener } from '../../lib/events/overlaySaved';
import { eventBus } from '../../lib/events/EventBus';
import { deriveCompactTitle } from '../../lib/text/compactTitle';
import { Lock, Camera, Clock, User, ChevronDown, Calendar, Bell } from 'lucide-react-native';
import { getDateService, nowTimestamp } from '../../lib/date/DateService';
import {
  truncateText,
  relativeTime,
  formatTime12h,
  formatTimeEstimate,
  formatStartDate,
  formatDateForChip,
  getContextualMeta,
  getDisplayKindForChip,
  getDisplayKindForDrop,
} from '../../lib/minddrop/cardHelpers';
import { env } from '../../lib/env';
import { MOOD_CONFIG, type Mood } from '../../lib/shared/moods';
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

/**
 * Pending skeleton component with shimmer animation
 * Shows while AI enrichment is in progress
 */
/**
 * ShimmerBar - Reusable shimmer loading bar
 * Used across all skeleton states for consistent animation
 */
const ShimmerBar: React.FC<{
  width: number | string;
  height?: number;
  style?: any;
}> = ({ width, height = 14, style }) => {
  console.log('[RENDER_CHECK] ShimmerBar rendered');
  const shimmerPosition = React.useMemo(() => new Animated.Value(0), []);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerPosition, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerPosition]);

  const shimmerTranslate = shimmerPosition.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 200],
  });

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: 'rgba(46, 85, 64, 0.08)',
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          transform: [{ translateX: shimmerTranslate }],
        }}
      >
        <View
          style={{
            width: 60,
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
          }}
        />
      </Animated.View>
    </View>
  );
};

// Track which items have already been animated in (persists across re-renders)
const animatedInItemIds = new Set<string>();

/** Stores card_notes by drop ID for session-only display */
const sessionCardNotes = new Map<string, string>();

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
 * UnifiedCardWrapper - Single wrapper for both pending and real items.
 *
 * CRITICAL: Using a single component prevents React from remounting children
 * when an item transitions from pending to real. This preserves modal state.
 *
 * - isPending=true: Apply depth emergence animation (scale + opacity)
 * - isPending=false: Apply slide-down animation via Reanimated Layout
 */
const UnifiedCardWrapper = React.memo<{
  itemId: string;
  dropId?: string | null;
  isPending: boolean;
  children: React.ReactNode;
}>(({ itemId, dropId, isPending, children }) => {
  console.log('[RENDER_CHECK] UnifiedCardWrapper rendered');
  // DEBUG: Track wrapper mount/unmount (disabled to reduce Metro noise)
  // React.useEffect(() => {
  //   console.log('[DEBUG:Wrapper] UnifiedCardWrapper MOUNTED:', { itemId, dropId, isPending });
  //   return () => {
  //     console.log('[DEBUG:Wrapper] UnifiedCardWrapper UNMOUNTED:', { itemId, dropId });
  //   };
  // }, []);

  // DEBUG: Track isPending changes (disabled to reduce Metro noise)
  // React.useEffect(() => {
  //   console.log('[DEBUG:Wrapper] isPending changed:', { itemId, dropId, isPending });
  // }, [isPending, itemId, dropId]);

  // Track animation state - starts true if was pending, then transitions
  const [wasPending, setWasPending] = React.useState(isPending);
  const [layoutEnabled, setLayoutEnabled] = React.useState(false);

  // Animation values for depth emergence (pending items)
  const hasAnimated = animatedInItemIds.has(itemId);
  const scale = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.65), []);
  const opacity = React.useMemo(() => new Animated.Value(hasAnimated ? 1 : 0.2), []);

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

  // Pending item animation (depth emergence)
  React.useEffect(() => {
    if (!isPending || hasAnimated) return;

    animatedInItemIds.add(itemId);

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);

    return () => clearTimeout(timeout);
  }, [itemId, isPending, hasAnimated, scale, opacity]);

  // Real item Layout animation (slide-down)
  React.useEffect(() => {
    if (isPending) return;

    const wasRecentlyPromoted = dropId && recentlyPromotedDropIds.has(dropId);
    const delay = wasRecentlyPromoted ? 2000 : 500;

    if (wasRecentlyPromoted && dropId) {
      recentlyPromotedDropIds.delete(dropId);
    }

    const timeout = setTimeout(() => {
      setLayoutEnabled(true);
    }, delay);
    return () => clearTimeout(timeout);
  }, [isPending, dropId]);

  // Pending items: use Animated.View with scale/opacity
  if (isPending && !hasAnimated) {
    return <Animated.View style={{ opacity, transform: [{ scale }] }}>{children}</Animated.View>;
  }

  // Real items with Layout enabled: use Reanimated.View
  if (!isPending && layoutEnabled) {
    return (
      <Reanimated.View
        layout={Layout.duration(450).easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
      >
        {children}
      </Reanimated.View>
    );
  }

  // Default: plain View (pending after animation, or real before Layout enabled)
  return <View>{children}</View>;
});
UnifiedCardWrapper.displayName = 'UnifiedCardWrapper';

/**
 * ClarifyBadge - Static badge for items needing clarification
 * Shows in the top-right badge position, replacing the bucket badge.
 */
const ClarifyBadge: React.FC = () => {
  console.log('[RENDER_CHECK] ClarifyBadge rendered');
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 243, 224, 0.9)',
        borderWidth: 1,
        borderColor: 'rgba(180, 140, 80, 0.25)',
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: '600',
          color: '#8B6914',
          fontFamily: 'Inter-Medium',
        }}
      >
        Clarify
      </Text>
    </View>
  );
};

/**
 * AnimatedChipsTransition - Magical blur-to-sharp reveal for Phase 2 metadata chips
 *
 * When Phase 2 data arrives, ALL chips "emerge from mist" together:
 * - Start: opacity 0.3, scale 0.98, with frosted mist overlay
 * - End: opacity 1, scale 1.0, mist fades away
 * - Duration: 900ms ease-out for a more intentional, noticeable effect
 *
 * The mist effect is achieved by overlaying a semi-transparent white layer
 * that fades out as the chips become visible, creating the illusion of
 * content crystallizing out of fog.
 *
 * CRITICAL: Uses module-level chipAnimatedIds Set to persist animation state
 * across pending→entity transition. The drop_id stays the same, so we track
 * by that instead of component-level ref which resets on remount.
 */
const AnimatedChipsTransition: React.FC<{
  trackingId: string;
  hasRealData: boolean;
  children: React.ReactNode;
  onAnimationComplete?: () => void;
}> = ({ trackingId, hasRealData, children, onAnimationComplete }) => {
  console.log('[RENDER_CHECK] AnimatedChipsTransition rendered');
  // Check if this drop has already animated using module-level Set
  // This persists across pending→entity transition (drop_id stays the same)
  const alreadyAnimated = chipAnimatedIds.has(trackingId);

  // Use useState to create stable Animated.Values that persist across re-renders
  // If already animated, start at final values
  const [animValues] = React.useState(() => ({
    // Chips: start dim and slightly smaller, end fully visible
    opacity: new Animated.Value(alreadyAnimated ? 1 : 0.3),
    scale: new Animated.Value(alreadyAnimated ? 1 : 0.98),
    // Mist overlay: starts visible, fades to invisible
    mistOpacity: new Animated.Value(alreadyAnimated ? 0 : 0.85),
  }));
  // Track animation state for render decisions - show immediately if already animated
  const [isVisible, setIsVisible] = React.useState(alreadyAnimated || hasRealData);
  // Component-level ref to prevent double-trigger within same mount
  const animationStarted = React.useRef(alreadyAnimated);

  React.useEffect(() => {
    // When real data arrives, animate chips into view with magical reveal
    // Skip if already animated (tracked by module-level Set)
    if (hasRealData && !animationStarted.current && !chipAnimatedIds.has(trackingId)) {
      animationStarted.current = true;
      chipAnimatedIds.add(trackingId); // Persist across remounts
      // Start showing the container immediately (animation will run)
      setIsVisible(true);
      Animated.parallel([
        // Chips fade in and scale up
        Animated.timing(animValues.opacity, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(animValues.scale, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // Mist clears away
        Animated.timing(animValues.mistOpacity, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Fire callback when chip animation completes
        onAnimationComplete?.();
      });
    } else if (hasRealData && chipAnimatedIds.has(trackingId) && !isVisible) {
      // Already animated but not visible (e.g., remounted) - show immediately
      setIsVisible(true);
    }
  }, [trackingId, hasRealData, animValues, isVisible]);

  // Fixed minimum height prevents layout jump when chips appear
  const containerStyle: ViewStyle = {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
  };

  // If not visible yet, render empty container with min height (no placeholders)
  if (!isVisible) {
    return <View style={containerStyle} />;
  }

  // Render chips with animation + mist overlay
  return (
    <View style={[containerStyle, { position: 'relative' }]}>
      {/* Chips layer - animated opacity and scale */}
      <Animated.View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          opacity: animValues.opacity,
          transform: [{ scale: animValues.scale }],
        }}
      >
        {children}
      </Animated.View>
      {/* Mist overlay - fades out to reveal sharp chips */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -2,
          left: -4,
          right: -4,
          bottom: -2,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          opacity: animValues.mistOpacity,
          borderRadius: 8,
        }}
      />
    </View>
  );
};

// Module-level Set to track which badges have animated (persists across pending→entity transition)
const badgeAnimatedIds = new Set<string>();

/**
 * AnimatedBadgeTransition - Mist reveal animation for bucket badge
 *
 * Shows shimmer placeholder until bucket is confirmed by Phase 1,
 * then reveals the badge with blur-to-sharp mist animation.
 */
const AnimatedBadgeTransition: React.FC<{
  trackingId: string;
  bucketConfirmed: boolean;
  children: React.ReactNode;
}> = ({ trackingId, bucketConfirmed, children }) => {
  console.log('[RENDER_CHECK] AnimatedBadgeTransition rendered');
  const alreadyAnimated = badgeAnimatedIds.has(trackingId);

  const [animValues] = React.useState(() => ({
    opacity: new Animated.Value(alreadyAnimated ? 1 : 0.3),
    scale: new Animated.Value(alreadyAnimated ? 1 : 0.95),
    mistOpacity: new Animated.Value(alreadyAnimated ? 0 : 0.9),
  }));

  const [isVisible, setIsVisible] = React.useState(alreadyAnimated || bucketConfirmed);
  const animationStarted = React.useRef(alreadyAnimated);

  React.useEffect(() => {
    if (bucketConfirmed && !animationStarted.current && !badgeAnimatedIds.has(trackingId)) {
      animationStarted.current = true;
      badgeAnimatedIds.add(trackingId);
      setIsVisible(true);

      Animated.parallel([
        Animated.timing(animValues.opacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(animValues.scale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(animValues.mistOpacity, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (bucketConfirmed && badgeAnimatedIds.has(trackingId) && !isVisible) {
      setIsVisible(true);
    }
  }, [trackingId, bucketConfirmed, animValues, isVisible]);

  // If not confirmed yet, show shimmer placeholder
  if (!isVisible) {
    return <ShimmerBar width={45} height={22} style={{ borderRadius: 11 }} />;
  }

  return (
    <View style={{ position: 'relative' }}>
      <Animated.View
        style={{
          opacity: animValues.opacity,
          transform: [{ scale: animValues.scale }],
        }}
      >
        {children}
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -1,
          left: -1,
          right: -1,
          bottom: -1,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          opacity: animValues.mistOpacity,
          borderRadius: 11,
        }}
      />
    </View>
  );
};

/**
 * Row3Chips - UNIFIED chip rendering component for Row 3
 *
 * This is the SINGLE source of truth for ALL Row 3 chip rendering.
 * All chips (context, deadline, frequency, start date, time estimate, mood, people)
 * are rendered in ONE place so they ALL animate together with blur-to-focus.
 *
 * CRITICAL: Returns null until enrichment is complete. This ensures:
 * 1. All chips appear at the SAME TIME
 * 2. All chips get the SAME animation
 * 3. No flickering from partial data
 */
const Row3Chips: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'todo' | 'habit' | 'note';
  styles: any;
  isMulti?: boolean;
  onChipAnimationComplete?: () => void;
}> = ({ item, effectiveKind, styles, isMulti = false, onChipAnimationComplete }) => {
  console.log('[RENDER_CHECK] Row3Chips rendered');
  // Compute derived state once
  const isJournal =
    item.kind === 'note' && (item.noteSubtype === 'journal' || item.canonical_type === 'journal');
  const isIdea =
    item.kind === 'note' && (item.noteSubtype === 'idea' || item.canonical_type === 'idea');
  const isEvent =
    item.kind === 'note' && (item.noteSubtype === 'event' || item.views?.subtype === 'event');
  const isGeneralNote =
    item.kind === 'note' &&
    !isJournal &&
    !isIdea &&
    !isEvent &&
    (item.noteSubtype === 'catchall' ||
      item.noteSubtype === 'general' ||
      item.canonical_type === 'log' ||
      !item.noteSubtype);

  const hasMoods = isJournal && item.mood && item.mood.length > 0;
  const hasPeople =
    item.views?.people && Array.isArray(item.views.people) && item.views.people.length > 0;

  // CRITICAL: Row 3 chips must wait for Phase 2 to FULLY complete before animating.
  // This is SEPARATE from minddrop_stage which triggers Row 1-2 typewriter earlier.
  //
  // For pending drops: chip_data_ready is EXPLICITLY set (false until Phase 2, then true)
  // For real entities: chip_data_ready is undefined, use minddrop_stage === 'enriched'
  // For legacy items: no stage tracking at all
  const chipDataReady = item.views?.chip_data_ready === true;
  const minddropStage = item.views?.minddrop_stage;
  const isEntityEnriched = minddropStage === 'enriched';
  const isLegacyItem =
    minddropStage === undefined &&
    item.views?.ai_pending !== true &&
    item.views?.ai_failed !== true;

  // CRITICAL: Check if this is a pending drop (chip_data_ready is explicitly set)
  // Pending drops: chip_data_ready is false/true - ONLY use chipDataReady
  // Real entities: chip_data_ready is undefined - use isEntityEnriched
  const isPendingDrop = item.views?.chip_data_ready !== undefined;
  const hasRealChipData = isPendingDrop ? chipDataReady : isEntityEnriched || isLegacyItem;

  // CRITICAL: Use drop_id for tracking animation state across pending→entity transition
  // drop_id is set when pending drop is created and persists when synced to Supabase
  const trackingId = item.drop_id || item.id;

  // Check if item needs clarification (Phase 2 - Clarifying Questions)
  const needsClarification =
    (item.views?.needs_clarification === true || item.needs_clarification === true) &&
    item.clarification_resolved !== true &&
    item.views?.clarification_resolved !== true;

  // Get chip data
  const contextMeta = getContextualMeta(effectiveKind, item);
  const contextTestId =
    effectiveKind === 'todo' ? `minddrop-recent-todo-due-${item.id}` : undefined;

  // Build multi-entity type label if needed
  let multiTypeLabel = '';
  if (isMulti) {
    const multiItems: MultiDropItem[] = item.multi_items || item.views?.multi_items || [];
    const bucketCounts: Record<string, number> = {};
    for (const mi of multiItems) {
      const label =
        mi.bucket === 'todo'
          ? 'Todo'
          : mi.bucket === 'habit'
            ? 'Habit'
            : mi.subtype === 'journal'
              ? 'Journal'
              : mi.subtype === 'idea'
                ? 'Idea'
                : mi.subtype === 'event'
                  ? 'Event'
                  : 'Note';
      bucketCounts[label] = (bucketCounts[label] || 0) + 1;
    }
    const labels = Object.entries(bucketCounts).map(([label, count]) =>
      count > 1 ? `${count} ${label}s` : label,
    );
    multiTypeLabel = labels.join(' + ') || 'Multiple Items';
  }

  // Render context chip based on item type
  const renderContextChip = () => {
    // Multi-entity: show combined type label
    if (isMulti) {
      return (
        <View style={styles.moodChip}>
          <Text style={styles.moodChipText}>{multiTypeLabel}</Text>
        </View>
      );
    }

    // Journal: show mood chips only (subtype now in badge)
    if (isJournal) {
      if (!hasMoods) return null;
      return (
        <>
          {item.mood!.slice(0, 2).map((m: Mood, idx: number) => (
            <React.Fragment key={m}>
              <Text style={styles.journalSubtypeLabel}>{MOOD_CONFIG[m]?.label}</Text>
              {idx < Math.min(item.mood!.length, 2) - 1 && (
                <Text style={styles.journalSeparator}>·</Text>
              )}
            </React.Fragment>
          ))}
          {item.mood!.length > 2 && (
            <Text style={styles.moodOverflow}> +{item.mood!.length - 2}</Text>
          )}
        </>
      );
    }

    // Event with target date: show date chip (subtype now in badge)
    if (isEvent && contextMeta) {
      return (
        <View style={styles.recentContextPillContainer}>
          <Text style={styles.recentContextPill}>{contextMeta}</Text>
        </View>
      );
    }

    // Idea / General note: subtype now in badge, no chip needed
    if (isIdea || isGeneralNote || isEvent) {
      return null;
    }

    // Todo/Habit: show context pill (deadline/frequency)
    // For todos with both target and scheduled date, show both
    // Context chip rendering (scheduled date, frequency, etc.)
    // Skip context chip (due date/frequency) if reminder chip will show the same info
    const hasReminders = item.reminders && item.reminders.length > 0;
    return contextMeta && !hasReminders ? (
      <View style={styles.recentContextPillContainer}>
        <Text testID={contextTestId} style={styles.recentContextPill}>
          {contextMeta}
        </Text>
      </View>
    ) : null;
  };

  // Check for target_date (event/deadline context) - shown separately on right
  const hasTargetDate =
    (effectiveKind === 'todo' || effectiveKind === 'note') &&
    (item.target_date || item.views?.target_date);
  const targetDateValue = item.target_date || item.views?.target_date;

  return (
    <AnimatedChipsTransition
      trackingId={trackingId}
      hasRealData={hasRealChipData}
      onAnimationComplete={onChipAnimationComplete}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Context chip (scheduled date, frequency, type label, etc.) */}
        {renderContextChip()}

        {/* Phase 2 chips: HIDE while clarification is pending */}
        {!needsClarification && (
          <>
            {/* Start date chip for habits - before time estimate */}
            {effectiveKind === 'habit' && (
              <Text style={styles.recentContextPill}>{formatStartDate(item.start_date)}</Text>
            )}

            {/* Time estimate chip for todos AND habits */}
            {(effectiveKind === 'todo' || effectiveKind === 'habit') &&
              item.time_estimate_minutes && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    Alert.alert(
                      '⏱️ Time Estimate',
                      effectiveKind === 'habit'
                        ? 'This is how long each session of this habit might take. Tap the card to adjust it.'
                        : 'Gremly guesses how long this might take based on your task. Tap the card to adjust it.',
                      [{ text: 'Got it', style: 'default' }],
                    );
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={styles.timeEstimateChip}>
                    <Clock size={10} color="#888" strokeWidth={2} />
                    <Text style={styles.timeEstimateText}>
                      {formatTimeEstimate(item.time_estimate_minutes)}
                    </Text>
                  </View>
                </Pressable>
              )}

            {/* Target date chip (event/deadline context) - inline with other chips */}
            {hasTargetDate && targetDateValue && (
              <View style={styles.targetDateChip}>
                <Calendar size={10} color="#5d7a5d" strokeWidth={2} />
                <Text style={styles.targetDateText}>{formatDateForChip(targetDateValue)}</Text>
              </View>
            )}

            {/* Reminder bell chip */}
            {item.reminders &&
              item.reminders.length > 0 &&
              (() => {
                const r = item.reminders[0];
                const label =
                  r.frequency === 'daily'
                    ? `Daily, ${formatTime12h(r.time)}`
                    : r.date
                      ? `${formatDateForChip(r.date)}, ${formatTime12h(r.time)}`
                      : formatTime12h(r.time);
                return (
                  <View style={styles.reminderChip}>
                    <Bell size={10} color="#877030" strokeWidth={2} />
                    <Text style={styles.reminderText}>{label}</Text>
                  </View>
                );
              })()}

            {/* People chip */}
            {hasPeople && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <User size={10} color="#5c7a5c" strokeWidth={2.5} />
                <Text style={{ fontSize: 10, color: '#5c7a5c', fontFamily: 'Inter-Medium' }}>
                  {item.views!.people![0]}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    </AnimatedChipsTransition>
  );
};

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
 * PendingSkeleton - Phase 1: Classifying with calm arrival animation
 * Shows raw input text immediately with gentle shimmer + skeleton for secondary fields
 * Slides in smoothly for a calm experience
 */
const PendingSkeleton: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'note' | 'todo' | 'habit';
  badgeStyleKey: string;
  styles: any;
  c: any;
  index?: number; // For stagger delay
}> = ({ item, effectiveKind, badgeStyleKey, styles, c, index = 0 }) => {
  console.log('[RENDER_CHECK] PendingSkeleton rendered');
  const [dots, setDots] = React.useState('');
  const trackingId = item.drop_id || item.id;
  const bucketConfirmed = item.views?.bucket_confirmed === true;

  // Animated dots: cycle through '', '.', '..', '...'
  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Vanilla Animated shimmer (crash-safe) - gentle pulse between 0.5 and 0.85 opacity
  const titleOpacity = React.useMemo(() => new Animated.Value(0.6), []);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(titleOpacity, {
          toValue: 0.85,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 0.5,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [titleOpacity]);

  // Show "Still thinking..." after 5 seconds
  const [showSlowMessage, setShowSlowMessage] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowSlowMessage(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Show raw text as title immediately (truncated to 50 chars)
  const displayTitle = truncateText(item.text || item.title || '', 50);

  // Stagger delay for multiple cards
  const staggerDelay = index * 80;

  return (
    <Reanimated.View
      testID="minddrop-pending-skeleton"
      entering={SlideInDown.duration(280)
        .delay(staggerDelay)
        .easing(ReanimatedEasing.out(ReanimatedEasing.cubic))}
      exiting={FadeOut.duration(100)}
      layout={Layout.duration(200)}
      style={[styles.recentCard]}
    >
      {/* Row 1: Title (raw text with shimmer) + Kind badge */}
      <View style={styles.recentTopRow}>
        <Animated.Text
          numberOfLines={1}
          style={[styles.recentTitle, { fontStyle: 'italic', opacity: titleOpacity }]}
        >
          {displayTitle || '—'}
        </Animated.Text>
        <View style={styles.recentTopRight}>
          <AnimatedBadgeTransition trackingId={trackingId} bucketConfirmed={bucketConfirmed}>
            <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>
              {effectiveKind === 'todo' ? 'Todo' : effectiveKind === 'habit' ? 'Habit' : 'Note'}
            </Text>
          </AnimatedBadgeTransition>
        </View>
      </View>

      {/* Row 3: Empty chip row (no placeholders) + Organizing indicator */}
      <View style={styles.recentMetaRow}>
        <View />
        <Text
          style={[styles.recentMetaTime, { fontStyle: 'italic', color: '#6B7280', minWidth: 75 }]}
        >
          Organizing{dots}
        </Text>
      </View>

      {/* Subtle slow message after 5 seconds */}
      {showSlowMessage && (
        <Reanimated.Text
          entering={FadeIn.duration(300)}
          style={{
            fontSize: 11,
            color: '#6a7484',
            fontFamily: 'Inter-Regular',
            marginTop: 4,
            fontStyle: 'italic',
          }}
        >
          Still thinking...
        </Reanimated.Text>
      )}
    </Reanimated.View>
  );
};

/**
 * EnrichingSkeleton - Phase 2: AI knows the type, refining details
 * Shows raw text title + category chip + timestamp, skeleton for secondary fields
 * Breathing border indicates active processing
 * Has calm shimmer on title that crossfades to full opacity when AI title is ready
 */
const EnrichingSkeleton: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'note' | 'todo' | 'habit';
  badgeStyleKey: string;
  styles: any;
  c: any;
  index?: number; // For stagger delay
}> = ({ item, effectiveKind, badgeStyleKey, styles, c, index = 0 }) => {
  console.log('[RENDER_CHECK] EnrichingSkeleton rendered');
  const trackingId = item.drop_id || item.id;
  const bucketConfirmed = item.views?.bucket_confirmed === true;

  // Breathing border animation (vanilla Animated)
  const borderOpacity = React.useMemo(() => new Animated.Value(0.15), []);

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(borderOpacity, {
          toValue: 0.35,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(borderOpacity, {
          toValue: 0.15,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [borderOpacity]);

  const animatedBorderColor = borderOpacity.interpolate({
    inputRange: [0.15, 0.35],
    outputRange: ['rgba(46, 85, 64, 0.15)', 'rgba(46, 85, 64, 0.35)'],
  });

  // Detect if AI title is ready (different from raw text)
  const rawText = item.text || '';
  const aiTitle = item.title || '';
  const isAITitleReady =
    aiTitle && aiTitle !== rawText && !aiTitle.startsWith(rawText.substring(0, 20));

  // Vanilla Animated shimmer (crash-safe) - pulse between 0.5 and 0.85
  const titleOpacity = React.useMemo(() => new Animated.Value(isAITitleReady ? 1 : 0.6), []);
  const animationRef = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    if (isAITitleReady) {
      // Crossfade to full opacity when AI title arrives
      animationRef.current?.stop();
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Gentle shimmer while waiting
      animationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(titleOpacity, {
            toValue: 0.85,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(titleOpacity, {
            toValue: 0.5,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      animationRef.current.start();
    }

    return () => animationRef.current?.stop();
  }, [isAITitleReady, titleOpacity]);

  // Show AI title if ready, otherwise raw text (truncated)
  const displayTitle = truncateText(isAITitleReady ? aiTitle : rawText, 50);

  return (
    <Animated.View
      testID="minddrop-enriching-skeleton"
      style={[
        styles.recentCard,
        {
          borderWidth: 1.5,
          borderColor: animatedBorderColor,
        },
      ]}
    >
      {/* Row 1: Title (raw or AI) with shimmer/crossfade + Category chip */}
      <View style={styles.recentTopRow}>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.recentTitle,
            !isAITitleReady && { fontStyle: 'italic' },
            { opacity: titleOpacity },
          ]}
        >
          {displayTitle || '—'}
        </Animated.Text>
        <View style={styles.recentTopRight}>
          <AnimatedBadgeTransition trackingId={trackingId} bucketConfirmed={bucketConfirmed}>
            <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>
              {effectiveKind === 'todo' ? 'Todo' : effectiveKind === 'habit' ? 'Habit' : 'Note'}
            </Text>
          </AnimatedBadgeTransition>
        </View>
      </View>

      {/* Row 3: Empty chip row (no placeholders) + timestamp */}
      <View style={styles.recentMetaRow}>
        <View />
        <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
      </View>
    </Animated.View>
  );
};

/**
 * RevealingCard - Phase 3: Typewriter reveal animation
 * Crossfades from shimmer, then reveals each line with typewriter effect
 * Ends with subtle pulse to indicate completion
 */
const RevealingCard: React.FC<{
  item: UnifiedDrop;
  effectiveKind: 'note' | 'todo' | 'habit';
  displayKind: string;
  badgeStyleKey: string;
  styles: any;
  c: any;
  isPending: boolean; // Whether the item is still being processed (Phase 1.5 may not be done)
  onRevealComplete: () => void;
}> = ({
  item,
  effectiveKind,
  displayKind,
  badgeStyleKey,
  styles,
  c,
  isPending,
  onRevealComplete,
}) => {
  console.log('[RENDER_CHECK] RevealingCard rendered');
  // CRITICAL: Use drop_id for tracking - persists across pending→entity transition
  const trackingId = item.drop_id || item.id;

  // Track completion of title typewriter
  const [line1Done, setLine1Done] = React.useState(false);

  // CRITICAL: Capture initial values so they don't change during animation
  // This prevents Phase 2 updates from restarting the typewriter animation
  // Using useState initializer to freeze on first render (only runs once)
  const [titleText] = React.useState(() => item.title || item.text || '—');

  // Memoize callback to prevent re-renders
  const handleLine1Done = React.useCallback(() => setLine1Done(true), []);

  // Row 1 & 2: Shimmer fade-out / text fade-in (starts immediately)
  const shimmerOpacity = React.useMemo(() => new Animated.Value(1), []);
  const textOpacity = React.useMemo(() => new Animated.Value(0), []);

  // Settle pulse animation
  const settleScale = React.useMemo(() => new Animated.Value(1), []);
  const settleShadow = React.useMemo(() => new Animated.Value(0), []);

  // Start Row 1 & 2 crossfade immediately
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(shimmerOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shimmerOpacity, textOpacity]);

  // Trigger settle animation when title typewriter completes
  // Row 3 chips have their own animation via AnimatedChipsTransition
  React.useEffect(() => {
    if (line1Done) {
      // Subtle pulse: scale up slightly, glow, then settle
      Animated.sequence([
        Animated.parallel([
          Animated.timing(settleScale, {
            toValue: 1.008,
            duration: 150,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(settleShadow, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(settleScale, {
            toValue: 1,
            duration: 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(settleShadow, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }),
        ]),
      ]).start(() => {
        onRevealComplete();
      });
    }
  }, [line1Done, settleScale, settleShadow, onRevealComplete]);

  // Animated shadow for settle effect
  const animatedShadowOpacity = settleShadow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.12, 0.25],
  });

  return (
    <Animated.View
      testID="minddrop-revealing-card"
      style={[
        styles.recentCard,
        {
          transform: [{ scale: settleScale }],
        },
      ]}
    >
      {/* Row 1: Title + Category chip */}
      <View style={styles.recentTopRow}>
        <View style={{ flex: 1, minHeight: 20 }}>
          {/* Text layer with typewriter - no shimmer overlay for title */}
          <Animated.View style={{ opacity: textOpacity }}>
            <TypewriterText
              text={titleText}
              style={[styles.recentTitle, { flex: undefined }]}
              duration={350}
              delay={50}
              onComplete={handleLine1Done}
            />
          </Animated.View>
        </View>
        <View style={styles.recentTopRight}>
          {effectiveKind === 'note' && (item as any)?.private === true && (
            <Lock size={12} color="#777" />
          )}
          <Text style={[styles.recentCategoryPill, styles[badgeStyleKey]]}>
            {getDisplayKindForChip(effectiveKind, item)}
          </Text>
        </View>
      </View>

      {/* Row 2: Card note (session only) */}
      {sessionCardNotes.get(item.drop_id || item.id) ? (
        <Text style={styles.recentConfirmation} numberOfLines={1}>
          {sessionCardNotes.get(item.drop_id || item.id)}
        </Text>
      ) : null}

      {/* Row 3: Chips (use Row3Chips with AnimatedChipsTransition) + timestamp */}
      <View style={styles.recentMetaRow}>
        <Row3Chips item={item} effectiveKind={effectiveKind} styles={styles} />
        <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
      </View>
    </Animated.View>
  );
};

/**
 * Pulsing animation hook for Gremly icon on multi-entity cards
 */
const useGremlyPulse = () => {
  const pulseAnim = React.useMemo(() => new Animated.Value(1), []);

  React.useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return pulseAnim;
};

// Module-level Set to track items that have already shown reveal animation
// Prevents double animation when component remounts or Phase 2 arrives
const revealedItemIds = new Set<string>();

// Module-level Set to track drops that have already animated their Row 3 chips
// This persists across pending→entity transition (drop_id stays the same)
const chipAnimatedIds = new Set<string>();

// Module-level Set to track drops that have already shown multi-drop bounce animation
// Uses drop_id for stability across pending→synced transition
const multiBounceAnimatedIds = new Set<string>();

// Module-level Set to track drops that have bounced after chip animation
// Prevents double bounce when component remounts
const chipBounceAnimatedIds = new Set<string>();

// Module-level Set to track drops that have bounced for clarification
// Prevents double bounce when clarification is detected
const clarificationBounceAnimatedIds = new Set<string>();

/**
 * Reset all animation tracking for a drop_id.
 * Called when a clarification bucket change happens so the new entity
 * can show fresh animations (shimmer, typewriter, mist, bounce).
 */
export const resetAnimationTrackingForDrop = (dropId: string) => {
  revealedItemIds.delete(dropId);
  chipAnimatedIds.delete(dropId);
  multiBounceAnimatedIds.delete(dropId);
  chipBounceAnimatedIds.delete(dropId);
  clarificationBounceAnimatedIds.delete(dropId);
  // console.log('[AnimatedMindDropCard] Reset animation tracking for drop:', dropId);
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
  // Multi-entity handlers passed from parent
  onKeepAsNote?: (id: string) => void;
  onSplitSelected?: (id: string, selectedItems: MultiDropItem[]) => void;
  // Callback to open modal at parent level (modal lives in RecentDrops, not here)
  onOpenModal?: (item: UnifiedDrop) => void;
  // Callback to open standalone clarification popup
  openClarificationPopup?: (options: {
    entityId: string;
    entityType: 'note' | 'todo' | 'habit';
    question: string | null; // null = Phase 1.5 still loading
    options: Array<{ id: string; label: string; action: any }> | null; // null = loading
    originalText?: string | null; // The original drop text to show context
  }) => void;
}>(
  ({
    item,
    isPending,
    effectiveKind,
    displayKind,
    showLegacyUnsortedBadge,
    badgeStyleKey,
    c,
    styles,
    mode,
    handleEdit,
    handleDelete,
    index = 0,
    onKeepAsNote,
    onSplitSelected,
    onOpenModal,
    openClarificationPopup,
  }) => {
    console.log('[RENDER_CHECK] AnimatedMindDropCard COMPLETE rendered');
    // Capture render time in a ref (initialized once on mount)
    // This avoids calling Date.now() multiple times during render
    // eslint-disable-next-line react-hooks/purity -- Date.now() in useRef initializer is safe (runs once per mount)
    const mountTimeRef = React.useRef(getDateService().now().getTime());

    // Check for multi-entity drops
    const isMulti = item.is_multi === true || item.views?.is_multi === true;

    // Check if item needs clarification (for special styling)
    // Use truthy check (not strict ===) to match confirmation behavior
    const needsClarification =
      (item.views?.needs_clarification || item.needs_clarification) &&
      !item.clarification_resolved &&
      !item.views?.clarification_resolved;

    // Tracking for badge animation (uses trackingId declared below)
    const bucketConfirmed = item.views?.bucket_confirmed !== false; // true for real entities

    // DEBUG: Track component mount/unmount (disabled to reduce Metro noise)
    // React.useEffect(() => {
    //   console.log('[DEBUG:AnimatedMindDropCard] MOUNTED:', {
    //     itemId: item.id,
    //     dropId: item.drop_id,
    //     isMulti,
    //   });
    //   return () => {
    //     console.log('[DEBUG:AnimatedMindDropCard] UNMOUNTED:', {
    //       itemId: item.id,
    //       dropId: item.drop_id,
    //     });
    //   };
    // }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // ─────────────────────────────────────────────────────────────────────────
    // Card bounce animation
    // Triggers when:
    // 1. Multi-drop is detected (isMulti becomes true)
    // 2. Phase 1 completes (streaming state reached - bucket is set)
    // Uses drop_id (stable across pending→synced) to prevent duplicate animations
    // ─────────────────────────────────────────────────────────────────────────
    const bounceScale = useSharedValue(1);

    // Use drop_id for tracking (stable across pending→entity transition)
    // Falls back to item.id for items without drop_id
    const bounceTrackingId = item.drop_id || item.id;

    // Get visual state to detect Phase 1 completion
    const currentVisualState = getMindDropVisualState(item);
    const phase1Complete = currentVisualState === 'streaming' || currentVisualState === 'complete';

    // Track when chip animation completes (for Row3Chips blur-to-focus callback)
    const [chipAnimationComplete, setChipAnimationComplete] = React.useState(false);

    const handleChipAnimationComplete = React.useCallback(() => {
      setChipAnimationComplete(true);
    }, []);

    React.useEffect(() => {
      // Trigger bounce ONLY for:
      // 1. Multi-drop detection
      // 2. Clarification detection
      // Regular cards should NOT bounce

      // Multi-drop bounce: happens when isMulti becomes true
      if (isMulti && !multiBounceAnimatedIds.has(bounceTrackingId)) {
        multiBounceAnimatedIds.add(bounceTrackingId);

        // Pronounced bounce: 1.0 → 1.10 → 0.96 → 1.0
        bounceScale.value = withSequence(
          withTiming(1.1, { duration: 180 }),
          withTiming(0.96, { duration: 140 }),
          withSpring(1, { damping: 6, stiffness: 120, mass: 1 }),
        );
        return;
      }

      // Clarification bounce: happens when needsClarification becomes true
      if (needsClarification && !clarificationBounceAnimatedIds.has(bounceTrackingId)) {
        clarificationBounceAnimatedIds.add(bounceTrackingId);

        // Same pronounced bounce as multi: 1.0 → 1.10 → 0.96 → 1.0
        bounceScale.value = withSequence(
          withTiming(1.1, { duration: 180 }),
          withTiming(0.96, { duration: 140 }),
          withSpring(1, { damping: 6, stiffness: 120, mass: 1 }),
        );
        return;
      }

      // NOTE: Phase 1 bounce removed - regular cards no longer bounce
      // Only multi-drop cards get the attention-grabbing bounce
    }, [isMulti, needsClarification, bounceTrackingId, bounceScale]);

    const bounceStyle = useAnimatedStyle(() => ({
      transform: [{ scale: bounceScale.value }],
    }));

    // Gremly pulse animation for multi-entity and clarification cards
    const gremlyPulseScale = useGremlyPulse();

    // Get visual state from item
    const itemVisualState = getMindDropVisualState(item);

    // Track revealed items by drop_id (stable across pending→synced transition)
    // Falls back to item.id for items without drop_id
    const trackingId = item.drop_id || item.id;

    // High-water mark: prevent visual state from going backwards
    // Uses useState (not ref) because it drives render output — React Compiler safe
    const [highWaterMark, setHighWaterMark] = React.useState<MindDropVisualState>('pending');

    // Reset high-water mark when card identity changes
    React.useEffect(() => {
      setHighWaterMark('pending');
    }, [item.id]);

    // Local state to track revealing phase
    const [isRevealing, setIsRevealing] = React.useState(false);
    const [revealComplete, setRevealComplete] = React.useState(() => {
      // Initialize as complete if this item was already revealed
      return revealedItemIds.has(trackingId);
    });
    const prevStateRef = React.useRef<MindDropVisualState | null>(null);
    const isFirstRender = React.useRef(true);

    // Transition detection useEffect - simplified since main reveal logic is now synchronous
    // This handles:
    // 1. Old items (>30s) that shouldn't animate - mark them complete immediately
    // 2. Keeping prevStateRef updated for debugging
    // 3. Syncing revealComplete state when item is in revealedItemIds
    React.useEffect(() => {
      const isReadyForReveal = itemVisualState === 'streaming' || itemVisualState === 'complete';

      // Sync local state if this item was already revealed (handles remounts)
      if (revealedItemIds.has(trackingId) && !revealComplete && !isRevealing) {
        setRevealComplete(true);
      }

      // First render: check if item is too old for animation
      if (isFirstRender.current) {
        isFirstRender.current = false;

        if (isReadyForReveal) {
          const createdAt = new Date(item.created_at).getTime();
          const ageMs = getDateService().now().getTime() - createdAt;

          if (ageMs >= 30000) {
            // Item is old (>30s) - skip animation entirely
            revealedItemIds.add(trackingId);
            setRevealComplete(true);
          }
          // For new items, the synchronous logic in visualState computation
          // already handled starting the reveal
        }
      }

      prevStateRef.current = itemVisualState;
    }, [itemVisualState, trackingId, item.created_at, revealComplete, isRevealing]);

    // Handle reveal completion - mark as revealed to prevent re-animation
    const handleRevealComplete = React.useCallback(() => {
      revealedItemIds.add(trackingId);
      setIsRevealing(false);
      setRevealComplete(true);
    }, [trackingId]);

    // Determine actual visual state
    // CRITICAL FIX: Detect reveal eligibility SYNCHRONOUSLY during render
    // Don't wait for useEffect to set isRevealing - that causes the race condition
    //
    // The bug was: when itemVisualState === 'streaming' on first render,
    // isRevealing was still false (useEffect hadn't run), so it fell through
    // to 'complete' and skipped the reveal animation entirely.

    const isReadyForReveal = itemVisualState === 'streaming' || itemVisualState === 'complete';

    // Check if item is too old for animation (>30s old) - SYNCHRONOUS check
    // Uses mountTimeRef captured on mount to avoid impure Date.now() calls during render
    // eslint-disable-next-line react-hooks/refs -- intentional: stable ref set once on mount
    const mountTimestamp = mountTimeRef.current;
    const createdAtMs = item.created_at ? new Date(item.created_at).getTime() : mountTimestamp;
    const ageMs = mountTimestamp - createdAtMs;
    const isTooOldForAnimation = ageMs >= 30000;

    // Check if this item needs reveal animation (not yet revealed)
    // Do this check synchronously, not in useEffect
    const needsRevealAnimation =
      isReadyForReveal &&
      !revealedItemIds.has(trackingId) &&
      !revealComplete &&
      !isTooOldForAnimation;

    // If we need to reveal OR we're already revealing, show revealing state
    const shouldReveal = needsRevealAnimation || isRevealing;

    // Mark as revealed immediately if we're starting the animation
    // This prevents duplicate animations when Phase 2 completes quickly
    if (needsRevealAnimation && !isRevealing) {
      revealedItemIds.add(trackingId);
      // Trigger state update for next frame (keeps isRevealing in sync)
      // Using queueMicrotask to batch with React's updates
      queueMicrotask(() => {
        setIsRevealing(true);
      });
    }

    let visualState: MindDropVisualState =
      itemVisualState === 'enriching' || itemVisualState === 'pending'
        ? itemVisualState // Always show skeleton when processing
        : shouldReveal
          ? 'revealing' // Show revealing when ready (synchronous decision!)
          : revealComplete
            ? 'complete' // Only complete AFTER reveal animation finishes
            : itemVisualState;

    // Enforce forward-only visual state progression (high-water mark)
    // Prevents e.g. 'revealing' → 'enriching' when Phase 2 data arrives
    const STATE_ORDER: MindDropVisualState[] = ['pending', 'enriching', 'revealing', 'complete'];
    const currentIndex = STATE_ORDER.indexOf(visualState);
    const highIndex = STATE_ORDER.indexOf(highWaterMark);
    if (currentIndex >= 0 && highIndex >= 0 && currentIndex < highIndex) {
      visualState = highWaterMark;
    }

    // Advance high-water mark when visual state progresses forward
    React.useEffect(() => {
      const ci = STATE_ORDER.indexOf(visualState);
      const hi = STATE_ORDER.indexOf(highWaterMark);
      if (ci >= 0 && ci > hi) {
        setHighWaterMark(visualState);
      }
    }, [visualState, highWaterMark]);

    // MULTI-DROP EARLY RETURN: Show multi-card immediately, even during pending/enriching
    // Multi-drops have enough info from Phase 0 to render the multi-card shape
    // This bypasses skeleton states so the multi-card appears at ~2s (Phase 0) not ~5s (Phase 1+2)
    // Check if clarification is being processed (user just selected an option)
    const clarificationProcessing =
      item.views?.clarification_processing === true || item.views?.ai_pending === true;

    // CLARIFICATION ITEMS: Skip animation states UNLESS processing
    // - needsClarification && !processing → show clarify card (skip skeleton)
    // - needsClarification && processing → show skeleton (user just selected option)
    if (needsClarification && !clarificationProcessing) {
      // Fall through to complete card render below
    } else if (isMulti) {
      // Fall through to complete card render below (skip skeleton states)
    } else {
      // Phase 1: Still creating entity - show raw text with skeleton for secondary fields
      if (visualState === 'pending') {
        return (
          <PendingSkeleton
            item={item}
            effectiveKind={effectiveKind}
            badgeStyleKey={badgeStyleKey}
            styles={styles}
            c={c}
            index={index}
          />
        );
      }

      // Phase 2: Entity exists, enriching in progress - show shimmers + chip/timestamp
      if (visualState === 'enriching') {
        return (
          <EnrichingSkeleton
            item={item}
            effectiveKind={effectiveKind}
            badgeStyleKey={badgeStyleKey}
            styles={styles}
            c={c}
            index={index}
          />
        );
      }

      // Phase 3: Transitioning - crossfade shimmer to typewriter reveal
      if (visualState === 'revealing') {
        return (
          <RevealingCard
            item={item}
            effectiveKind={effectiveKind}
            displayKind={displayKind}
            badgeStyleKey={badgeStyleKey}
            styles={styles}
            c={c}
            isPending={isPending}
            onRevealComplete={handleRevealComplete}
          />
        );
      }
    }

    // Complete or Failed: Show static content (also used for multi-drops)
    const isFailed = visualState === 'failed';

    // Multi-entity handler - opens modal at parent level
    // Clarification handler - opens standalone popup instead of full overlay
    const handleCardPress = () => {
      if (isMulti) {
        // Modal lives in RecentDrops - just tell parent to open it
        if (onOpenModal) {
          onOpenModal(item);
        }
        return;
      }

      // Check if this item needs clarification
      const needsClarification =
        (item as any)?.needs_clarification || (item.views as any)?.needs_clarification;
      const clarificationResolved =
        (item as any)?.clarification_resolved || (item.views as any)?.clarification_resolved;

      if (needsClarification && !clarificationResolved && openClarificationPopup) {
        // Get clarification data from entity (may be null if Phase 1.5 still loading)
        const question =
          (item as any)?.clarification_question || (item.views as any)?.clarification_question;
        const options =
          (item as any)?.clarification_options || (item.views as any)?.clarification_options;
        // Get original text for context display
        const originalText =
          (item as any)?.text || (item.views as any)?.text || item.title || item.text;

        // console.log('[AnimatedMindDropCard] Opening clarification popup', {
        //   itemId: item.id,
        //   question: question ?? '(loading)',
        //   optionsCount: options?.length ?? 0,
        // });

        // Open standalone popup - show loading state if Phase 1.5 not complete
        openClarificationPopup({
          entityId: item.id,
          entityType: item.kind,
          question: question || null,
          options: options || null,
          originalText: originalText || null,
        });
        return; // Don't open the full overlay
      }

      handleEdit(item.id, item.kind, item.unsorted);
    };

    return (
      <Reanimated.View style={bounceStyle}>
        <Pressable
          key={`${item.kind}:${item.id}`}
          testID={`minddrop-recent-${item.kind}-${item.id}`}
          style={[
            styles.recentCard,
            // Both multi and clarification cards get the same green background
            (isMulti || needsClarification) && { backgroundColor: '#F4F9F4' },
          ]}
          onPress={handleCardPress}
          accessibilityRole="button"
          accessibilityLabel={
            isMulti
              ? 'Tap to decide what to do with multiple items'
              : needsClarification
                ? 'Tap to answer a quick question'
                : `Edit ${item.title || item.text || 'item'}`
          }
        >
          {/* Row 1: Title (left) + Chip (right) */}
          <View style={styles.recentTopRow}>
            <Text numberOfLines={1} style={styles.recentTitle}>
              {isMulti
                ? item.multi_summary_title ||
                  item.views?.multi_summary_title ||
                  item.title ||
                  'Multiple Items'
                : item.title || item.text || '—'}
            </Text>
            <View style={styles.recentTopRight}>
              {effectiveKind === 'note' && (item as any)?.private === true && (
                <Lock size={12} color="#777" />
              )}
              {/* Badge priority: Clarify > Multi > Bucket */}
              {needsClarification ? (
                <ClarifyBadge />
              ) : (
                <AnimatedBadgeTransition trackingId={trackingId} bucketConfirmed={bucketConfirmed}>
                  <Text
                    style={[
                      styles.recentCategoryPill,
                      styles[badgeStyleKey],
                      isMulti && { backgroundColor: 'rgba(156, 166, 224, 0.15)', color: '#7B86C9' },
                    ]}
                  >
                    {isMulti ? 'Multi' : getDisplayKindForChip(effectiveKind, item)}
                  </Text>
                </AnimatedBadgeTransition>
              )}
            </View>
          </View>

          {/* Row 2: Card note (session only), or status indicators */}
          {!isFailed &&
          !isMulti &&
          !needsClarification &&
          sessionCardNotes.get(item.drop_id || item.id) ? (
            <Text style={styles.recentConfirmation} numberOfLines={1}>
              {sessionCardNotes.get(item.drop_id || item.id)}
            </Text>
          ) : isFailed ? (
            <Pressable
              onPress={() => {
                // Emit retry event — RecentDrops will handle it
                eventBus.emit('drop:retry_enrichment', {
                  localId: item.drop_id || item.id,
                  text: item.text || item.title || '',
                  bucket: item.kind === 'note' ? 'log' : item.kind,
                  subtype: item.noteSubtype || null,
                });
              }}
              style={{ flexDirection: 'row', alignItems: 'center', marginTop: -2 }}
            >
              <Animated.Image
                source={require('../../assets/buttonforHP.png')}
                style={{
                  width: 26,
                  height: 26,
                  marginRight: 8,
                  borderRadius: 13,
                }}
              />
              <Text style={{ fontSize: 13, color: '#916908', fontWeight: '600' }}>
                Couldn't finish loading. Tap to retry.
              </Text>
            </Pressable>
          ) : isMulti ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -2 }}>
              <Animated.Image
                source={require('../../assets/buttonforHP.png')}
                style={{
                  width: 26,
                  height: 26,
                  marginRight: 8,
                  borderRadius: 13,
                  transform: [{ scale: gremlyPulseScale }],
                }}
              />
              <Text style={{ fontSize: 13, color: '#4A7C59', fontWeight: '600' }}>
                Should I split these? Tap to decide.
              </Text>
            </View>
          ) : needsClarification ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -2 }}>
              <Animated.Image
                source={require('../../assets/buttonforHP.png')}
                style={{
                  width: 26,
                  height: 26,
                  marginRight: 8,
                  borderRadius: 13,
                  transform: [{ scale: gremlyPulseScale }],
                }}
              />
              <Text style={{ fontSize: 13, color: '#4A7C59', fontWeight: '600' }}>
                Gremly has a question, tap to clarify
              </Text>
            </View>
          ) : null}

          {/* Row 3: Contextual info + time estimate (left) | photo icon + timestamp (right) */}
          {/* Hide chips when card needs clarification - show only timestamp */}
          <View style={styles.recentMetaRow}>
            {/* Left side: Chips (hidden during clarification/multi) */}
            {!needsClarification && !isMulti && (
              <Row3Chips
                item={item}
                effectiveKind={effectiveKind}
                styles={styles}
                isMulti={isMulti}
                onChipAnimationComplete={handleChipAnimationComplete}
              />
            )}
            {/* Left side helper text when clarification or multi */}
            {(needsClarification || isMulti) && (
              <Text style={{ flex: 1, fontSize: 12, color: '#657865', marginLeft: 34 }}>
                no pressure, can sweep it later
              </Text>
            )}
            {/* Right side: photo icon + timestamp */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {item.hasPhotos && <Camera size={14} color="#888" strokeWidth={1.5} />}
              <Text style={styles.recentMetaTime}>{relativeTime(item.created_at)}</Text>
            </View>
          </View>
        </Pressable>
      </Reanimated.View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for React.memo - only re-render if THIS card's data changed
    // Compare by item id and key fields that affect rendering
    if (prevProps.item.id !== nextProps.item.id) return false;
    if (prevProps.item.title !== nextProps.item.title) return false;
    if (prevProps.item.views?.minddrop_stage !== nextProps.item.views?.minddrop_stage) return false;
    if (prevProps.item.views?.confirmation_message !== nextProps.item.views?.confirmation_message)
      return false;
    if (prevProps.item.views?.chip_data_ready !== nextProps.item.views?.chip_data_ready)
      return false;
    // CRITICAL: Re-render when ai_pending or clarification_processing changes
    // This triggers the shimmer animation when user clicks a clarification option
    if (prevProps.item.views?.ai_pending !== nextProps.item.views?.ai_pending) return false;
    if (
      prevProps.item.views?.clarification_processing !==
      nextProps.item.views?.clarification_processing
    )
      return false;
    // Clarification fields - MUST re-render when these change for chip to appear
    if (prevProps.item.views?.needs_clarification !== nextProps.item.views?.needs_clarification)
      return false;
    if (prevProps.item.needs_clarification !== nextProps.item.needs_clarification) return false;
    if (prevProps.item.clarification_resolved !== nextProps.item.clarification_resolved)
      return false;
    if (
      prevProps.item.views?.clarification_resolved !== nextProps.item.views?.clarification_resolved
    )
      return false;
    if (prevProps.item.time_estimate_minutes !== nextProps.item.time_estimate_minutes) return false;
    // Reminders - re-render when reminders array changes (for bell chip)
    const prevReminders = prevProps.item.reminders;
    const nextReminders = nextProps.item.reminders;
    if ((prevReminders?.length ?? 0) !== (nextReminders?.length ?? 0)) return false;
    if (prevReminders?.[0]?.id !== nextReminders?.[0]?.id) return false;
    if (prevProps.item.frequency !== nextProps.item.frequency) return false; // Habit frequency
    if (prevProps.item.cadence !== nextProps.item.cadence) return false; // Habit cadence
    if (prevProps.isPending !== nextProps.isPending) return false;
    if (prevProps.effectiveKind !== nextProps.effectiveKind) return false;
    // Tags comparison (shallow array check)
    const prevTags = prevProps.item.tags || [];
    const nextTags = nextProps.item.tags || [];
    if (prevTags.length !== nextTags.length) return false;
    for (let i = 0; i < prevTags.length; i++) {
      if (prevTags[i] !== nextTags[i]) return false;
    }
    // Multi-drop comparison - re-render when isMulti or segments change
    if (prevProps.item.is_multi !== nextProps.item.is_multi) return false;
    const prevSegments = prevProps.item.multi_items || [];
    const nextSegments = nextProps.item.multi_items || [];
    if (prevSegments.length !== nextSegments.length) return false;
    for (let i = 0; i < prevSegments.length; i++) {
      if (prevSegments[i]?.bucket !== nextSegments[i]?.bucket) return false;
      // Check preview_title to detect when Phase 1 updates segment titles
      if (prevSegments[i]?.preview_title !== nextSegments[i]?.preview_title) return false;
    }
    return true; // Props are equal, skip re-render
  },
);

// Display name for debugging
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
  const canCreate = useCanCreate();
  const recentDropsNavigation = useNavigation<any>();
  const deleteNote = useGremlyStore((s) => s.deleteNote);
  const deleteTodo = useGremlyStore((s) => s.deleteTodo);
  const deleteHabit = useGremlyStore((s) => s.deleteHabit);
  // Multi-entity handlers need these
  const updateNote = useGremlyStore((s) => s.updateNote);
  const createTodo = useGremlyStore((s) => s.createTodo);
  const createHabit = useGremlyStore((s) => s.createHabit);
  const createNote = useGremlyStore((s) => s.createNote);
  const archiveNote = useGremlyStore((s) => s.archiveNote);
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

  // Modal state lifted from AnimatedMindDropCard to prevent remount issues
  // Modal stays visible even when card remounts due to pending→real transition
  const [activeModalItem, setActiveModalItem] = React.useState<UnifiedDrop | null>(null);

  // Handler to open modal from child card
  const handleOpenModal = React.useCallback((item: UnifiedDrop) => {
    // console.log('[RecentDrops] Opening modal for item:', item.id, item.drop_id);
    setActiveModalItem(item);
  }, []);

  // Transform queue items to UnifiedDrop array
  // Uses a ref-based cache keyed by QueuedDrop object reference to preserve
  // UnifiedDrop references for unchanged drops (prevents unnecessary re-renders)
  const prevDropMappingRef = React.useRef<Map<QueuedDrop, UnifiedDrop>>(new Map());

  const pendingItems = React.useMemo((): UnifiedDrop[] => {
    const activeDrops = queueItems.filter(
      (drop) => drop.phase !== 'complete' && drop.phase !== 'failed',
    );

    const newMapping = new Map<QueuedDrop, UnifiedDrop>();

    const result = activeDrops
      .map((drop): UnifiedDrop => {
        // If the QueuedDrop reference is the same, reuse the old UnifiedDrop
        const cached = prevDropMappingRef.current.get(drop);
        if (cached) {
          console.log('[CACHE] Hit for:', drop.localId);
          newMapping.set(drop, cached);
          return cached;
        }
        console.log('[CACHE] Miss for:', drop.localId);

        // QueuedDrop changed — create new UnifiedDrop
        const kind: 'todo' | 'habit' | 'note' =
          drop.bucket === 'todo' ? 'todo' : drop.bucket === 'habit' ? 'habit' : 'note';

        const noteSubtype =
          kind === 'note'
            ? drop.subtype === 'journal'
              ? 'journal'
              : drop.subtype === 'idea'
                ? 'idea'
                : drop.subtype === 'event'
                  ? 'event'
                  : 'catchall'
            : undefined;

        const hasEnrichmentFields = !!drop.smartTitle || !!drop.confirmationMessage;

        const minddropStage =
          !drop.phase || drop.phase === 'queued'
            ? 'pending'
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

        const displayTitle =
          drop.isMulti && drop.multiSummary
            ? drop.multiSummary
            : drop.smartTitle ||
              drop.text.substring(0, 60) + (drop.text.length > 60 ? '\u2026' : '');

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
            card_note: drop.cardNote,
            people: drop.people,
            chip_data_ready: drop.phase === 'enriched',
            bucket_confirmed: bucketConfirmed,
            is_multi: drop.isMulti,
            multi_segments: drop.multiSegments,
            multi_summary: drop.multiSummary,
            needs_clarification: drop.needsClarification,
            clarification_type: drop.clarificationType,
            clarification_question: drop.clarificationQuestion,
            clarification_options: drop.clarificationOptions,
            clarification_resolved: false,
          },
          time_estimate_minutes: drop.timeEstimateMinutes ?? null,
          frequency: drop.extractedFrequency ?? null,
          days_active: drop.extractedDays ?? null,
          mood: drop.mood ? (drop.mood as any) : null,
          is_multi: drop.isMulti,
          multi_items: drop.multiSegments?.map((seg) => ({
            text: seg.text,
            bucket: seg.bucket,
            subtype: seg.subtype ?? null,
            habitSubtype: null,
            preview_title: seg.smart_title || seg.text.substring(0, 40),
            smart_title: seg.smart_title ?? null,
            confirmation_message: seg.confirmation_message ?? null,
          })),
          multi_summary_title: drop.multiSummary,
        };

        newMapping.set(drop, unified);
        if (drop.cardNote) {
          sessionCardNotes.set(drop.localId, drop.cardNote);
        }
        console.log('[card_note:3] Unified views:', {
          card_note: drop.cardNote,
          localId: drop.localId,
          inSession: sessionCardNotes.has(drop.localId),
        });
        return unified;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    prevDropMappingRef.current = newMapping;
    return result;
  }, [queueItems]);

  // Get drop_ids of all pending items to filter out duplicates from real items
  const pendingDropIds = React.useMemo(() => {
    return new Set(pendingItems.map((p) => p.drop_id).filter(Boolean));
  }, [pendingItems]);

  // Filter real items to exclude any that still have a pending version
  // This prevents the "jolt" when a pending item is promoted to a real entity
  const filteredItems = React.useMemo(() => {
    if (pendingDropIds.size === 0) return items;
    return items.filter((item) => !item.drop_id || !pendingDropIds.has(item.drop_id));
  }, [items, pendingDropIds]);

  // Memoized combined list: merge pending + real items, sort, deduplicate.
  // Uses original object references (no spread) so React.memo on cards stays effective.
  const { combinedItems, pendingIdSet } = React.useMemo(() => {
    const pending = new Set(pendingItems.map((p) => p.drop_id || p.id));
    const merged = [...pendingItems, ...filteredItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
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

  // Keep modal item synced with latest version from items/pendingItems
  // (in case Phase 1 updates segments while modal is open)
  const currentModalItem = React.useMemo(() => {
    if (!activeModalItem) return null;
    // Find the current version of this item by drop_id or id in both lists
    const dropId = activeModalItem.drop_id || activeModalItem.id;
    const fromPending = pendingItems.find((i) => (i.drop_id || i.id) === dropId);
    if (fromPending) return fromPending;
    const fromItems = items.find((i) => (i.drop_id || i.id) === dropId);
    return fromItems || activeModalItem;
  }, [activeModalItem, pendingItems, items]);

  /**
   * Helper to merge a DB record into the local items state
   * Used when real-time updates arrive from Supabase
   */
  const mergeDbRecordIntoItems = React.useCallback(
    (prev: UnifiedDrop[], record: any, kind: 'todo' | 'habit' | 'note'): UnifiedDrop[] => {
      if (!record?.id) return prev;

      // If the record is archived (note) or completed (todo/habit), remove it from the list
      if (kind === 'note' && record.archived === true) {
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
          multi_items: record.views?.multi_items ?? undefined,
          multi_summary_title: record.views?.multi_summary_title ?? undefined,
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
          multi_items: views?.multi_items ?? item.multi_items ?? undefined,
          multi_summary_title: views?.multi_summary_title ?? item.multi_summary_title ?? undefined,
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
      const threeDaysAgo = getDateService().now();
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
          const { compact: derivedTitle } = deriveCompactTitle(
            [n.title, n.body, noteAny.text, noteAny.content, rawText],
            { fallback: rawText },
          );

          return {
            id: n.id,
            kind: 'note' as const,
            title: derivedTitle || rawText || 'Untitled note',
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
            // Multi-entity support: extract from views to top level
            is_multi: noteAny?.views?.is_multi === true,
            multi_items: noteAny?.views?.multi_items ?? undefined,
            multi_summary_title: noteAny?.views?.multi_summary_title ?? undefined,
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
          const { compact: derivedTitle } = deriveCompactTitle([t.title, t.name, rawText], {
            fallback: rawText,
          });
          return {
            id: t.id,
            kind: 'todo' as const,
            title: derivedTitle || rawText || 'Untitled',
            text: rawText,
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
          const { compact: derivedTitle } = deriveCompactTitle([h.name, rawText], {
            fallback: rawText,
          });
          return {
            id: h.id,
            kind: 'habit' as const,
            title: derivedTitle || rawText || 'Untitled',
            text: rawText,
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
        // console.log('[CatchAllNotepad] entity:created received', {
        //   dropId,
        //   type: payload.type,
        //   entityId: payload.entity?.id,
        //   source: payload.source,
        //   title: payload.entity?.title ?? payload.entity?.name,
        // });

        // CRITICAL: For clarification bucket changes, reset animation tracking
        // so the new entity shows fresh animations (shimmer, typewriter, mist, bounce)
        if (payload.source === 'clarification-bucket-change' && dropId) {
          resetAnimationTrackingForDrop(dropId);
        }

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
            multi_items: entity.views?.multi_items ?? undefined,
            multi_summary_title: entity.views?.multi_summary_title ?? undefined,
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
        // Remove the item immediately from local state
        setItems((prev) => prev.filter((item) => item.id !== payload.id));
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

        // CRITICAL: If clarification_processing just started, reset animation tracking
        // so the card shows fresh shimmer animation
        if (views.clarification_processing === true || views.ai_pending === true) {
          const dropId = (entity as any).drop_id;
          if (dropId) {
            // console.log(
            //   '[RecentDrops] ItemUpdated: resetting animation tracking for clarification',
            //   { dropId },
            // );
            resetAnimationTrackingForDrop(dropId);
          }
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
  }, [load]);

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

  // Multi-entity: Keep as note handler
  const handleKeepAsNote = React.useCallback(
    async (noteId: string) => {
      if (!canCreate) {
        recentDropsNavigation.navigate('TrialEndPaywall', { source: 'expiry' });
        return;
      }
      // Close modal first (modal is at RecentDrops level now)
      setActiveModalItem(null);

      try {
        const noteToUpdate = items.find((item) => item.id === noteId);
        if (!noteToUpdate) return;

        const dominantBucket = noteToUpdate.views?.dominant_bucket;
        const dominantSubtype = noteToUpdate.views?.dominant_subtype;
        const originalText = noteToUpdate.text || noteToUpdate.title || '';
        const spaceId = noteToUpdate.views?.space_id ?? null;

        // If dominant_bucket is todo or habit, convert to that type instead of keeping as note
        if (dominantBucket === 'todo') {
          // Create a todo from this note
          const newTodo = await createTodo({
            name: noteToUpdate.title || originalText,
            body: originalText,
            space_id: spaceId,
            origin: 'catchall',
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
              origin: 'multi_kept_together',
            },
          } as any);

          if (newTodo?.id) {
            // Archive the original note
            await archiveNote(noteId, 'converted_to_todo');

            // Update local state: remove note, add todo
            setItems((prev) => {
              const withoutOriginal = prev.filter((item) => item.id !== noteId);
              const newItem: UnifiedDrop = {
                id: newTodo.id,
                kind: 'todo',
                title: noteToUpdate.title || originalText,
                text: originalText,
                created_at: nowTimestamp(),
                tags: [],
                views: { minddrop_stage: 'classified', ai_pending: true },
                labels: [],
              };
              return [newItem, ...withoutOriginal];
            });

            // Phase 1.5a: fetch smart_title and confirmation_message
            try {
              const cortexUrl = process.env.EXPO_PUBLIC_CORTEX_URL || '';
              const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
              const ctrl = new AbortController();
              const t = setTimeout(() => ctrl.abort(), 10000);
              const p15aRes = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                  type: 'enrich-phase1-5a',
                  text: originalText,
                  bucket: 'todo',
                  subtype: null,
                }),
                signal: ctrl.signal,
              });
              clearTimeout(t);
              if (p15aRes.ok) {
                const p15aData = await p15aRes.json();
                const smartTitle = p15aData?.smart_title;
                const confirmMsg = p15aData?.confirmation_message;
                if (
                  (smartTitle && typeof smartTitle === 'string') ||
                  (confirmMsg && typeof confirmMsg === 'string')
                ) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === newTodo.id
                        ? {
                            ...item,
                            ...(smartTitle ? { title: smartTitle } : {}),
                            views: {
                              ...item.views,
                              ...(confirmMsg ? { confirmation_message: confirmMsg } : {}),
                            },
                          }
                        : item,
                    ),
                  );
                  // Persist smart_title to DB so Phase 2's hasPhase1SmartTitle check sees it
                  if (smartTitle && typeof smartTitle === 'string') {
                    try {
                      await repo.update({
                        id: newTodo.id,
                        patch: { name: smartTitle, title: smartTitle } as any,
                      });
                    } catch (dbErr) {
                      console.warn(
                        '[RecentDrops:Phase1.5a] DB write failed for todo, continuing',
                        dbErr,
                      );
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[RecentDrops:Phase1.5a] Failed for todo, continuing', e);
            }

            // Run Phase 2 enrichment (non-streaming)
            runPhase2(newTodo.id, originalText, 'todo', null, repo)
              .then((result) => {
                console.log(`[RecentDrops:Phase2:${newTodo.id}] Complete`, result);
                // Update local state with ALL enrichment fields so chips animate together
                if (result) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === newTodo.id ? applyEnrichmentToItem(item, result) : item,
                    ),
                  );
                }
              })
              .catch((err) => console.warn('[RecentDrops:Phase2] Enrichment failed', err));

            console.log('[RecentDrops] Converted multi-drop to todo:', newTodo.id);
          }
          return;
        }

        if (dominantBucket === 'habit') {
          // Create a habit from this note
          const newHabit = await createHabit({
            name: noteToUpdate.title || originalText,
            title: noteToUpdate.title || originalText,
            notes: originalText,
            frequency: 'daily',
            subtype: 'start_habit',
            space_id: spaceId,
            origin: 'catchall',
            views: {
              minddrop_stage: 'classified',
              ai_pending: true,
              origin: 'multi_kept_together',
            },
          } as any);

          if (newHabit?.id) {
            // Archive the original note
            await archiveNote(noteId, 'converted_to_habit');

            // Update local state: remove note, add habit
            setItems((prev) => {
              const withoutOriginal = prev.filter((item) => item.id !== noteId);
              const newItem: UnifiedDrop = {
                id: newHabit.id,
                kind: 'habit',
                title: noteToUpdate.title || originalText,
                text: originalText,
                created_at: nowTimestamp(),
                tags: [],
                views: { minddrop_stage: 'classified', ai_pending: true },
                labels: [],
              };
              return [newItem, ...withoutOriginal];
            });

            // Phase 1.5a: fetch smart_title and confirmation_message
            try {
              const cortexUrl = process.env.EXPO_PUBLIC_CORTEX_URL || '';
              const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
              const ctrl = new AbortController();
              const t = setTimeout(() => ctrl.abort(), 10000);
              const p15aRes = await fetch(cortexUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${anonKey}`,
                },
                body: JSON.stringify({
                  type: 'enrich-phase1-5a',
                  text: originalText,
                  bucket: 'habit',
                  subtype: null,
                }),
                signal: ctrl.signal,
              });
              clearTimeout(t);
              if (p15aRes.ok) {
                const p15aData = await p15aRes.json();
                const smartTitle = p15aData?.smart_title;
                const confirmMsg = p15aData?.confirmation_message;
                if (
                  (smartTitle && typeof smartTitle === 'string') ||
                  (confirmMsg && typeof confirmMsg === 'string')
                ) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === newHabit.id
                        ? {
                            ...item,
                            ...(smartTitle ? { title: smartTitle } : {}),
                            views: {
                              ...item.views,
                              ...(confirmMsg ? { confirmation_message: confirmMsg } : {}),
                            },
                          }
                        : item,
                    ),
                  );
                  // Persist smart_title to DB so Phase 2's hasPhase1SmartTitle check sees it
                  if (smartTitle && typeof smartTitle === 'string') {
                    try {
                      await repo.update({
                        id: newHabit.id,
                        patch: { name: smartTitle, title: smartTitle } as any,
                      });
                    } catch (dbErr) {
                      console.warn(
                        '[RecentDrops:Phase1.5a] DB write failed for habit, continuing',
                        dbErr,
                      );
                    }
                  }
                }
              }
            } catch (e) {
              console.warn('[RecentDrops:Phase1.5a] Failed for habit, continuing', e);
            }

            // Run Phase 2 enrichment (non-streaming)
            runPhase2(newHabit.id, originalText, 'habit', null, repo)
              .then((result) => {
                console.log(`[RecentDrops:Phase2:${newHabit.id}] Complete`, result);
                // Update local state with ALL enrichment fields so chips animate together
                if (result) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === newHabit.id ? applyEnrichmentToItem(item, result) : item,
                    ),
                  );
                }
              })
              .catch((err) => console.warn('[RecentDrops:Phase2] Enrichment failed', err));

            console.log('[RecentDrops] Converted multi-drop to habit:', newHabit.id);
          }
          return;
        }

        // Default: keep as note (log bucket)
        const noteSubtype =
          dominantSubtype === 'journal'
            ? 'journal'
            : dominantSubtype === 'idea'
              ? 'idea'
              : 'catchall';

        await updateNote(noteId, {
          subtype: noteSubtype,
          views: {
            ...noteToUpdate.views,
            is_multi: false,
            minddrop_stage: 'classified',
            ai_pending: true,
            multi_items: undefined,
            multi_summary_title: undefined,
          },
        } as any);

        // Update local state
        setItems((prev) =>
          prev.map((item) =>
            item.id === noteId
              ? {
                  ...item,
                  is_multi: false,
                  noteSubtype: noteSubtype,
                  views: {
                    ...item.views,
                    is_multi: false,
                    minddrop_stage: 'classified',
                    ai_pending: true,
                  },
                }
              : item,
          ),
        );

        // Phase 1.5a: fetch smart_title and confirmation_message
        try {
          const cortexUrl = process.env.EXPO_PUBLIC_CORTEX_URL || '';
          const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const p15aRes = await fetch(cortexUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              type: 'enrich-phase1-5a',
              text: originalText,
              bucket: 'log',
              subtype: noteSubtype,
            }),
            signal: ctrl.signal,
          });
          clearTimeout(t);
          if (p15aRes.ok) {
            const p15aData = await p15aRes.json();
            const smartTitle = p15aData?.smart_title;
            const confirmMsg = p15aData?.confirmation_message;
            if (
              (smartTitle && typeof smartTitle === 'string') ||
              (confirmMsg && typeof confirmMsg === 'string')
            ) {
              setItems((prev) =>
                prev.map((item) =>
                  item.id === noteId
                    ? {
                        ...item,
                        ...(smartTitle ? { title: smartTitle } : {}),
                        views: {
                          ...item.views,
                          ...(confirmMsg ? { confirmation_message: confirmMsg } : {}),
                        },
                      }
                    : item,
                ),
              );
              // Persist smart_title to DB so Phase 2's hasPhase1SmartTitle check sees it
              if (smartTitle && typeof smartTitle === 'string') {
                try {
                  await repo.update({ id: noteId, patch: { title: smartTitle } as any });
                } catch (dbErr) {
                  console.warn(
                    '[RecentDrops:Phase1.5a] DB write failed for log, continuing',
                    dbErr,
                  );
                }
              }
            }
          }
        } catch (e) {
          console.warn('[RecentDrops:Phase1.5a] Failed for log, continuing', e);
        }

        // Run Phase 2 enrichment for the note (non-streaming)
        runPhase2(noteId, originalText, 'log', dominantSubtype || 'general', repo)
          .then((result) => {
            console.log(`[RecentDrops:Phase2:${noteId}] Complete`, result);
            // Update local state with ALL enrichment fields so chips animate together
            if (result) {
              setItems((prev) =>
                prev.map((item) =>
                  item.id === noteId ? applyEnrichmentToItem(item, result) : item,
                ),
              );
            }
          })
          .catch((err) => console.warn('[RecentDrops:Phase2] Enrichment failed', err));

        console.log('[RecentDrops] Kept multi-drop as note with subtype:', noteSubtype);
      } catch (err) {
        console.error('[RecentDrops] Failed to keep as note:', err);
      }
    },
    [
      canCreate,
      recentDropsNavigation,
      items,
      updateNote,
      createTodo,
      createHabit,
      archiveNote,
      repo,
    ],
  );

  // Multi-entity: Split selected items handler
  const handleSplitSelected = React.useCallback(
    async (noteId: string, selectedItems: MultiDropItem[]) => {
      if (!canCreate) {
        recentDropsNavigation.navigate('TrialEndPaywall', { source: 'expiry' });
        return;
      }
      // Close modal first (modal is at RecentDrops level now)
      setActiveModalItem(null);

      // console.log('[RecentDrops] Splitting multi-drop into', selectedItems.length, 'items');
      // console.log(
      //   '[RecentDrops] Split items detail:',
      //   selectedItems.map((item) => ({
      //     text: item.text.substring(0, 30),
      //     bucket: item.bucket,
      //     subtype: item.subtype,
      //     habitSubtype: item.habitSubtype,
      //     smart_title: item.smart_title,
      //     confirmation_message: item.confirmation_message,
      //   })),
      // );
      const noteToSplit = items.find((item) => item.id === noteId);
      const spaceId = noteToSplit?.views?.space_id ?? null;
      const now = getDateService().now().getTime();

      // 1. Create optimistic items immediately for instant visual feedback
      const optimisticItems: UnifiedDrop[] = selectedItems.map((splitItem, index) => {
        const tempId = `temp-split-${now}-${index}`;
        const kind: 'todo' | 'habit' | 'note' =
          splitItem.bucket === 'todo' ? 'todo' : splitItem.bucket === 'habit' ? 'habit' : 'note';

        // Use smart_title from Phase 1 if available, fall back to preview_title or raw text
        const displayTitle = splitItem.smart_title || splitItem.preview_title || splitItem.text;

        return {
          id: tempId,
          kind,
          title: displayTitle,
          text: splitItem.text,
          created_at: nowTimestamp(),
          drop_id: `split-${noteId}-${index}`,
          tags: [],
          views: {
            minddrop_stage: 'classified',
            ai_pending: true,
            origin: 'multi_split',
            // Store confirmation_message for display
            confirmation_message: splitItem.confirmation_message ?? null,
          },
          labels: [],
          noteSubtype:
            kind === 'note'
              ? splitItem.subtype === 'journal'
                ? 'journal'
                : splitItem.subtype === 'idea'
                  ? 'idea'
                  : 'catchall'
              : undefined,
        };
      });

      // 2. Update UI immediately: remove original, add optimistic items
      setItems((prev) => {
        const withoutOriginal = prev.filter((item) => item.id !== noteId);
        return [...optimisticItems, ...withoutOriginal];
      });

      console.log(
        '[RecentDrops] Added optimistic items:',
        optimisticItems.map((o) => ({
          id: o.id,
          title: o.title,
          kind: o.kind,
        })),
      );

      // 3. Create actual entities in database (async, in background)
      try {
        for (let i = 0; i < selectedItems.length; i++) {
          const splitItem = selectedItems[i];
          const optimisticId = optimisticItems[i].id;
          const bucket: MindDropBucket = splitItem.bucket;
          const subtype: MindDropLogSubtype | null = splitItem.subtype;
          let newEntity: { id: string } | null = null;

          // Use smart_title from Phase 1 if available
          const entityTitle = splitItem.smart_title || splitItem.preview_title || splitItem.text;

          if (splitItem.bucket === 'todo') {
            newEntity = await createTodo({
              name: entityTitle,
              body: splitItem.text,
              space_id: spaceId,
              origin: 'catchall',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_split',
                source_drop_id: noteId,
                confirmation_message: splitItem.confirmation_message ?? null,
              },
            } as any);
          } else if (splitItem.bucket === 'habit') {
            newEntity = await createHabit({
              name: entityTitle,
              title: entityTitle,
              notes: splitItem.text,
              frequency: 'daily',
              subtype: splitItem.habitSubtype || 'start_habit',
              space_id: spaceId,
              origin: 'catchall',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_split',
                source_drop_id: noteId,
                confirmation_message: splitItem.confirmation_message ?? null,
              },
            } as any);
          } else {
            // log bucket -> note
            const noteSubtype =
              splitItem.subtype === 'journal'
                ? 'journal'
                : splitItem.subtype === 'idea'
                  ? 'idea'
                  : 'catchall';
            newEntity = await createNote({
              title: entityTitle,
              body: splitItem.text,
              subtype: noteSubtype,
              space_id: spaceId,
              origin: 'catchall',
              views: {
                minddrop_stage: 'classified',
                ai_pending: true,
                origin: 'multi_split',
                source_drop_id: noteId,
                confirmation_message: splitItem.confirmation_message ?? null,
              },
            } as any);
          }

          // Replace optimistic item with real item
          if (newEntity?.id) {
            setItems((prev) =>
              prev.map((item) =>
                item.id === optimisticId
                  ? { ...item, id: newEntity!.id, drop_id: item.drop_id }
                  : item,
              ),
            );

            // Trigger Phase 2 enrichment for the new entity (non-streaming)
            const entityIdForPhase2 = newEntity.id;
            runPhase2(entityIdForPhase2, splitItem.text, bucket, subtype, repo)
              .then((result) => {
                console.log(`[RecentDrops:Phase2:${entityIdForPhase2}] Complete`, result);
                // Update local state with ALL enrichment fields so chips animate together
                if (result) {
                  setItems((prev) =>
                    prev.map((item) =>
                      item.id === entityIdForPhase2 ? applyEnrichmentToItem(item, result) : item,
                    ),
                  );
                }
              })
              .catch((err) => {
                console.warn('[RecentDrops:Phase2] Enrichment failed', err);
                // Reset card state so it doesn't stay stuck in enriching
                setItems((prev) =>
                  prev.map((item) =>
                    item.id === entityIdForPhase2
                      ? {
                          ...item,
                          views: {
                            ...item.views,
                            minddrop_stage: 'enriched',
                            ai_pending: false,
                          },
                        }
                      : item,
                  ),
                );
              });
          }
        }

        // Archive the original multi-drop note
        await archiveNote(noteId, 'split_completed');

        console.log('[RecentDrops] Split complete, archived original:', noteId);
      } catch (err) {
        console.error('[RecentDrops] Failed to split multi-drop:', err);
        // On error, remove optimistic items (they weren't created)
        setItems((prev) => prev.filter((item) => !item.id.startsWith('temp-split-')));
      }
    },
    [
      canCreate,
      recentDropsNavigation,
      items,
      createTodo,
      createHabit,
      createNote,
      archiveNote,
      repo,
    ],
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
                const effectiveKind = item.optimisticKind ?? item.kind;
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
                return (
                  <UnifiedCardWrapper
                    key={stableKey}
                    itemId={item.id}
                    dropId={item.drop_id}
                    isPending={itemIsPending}
                  >
                    <AnimatedMindDropCard
                      item={item}
                      isPending={isPending}
                      effectiveKind={effectiveKind}
                      displayKind={displayKind}
                      showLegacyUnsortedBadge={itemIsPending ? undefined : showLegacyUnsortedBadge}
                      badgeStyleKey={badgeStyleKey}
                      c={c}
                      styles={styles}
                      mode={themeMode}
                      handleEdit={itemIsPending ? NOOP_EDIT : handleEdit}
                      handleDelete={itemIsPending ? NOOP_DELETE : handleDelete}
                      onKeepAsNote={handleKeepAsNote}
                      onSplitSelected={handleSplitSelected}
                      onOpenModal={handleOpenModal}
                      openClarificationPopup={overlay.openClarificationPopup}
                    />
                  </UnifiedCardWrapper>
                );
              })}
            </AppScrollView>
          )}
        </View>
      ) : null}

      {/* Multi-entity modal lifted to RecentDrops level - survives card remounts */}
      {currentModalItem && (
        <MultiSplitModal
          visible={!!currentModalItem}
          items={currentModalItem.multi_items || currentModalItem.views?.multi_items || []}
          summaryTitle={
            currentModalItem.multi_summary_title ||
            currentModalItem.views?.multi_summary_title ||
            'Multiple Items'
          }
          originalText={currentModalItem.text || currentModalItem.title || ''}
          dominantBucket={currentModalItem.views?.dominant_bucket || null}
          dominantSubtype={currentModalItem.views?.dominant_subtype || null}
          onClose={() => setActiveModalItem(null)}
          onKeepAsNote={() => handleKeepAsNote(currentModalItem.id)}
          onSplitSelected={(selectedItems) =>
            handleSplitSelected(currentModalItem.id, selectedItems)
          }
        />
      )}
    </View>
  );
};

// Memoize RecentDrops to avoid re-rendering when parent state (trust, tips) changes
const RecentDropsMemo = React.memo(RecentDrops);

// Named export for tests to import the isolated component
export const RecentDropsTestable = RecentDrops;

export default RecentDropsMemo;
