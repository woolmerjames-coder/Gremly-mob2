/**
 * useCompletionAnimation - Reusable hook for row completion animation
 *
 * Provides the same satisfying completion animation used in Today's Focus:
 * 1. Checkbox fill with scale pop
 * 2. Strikethrough text
 * 3. Undo window (tap again to undo)
 * 4. Swipe-out to reveal message
 * 5. Row height collapse
 *
 * This hook can be used by NowFocusRow, OverdueSection rows, or any other
 * completable row component.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Dimensions } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../design/animations';
import { triggerMedium } from '../../lib/haptics';

// Screen width for swipe-out animation
const SCREEN_WIDTH = Dimensions.get('window').width;

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
export const COMPLETION_TIMING = {
  CHECKBOX_FILL: 150, // Step 1: Checkbox fills
  PAUSE_AFTER_CHECK: 200, // Step 2: Brief pause
  STRIKETHROUGH: 400, // Step 3: Strikethrough animates
  UNDO_WINDOW: 1500, // Step 4: Undo window
  SWIPE_OUT: 500, // Step 5: Card swipes right
  MESSAGE_VISIBLE: 1200, // Step 6: Message holds
  MESSAGE_FADE: 300, // Step 7: Message fades
  COLLAPSE: 400, // Step 8: Cards slide up
};

export type AnimationPhase =
  | 'idle'
  | 'checked'
  | 'strikethrough'
  | 'waiting'
  | 'swiping'
  | 'message'
  | 'collapsing'
  | 'done';

export interface UseCompletionAnimationOptions {
  /** Initial row height for collapse animation */
  initialHeight?: number;
  /** Callback when animation completes and item should be removed */
  onComplete?: () => void;
  /** Callback when animation finishes (after collapse) */
  onAnimationEnd?: () => void;
}

export interface UseCompletionAnimationReturn {
  // State
  animationPhase: AnimationPhase;
  localChecked: boolean;
  showStrikethrough: boolean;
  completionMessage: string;
  isDone: boolean;

  // Handlers
  handleToggleComplete: () => void;
  handleLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;

  // Animated styles
  rowAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  cardAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  messageAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  checkboxAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useCompletionAnimation(
  options: UseCompletionAnimationOptions = {},
): UseCompletionAnimationReturn {
  const { initialHeight = 44, onComplete, onAnimationEnd } = options;
  const reducedMotion = useReducedMotion();

  // Animation state
  const [animationPhase, setAnimationPhase] = useState<AnimationPhase>('idle');
  const [localChecked, setLocalChecked] = useState(false);
  const [showStrikethrough, setShowStrikethrough] = useState(false);
  const [completionMessage] = useState(
    () => COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)],
  );
  const [measuredHeight, setMeasuredHeight] = useState(initialHeight);

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
    onComplete?.(); // Update data AFTER animation completes
    onAnimationEnd?.();
  }, [onComplete, onAnimationEnd]);

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
        duration: COMPLETION_TIMING.SWIPE_OUT,
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
      COMPLETION_TIMING.SWIPE_OUT - 100, // Start fading in near end of swipe
      withTiming(1, { duration: 150 }),
    );

    // After message is visible for 1.2s, start collapse
    animationTimeoutRef.current = setTimeout(() => {
      setAnimationPhase('collapsing');

      // Step 7: Message fades out (300ms)
      // eslint-disable-next-line react-hooks/immutability
      messageOpacity.value = withTiming(0, {
        duration: COMPLETION_TIMING.MESSAGE_FADE,
        easing: Easing.out(Easing.ease),
      });

      // Step 8: Row collapses (400ms) - starts after message starts fading
      // eslint-disable-next-line react-hooks/immutability
      rowHeight.value = withDelay(
        100, // Small overlap with message fade
        withTiming(
          0,
          {
            duration: COMPLETION_TIMING.COLLAPSE,
            easing: Easing.inOut(Easing.ease), // Smooth throughout
          },
          () => {
            runOnJS(handleAnimationDone)();
          },
        ),
      );
    }, COMPLETION_TIMING.SWIPE_OUT + COMPLETION_TIMING.MESSAGE_VISIBLE);
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
      }, COMPLETION_TIMING.STRIKETHROUGH);
    }, COMPLETION_TIMING.CHECKBOX_FILL + COMPLETION_TIMING.PAUSE_AFTER_CHECK);

    // Step 4: Undo window - total time before swipe starts
    const totalUndoTime =
      COMPLETION_TIMING.CHECKBOX_FILL +
      COMPLETION_TIMING.PAUSE_AFTER_CHECK +
      COMPLETION_TIMING.STRIKETHROUGH +
      COMPLETION_TIMING.UNDO_WINDOW;
    undoTimeoutRef.current = setTimeout(() => {
      // Undo window expired, proceed with animation
      startSwipeOutSequence();
    }, totalUndoTime);
  }, [animationPhase, checkboxScale, startSwipeOutSequence]);

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

  return {
    // State
    animationPhase,
    localChecked,
    showStrikethrough,
    completionMessage,
    isDone: animationPhase === 'done',

    // Handlers
    handleToggleComplete,
    handleLayout,

    // Animated styles
    rowAnimatedStyle,
    cardAnimatedStyle,
    messageAnimatedStyle,
    checkboxAnimatedStyle,
  };
}
