/**
 * NowFocusRow - Divider-style row for Today focus items
 *
 * Layout:
 * - Diamond lock icon inline with title for locked items
 * - Title text gets full width
 * - Clean divider lines between items
 * - Satisfying completion animation with swipe-out and message reveal
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { TouchableOpacity, View, StyleSheet, Image, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { useReducedMotion } from '../../design/animations';
import { triggerMedium } from '../../lib/haptics';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';
import { Flame, RotateCcw, RefreshCw, Calendar } from 'lucide-react-native';
import { computeHabitMetadata } from '../../lib/today/hooks/useHabitMetadata';
import { useGremlyStore } from '../../lib/store/useGremlyStore';
import { BRAND } from '../../design/brand';
import { getFrequencyLabel } from '../../lib/sweep/habitHelpers';

// Icon map for habit metadata
const MetadataIconMap = {
  Flame,
  RotateCcw,
  RefreshCw,
  Calendar,
} as const;

// Gremly face icon for completion messages
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_FACE = require('../../assets/buttonforHP.png');

// Screen width for swipe-out animation
const SCREEN_WIDTH = Dimensions.get('window').width;

// Brand green for lock-in elements and One Thing accent
const BRAND_GREEN = '#2E5540';

// Time block display labels - converts stored values to user-friendly labels
const TIME_BLOCK_LABELS: Record<string, string> = {
  morning: 'Morning',
  day: 'Afternoon',
  evening: 'Evening',
};

// Divider color
const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.08)';

// Completion messages - randomly selected
const COMPLETION_MESSAGES = [
  'Nice one',
  'Done and dusted',
  'Crushed it',
  'Look at you go',
  'One down',
  'Boom',
  "You're on a roll",
  "That's the way",
  'Nailed it',
  'Progress!',
];

// Animation timing constants (in ms) - snappy but satisfying
const TIMING = {
  CHECKBOX_FILL: 120, // Step 1: Checkbox fills
  PAUSE_AFTER_CHECK: 150, // Step 2: Brief pause
  STRIKETHROUGH: 300, // Step 3: Strikethrough animates
  UNDO_WINDOW: 1200, // Step 4: Undo window
  SWIPE_OUT: 400, // Step 5: Card swipes right
  MESSAGE_VISIBLE: 900, // Step 6: Message holds
  MESSAGE_FADE: 250, // Step 7: Message fades
  COLLAPSE: 300, // Step 8: Cards slide up
};

// Row height including padding
const ROW_HEIGHT = 56; // Height for 2-line layout (title + metadata)

type NowItem = NowLockedItem | NowActiveItem | NowFutureItem;

type AnimationPhase =
  | 'idle'
  | 'checked'
  | 'strikethrough'
  | 'waiting'
  | 'swiping'
  | 'message'
  | 'collapsing'
  | 'done';

interface NowFocusRowProps {
  item: NowItem;
  isCompleted?: boolean;
  isFuture?: boolean;
  isLocked?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  isOneThing?: boolean;
  timeBlock?: 'morning' | 'day' | 'evening' | null;
  onPress?: () => void;
  onToggleComplete?: () => void;
  onAnimationComplete?: () => void;
}

/**
 * Format time estimate in minutes to a human-readable string.
 * Examples: 15 -> "15 min", 60 -> "1 hr", 90 -> "1.5 hrs"
 */
function formatTimeEstimate(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours === 1) return '1 hr';
  if (Number.isInteger(hours)) return `${hours} hrs`;
  return `${hours.toFixed(1)} hrs`;
}

