/**
 * NowFocusRow - Divider-style row for Today focus items
 *
 * Layout:
 * - Left accent bar (green for habits, blue for todos) for ALL items
 * - Title text gets full width
 * - Locked-in indicator moved to subtitle line: ◇ Locked in · Todo
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
import { Box, Text } from '../../ui';
import { useTokens } from '../../design/makeStyles';
import { useReducedMotion } from '../../design/animations';
import { triggerMedium } from '../../lib/haptics';
import type { NowLockedItem, NowActiveItem, NowFutureItem } from '../../lib/now/nowTypes';
import { NowTypeChip } from './NowTypeChip';

// Lock-in diamond icon
// eslint-disable-next-line @typescript-eslint/no-var-requires
const LOCKIN_ICON = require('../../assets/lockin icon.png');

// Gremly face icon for completion messages
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GREMLY_FACE = require('../../assets/buttonforHP.png');

// Screen width for swipe-out animation
const SCREEN_WIDTH = Dimensions.get('window').width;

// Accent colors for item types
const ACCENT_COLORS = {
  habit: '#2E5540', // Moss Green
  todo: '#4A7FBF', // Soft blue matching Todo chip background tone
} as const;

// Brand green for lock-in elements
const BRAND_GREEN = '#2E5540';

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

// Animation timing constants (in ms) - SLOWER for calm, rewarding feel
const TIMING = {
  CHECKBOX_FILL: 150, // Step 1: Checkbox fills
  PAUSE_AFTER_CHECK: 200, // Step 2: Brief pause
  STRIKETHROUGH: 400, // Step 3: Strikethrough animates
  UNDO_WINDOW: 1500, // Step 4: Undo window
  SWIPE_OUT: 500, // Step 5: Card swipes right
  MESSAGE_VISIBLE: 1200, // Step 6: Message holds
  MESSAGE_FADE: 300, // Step 7: Message fades
  COLLAPSE: 400, // Step 8: Cards slide up
};

// Row height including padding
const ROW_HEIGHT = 64; // Increased for more breathing room

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
  onPress?: () => void;
  onToggleComplete?: () => void;
  onAnimationComplete?: () => void;
}

export function NowFocusRow({
  item,
  isCompleted = false,
  isFuture = false,
  isLocked = false,
  isFirst = false,
  isLast: _isLast = false,
  onPress,
  onToggleComplete,
  onAnimationComplete,
}: NowFocusRowProps) {
  const tokens = useTokens();
  const reducedMotion = useReducedMotion();

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

  const accentColor = ACCENT_COLORS[item.type];

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
    onAnimationComplete?.();
  }, [onAnimationComplete]);

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
      // Undo window expired, proceed with completion
      onToggleComplete?.();
      startSwipeOutSequence();
    }, totalUndoTime);
  }, [animationPhase, checkboxScale, onToggleComplete, startSwipeOutSequence]);

  // Animated styles
  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    height: rowHeight.value,
    overflow: 'hidden' as const,
  }));

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
    <Animated.View style={[styles.rowWrapper, rowAnimatedStyle]} onLayout={handleLayout}>
      {/* Message revealed underneath - positioned absolutely behind the card */}
      <Animated.View style={[styles.messageContainer, messageAnimatedStyle]}>
        <Image source={GREMLY_FACE} style={styles.gremlyFace} resizeMode="contain" />
        <Text style={styles.messageText}>{completionMessage}</Text>
      </Animated.View>

      {/* Main card content - slides out to the right */}
      <Animated.View style={[styles.cardContainer, cardAnimatedStyle]}>
        {/* Top divider - only show if not first item */}
        {!isFirst && <View style={styles.divider} />}

        <TouchableOpacity style={styles.rowContainer} onPress={onPress} activeOpacity={0.7}>
          {/* Left accent bar - always shown for all items */}
          <View style={styles.leftIndicatorContainer}>
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
          </View>

          {/* Content area */}
          <Box style={styles.content}>
            {/* Text block */}
            <Box style={[styles.textContainer, isFuture && styles.futureText]}>
              {/* Title row - full width for task name */}
              <Text
                numberOfLines={1}
                style={[
                  styles.itemText,
                  { color: tokens.colors.text, fontFamily: tokens.typography.fontFamily.medium },
                  showStrikethrough && styles.itemTextCompleted,
                ]}
              >
                {item.name}
              </Text>

              {/* Subtitle row - includes locked-in indicator if applicable */}
              <Box style={styles.metaRow}>
                {/* Locked-in indicator at start of subtitle */}
                {isLocked && (
                  <>
                    <Image
                      source={LOCKIN_ICON}
                      style={styles.lockinIconSubtitle}
                      resizeMode="contain"
                    />
                    <Text style={styles.lockedInTextSubtitle}>Locked in</Text>
                    <Text style={styles.metaSeparator}> · </Text>
                  </>
                )}
                <NowTypeChip type={item.type} />
                {item.type === 'habit' && 'cadenceLabel' in item && item.cadenceLabel ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.cadenceLabel,
                      {
                        color: tokens.colors.subtle,
                        fontFamily: tokens.typography.fontFamily.regular,
                      },
                    ]}
                  >
                    {item.cadenceLabel}
                  </Text>
                ) : null}
              </Box>
            </Box>

            {/* Checkbox */}
            <TouchableOpacity
              onPress={handleToggleComplete}
              style={styles.checkboxContainer}
              activeOpacity={0.7}
            >
              <Animated.View
                style={[
                  styles.checkbox,
                  { borderColor: showChecked ? tokens.colors.mossGreen : tokens.colors.subtle },
                  showChecked && { backgroundColor: tokens.colors.mossGreen },
                  checkboxAnimatedStyle,
                ]}
              >
                {showChecked && <Text style={styles.checkmark}>✓</Text>}
              </Animated.View>
            </TouchableOpacity>
          </Box>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowWrapper: {
    position: 'relative',
    backgroundColor: '#FDF8F3', // Match page background
    overflow: 'hidden', // Required for collapse animation
  },
  cardContainer: {
    backgroundColor: '#FDF8F3', // Match page background
    zIndex: 1, // Card sits above message
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
    zIndex: 0, // Message is behind card
    backgroundColor: '#FDF8F3', // Ensure message area has background
  },
  gremlyFace: {
    width: 26,
    height: 26,
    marginRight: 8,
  },
  messageText: {
    fontSize: 15,
    fontWeight: '500',
    color: BRAND_GREEN,
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 14, // Increased bottom padding for breathing room
    paddingRight: 4,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
    marginLeft: 20,
  },
  leftIndicatorContainer: {
    width: 20,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  accentBar: {
    width: 3,
    height: 36, // Slightly taller to match new row height
    borderRadius: 4,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  futureText: {
    opacity: 0.6,
  },
  itemText: {
    fontSize: 14,
    lineHeight: 18,
  },
  itemTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5, // Slightly more space between title and subtitle
  },
  // Locked-in indicator in subtitle
  lockinIconSubtitle: {
    width: 12,
    height: 12,
    marginRight: 3,
  },
  lockedInTextSubtitle: {
    fontSize: 11,
    lineHeight: 13,
    color: BRAND_GREEN,
    fontWeight: '500',
  },
  metaSeparator: {
    fontSize: 11,
    lineHeight: 13,
    color: '#999',
  },
  cadenceLabel: {
    marginLeft: 4,
    fontSize: 11,
    lineHeight: 13,
  },
  checkboxContainer: {
    marginLeft: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
});

export default NowFocusRow;