export function NowFocusRow({
  item,
  isCompleted = false,
  isFuture = false,
  isLocked = false,
  isFirst = false,
  isLast: _isLast = false,
  isOneThing: _isOneThing = false,
  timeBlock = null,
  onPress,
  onToggleComplete,
  onAnimationComplete,
}: NowFocusRowProps) {
  // DEBUG - remove after fixing
  console.log(
    '[NowFocusRow] item:',
    item.name,
    'type:',
    item.type,
    'timeBlock:',
    timeBlock,
    'isLocked:',
    isLocked,
  );

  const tokens = useTokens();
  const reducedMotion = useReducedMotion();
  const habitProgress = useGremlyStore((s) => s.habitProgress);
  // Get the full habit from store to access frequency field
  const habits = useGremlyStore((s) => s.habits);
  // Get the full todo from store to access time_estimate_minutes
  const todos = useGremlyStore((s) => s.todos);

  // Look up the full habit from the store to get the frequency field
  const fullHabit = item.type === 'habit' ? habits.find((h) => h.id === item.id) : null;

  // Look up the full todo from the store to get time_estimate_minutes
  const fullTodo = item.type === 'todo' ? todos.find((t) => t.id === item.id) : null;

  // Compute time estimate label for todos
  const timeEstimateLabel = React.useMemo(() => {
    if (item.type !== 'todo' || !fullTodo) return null;
    return formatTimeEstimate(fullTodo.time_estimate_minutes);
  }, [item.type, fullTodo]);

  // Compute frequency label using centralized helper from habitHelpers
  const frequencyLabel = React.useMemo(() => {
    if (item.type !== 'habit' || !fullHabit) return null;
    return getFrequencyLabel(fullHabit);
  }, [item.type, fullHabit]);

  // Compute habit metadata for habits (streak/progress icons)
  const habitMetadata = React.useMemo(() => {
    if (item.type !== 'habit') return null;

    try {
      // Create a minimal habit object for the metadata computation
      // Use fullHabit from Zustand for accurate cadence/target data
      const habitForMetadata = {
        id: item.id,
        name: item.name,
        cadence: (fullHabit?.cadence ?? ('cadence' in item ? item.cadence : 'daily')) as
          | 'daily'
          | 'weekly'
          | 'monthly',
        target_per_period:
          fullHabit?.target_per_period ??
          ('target_per_period' in item ? (item.target_per_period as number) : 1),
        frequency: fullHabit?.frequency,
      };
      return computeHabitMetadata(habitForMetadata, habitProgress);
    } catch (e) {
      // If computeHabitMetadata fails (bundler issue), return null
      console.warn('[NowFocusRow] computeHabitMetadata error:', e);
      return null;
    }
  }, [item, habitProgress, fullHabit]);

  const MetadataIcon = habitMetadata ? MetadataIconMap[habitMetadata.icon] : null;

  // Check if this is a flexible weekly habit (should be dimmed)
  const isFlexible =
    item.type === 'habit' && 'weeklyStatus' in item && item.weeklyStatus === 'flexible';

  // Animation state
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>('idle');
  const [localChecked, setLocalChecked] = useState(false);
  const [showStrikethrough, setShowStrikethrough] = useState(false);
  const [completionMessage] = useState(
    () => COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)],
  );
  const [measuredHeight, setMeasuredHeight] = useState(ROW_HEIGHT);

  // Refs for managing timeouts
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strikethroughTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shared values for animations
  const translateX = useSharedValue(0);
  const rowHeight = useSharedValue(measuredHeight);
  const messageOpacity = useSharedValue(0);
  const checkboxScale = useSharedValue(1);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      if (strikethroughTimeoutRef.current) clearTimeout(strikethroughTimeoutRef.current);
    };
  }, []);

  // Handle animation completion callback
  const handleAnimationDone = useCallback(() => {
    setAnimationPhase('done');
    onToggleComplete?.(); // Update data AFTER animation completes
    onAnimationComplete?.();
  }, [onToggleComplete, onAnimationComplete]);

  // Start the swipe-out animation sequence (after undo window expires)
  const startSwipeOutSequence = useCallback(() => {
    if (reducedMotion) {
      handleAnimationDone();
      return;
    }

    setAnimationPhase('swiping');

    // Step 5: Card swipes out (500ms with ease-out)
    // eslint-disable-next-line react-hooks/immutability
    translateX.value = withTiming(
      SCREEN_WIDTH + 50, // Go fully off screen
      {
        duration: TIMING.SWIPE_OUT,
        easing: Easing.out(Easing.cubic), // Starts fast, slows at end
      },
      () => {
        // When swipe completes, show message
        runOnJS(setAnimationPhase)('message');
      },
    );

    // Step 6: Message fades in as card exits
    // eslint-disable-next-line react-hooks/immutability
    messageOpacity.value = withDelay(
      TIMING.SWIPE_OUT - 100, // Start fading in near end of swipe
      withTiming(1, { duration: 150 }),
    );

    // After message is visible for 1.2s, start collapse
    animationTimeoutRef.current = setTimeout(() => {
      setAnimationPhase('collapsing');

      // Step 7: Message fades out (300ms)
      // eslint-disable-next-line react-hooks/immutability
      messageOpacity.value = withTiming(0, {
        duration: TIMING.MESSAGE_FADE,
        easing: Easing.out(Easing.ease),
      });

      // Step 8: Row collapses (400ms) - starts after message starts fading
      // eslint-disable-next-line react-hooks/immutability
      rowHeight.value = withDelay(
        100, // Small overlap with message fade
        withTiming(
          0,
          {
            duration: TIMING.COLLAPSE,
            easing: Easing.inOut(Easing.ease), // Smooth throughout
          },
          () => {
            runOnJS(handleAnimationDone)();
          },
        ),
      );
    }, TIMING.SWIPE_OUT + TIMING.MESSAGE_VISIBLE);
  }, [translateX, messageOpacity, rowHeight, reducedMotion, handleAnimationDone]);

  // Handle checkbox tap
  const handleToggleComplete = useCallback(() => {
    // If already past the undo phase, ignore
    if (
      animationPhase !== 'idle' &&
      animationPhase !== 'checked' &&
      animationPhase !== 'strikethrough' &&
      animationPhase !== 'waiting'
    ) {
      return;
    }

    // Step 1: Immediate feedback - haptic
    void triggerMedium();

    // Check if this is an UNDO tap
    if (
      animationPhase === 'checked' ||
      animationPhase === 'strikethrough' ||
      animationPhase === 'waiting'
    ) {
      // UNDO: User tapped during undo window
      if (undoTimeoutRef.current) {
        clearTimeout(undoTimeoutRef.current);
        undoTimeoutRef.current = null;
      }
      if (strikethroughTimeoutRef.current) {
        clearTimeout(strikethroughTimeoutRef.current);
        strikethroughTimeoutRef.current = null;
      }

      // Revert visual state
      setLocalChecked(false);
      setShowStrikethrough(false);
      setAnimationPhase('idle');
      // eslint-disable-next-line react-hooks/immutability
      checkboxScale.value = withSequence(
        withTiming(0.9, { duration: 50 }),
        withTiming(1, { duration: 100 }),
      );
      return;
    }

    // Starting completion animation
    setLocalChecked(true);
    setAnimationPhase('checked');

    // Step 1: Checkbox pop animation (150ms)
    // eslint-disable-next-line react-hooks/immutability
    checkboxScale.value = withSequence(
      withTiming(1.25, { duration: 75, easing: Easing.out(Easing.ease) }),
      withTiming(1, { duration: 75, easing: Easing.inOut(Easing.ease) }),
    );

    // Step 2: Pause (200ms), then Step 3: Strikethrough (400ms)
    strikethroughTimeoutRef.current = setTimeout(() => {
      setShowStrikethrough(true);
      setAnimationPhase('strikethrough');

      // After strikethrough, enter waiting/undo phase
      setTimeout(() => {
        setAnimationPhase('waiting');
      }, TIMING.STRIKETHROUGH);
    }, TIMING.CHECKBOX_FILL + TIMING.PAUSE_AFTER_CHECK);

    // Step 4: Undo window - total time before swipe starts
    const totalUndoTime =
      TIMING.CHECKBOX_FILL + TIMING.PAUSE_AFTER_CHECK + TIMING.STRIKETHROUGH + TIMING.UNDO_WINDOW;
    undoTimeoutRef.current = setTimeout(() => {
      // Undo window expired, proceed with animation
      startSwipeOutSequence();
    }, totalUndoTime);
  }, [animationPhase, checkboxScale, startSwipeOutSequence]);

  // Animated styles
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const rowAnimatedStyle = useAnimatedStyle(() => {
    // Only constrain height during collapse animation
    if (animationPhase === 'collapsing' || animationPhase === 'done') {
      return {
        height: rowHeight.value,
        overflow: 'hidden' as const,
      };
    }
    // During normal display, let content determine height
    return {};
  });

  const messageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: messageOpacity.value,
  }));

  const checkboxAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkboxScale.value }],
  }));

  // Handle layout measurement for accurate collapse animation
  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const { height } = event.nativeEvent.layout;
      if (animationPhase === 'idle' && height > 0) {
        setMeasuredHeight(height);
        // eslint-disable-next-line react-hooks/immutability
        rowHeight.value = height;
      }
    },
    [animationPhase, rowHeight],
  );

  // Determine visual checkbox state
  const showChecked = localChecked || isCompleted;

  // Don't render if animation is complete
  if (animationPhase === 'done') {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.rowWrapper,
        animationPhase === 'collapsing' ? { height: rowHeight.value, overflow: 'hidden' } : {},
      ]}
      onLayout={handleLayout}
    >
      {/* Completion message - revealed when card slides out */}
      <Animated.View style={[styles.messageContainer, messageAnimatedStyle]}>
        <Image source={GREMLY_FACE} style={styles.gremlyFace} resizeMode="contain" />
        <Text style={styles.messageText}>{completionMessage}</Text>
      </Animated.View>

      {/* Main card */}
      <Animated.View style={[styles.cardContainer, cardAnimatedStyle]}>
        {/* Divider line at top (not on first item) */}
        {!isFirst && <View style={styles.divider} />}

        <TouchableOpacity style={styles.rowContent} onPress={onPress} activeOpacity={0.7}>
          {/* Left: Title + Chips inline */}
          <View style={styles.leftContent}>
            <View style={styles.titleRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.title,
                  (isFuture || isFlexible) && styles.titleDimmed,
                  showStrikethrough && styles.titleCompleted,
                ]}
              >
                {item.name}
              </Text>
              <View style={styles.chips}>
                {/* Todo: time estimate chip */}
                {item.type === 'todo' && (
                  <View style={[styles.chip, styles.chipTodo]}>
                    <Text style={styles.chipText}>
                      {timeEstimateLabel ? `~${timeEstimateLabel}` : 'No time estimate'}
                    </Text>
                  </View>
                )}

                {/* Habit: frequency chip */}
                {item.type === 'habit' && frequencyLabel && (
                  <View style={[styles.chip, styles.chipHabit]}>
                    <Text style={styles.chipText}>{frequencyLabel}</Text>
                  </View>
                )}

                {/* Habit: progress chip (e.g., "5/7 this week") */}
                {item.type === 'habit' && habitMetadata && habitMetadata.label && (
                  <View style={[styles.chip, styles.chipHabit]}>
                    {MetadataIcon && (
                      <MetadataIcon
                        size={11}
                        color={habitMetadata.icon === 'Flame' ? '#D4A017' : '#666'}
                        style={styles.chipIcon}
                      />
                    )}
                    <Text
                      style={[
                        styles.chipText,
                        habitMetadata.icon === 'Flame' && styles.chipTextStreak,
                      ]}
                    >
                      {habitMetadata.label}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Right: Checkbox (vertically centered) */}
          <TouchableOpacity
            onPress={handleToggleComplete}
            style={styles.checkboxTouchArea}
            activeOpacity={0.7}
          >
            <Animated.View
              style={[
                styles.checkbox,
                showChecked && styles.checkboxChecked,
                checkboxAnimatedStyle,
              ]}
            >
              {showChecked && <Text style={styles.checkmark}>✓</Text>}
            </Animated.View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowWrapper: {
    position: 'relative',
    backgroundColor: '#FDF8F3',
  },
  cardContainer: {
    backgroundColor: '#FDF8F3',
    zIndex: 1,
  },
  messageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 0,
    backgroundColor: '#FDF8F3',
  },
  gremlyFace: {
    width: 26,
    height: 26,
    marginRight: 8,
  },
  messageText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2E5540',
  },
  divider: {
    height: 1,
    backgroundColor: '#EDEAE5', // Match TimeBlockSection item divider color
    marginHorizontal: 12, // Align with section content
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  leftContent: {
    flex: 1,
    marginRight: 12, // Small gap before checkbox
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0E1116', // charcoalInk - consistent for all items
    flexShrink: 1, // Allow title to shrink if needed
    marginRight: 8,
  },
  titleDimmed: {
    opacity: 0.5,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0, // Chips don't shrink
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)', // Muted gray - informational, not attention-grabbing
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    gap: 3,
  },
  chipTodo: {
    // No override - use base muted style
  },
  chipHabit: {
    // No override - use base muted style
  },
  chipIcon: {
    marginRight: 2,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555555', // Darker gray for better contrast
    lineHeight: 12,
  },
  chipTextStreak: {
    color: '#D4A017',
  },
  checkboxTouchArea: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginLeft: 'auto',
    marginRight: -8, // Push to right edge
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2E5540',
    borderColor: '#2E5540',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
    includeFontPadding: false, // Android fix
    textAlignVertical: 'center', // Android fix
  },
});

export default NowFocusRow;
