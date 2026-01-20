/**
 * useSweepHabitGesture - Shared gesture logic for sweep habit rows
 *
 * Extracts common animation, haptic, and state management logic
 * used by both SweepBuildHabitRow and SweepBreakHabitRow components.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Confirmation messages - shown when build habit is completed
const BUILD_CONFIRM_MESSAGES = [
  'BOOM',
  'Smashed it',
  'Another one',
  'Done',
  'Nailed it',
  'Got it',
  'Crushed it',
];

// Bonus messages - shown when completing a habit already ahead of target
const BONUS_MESSAGES = [
  'BONUS!',
  'Extra credit',
  'Overachiever',
  'Going hard',
  'Legend',
  'Above & beyond',
  'On fire 🔥',
];

// Break habit messages - shown when resisting a break habit
const BREAK_CONFIRM_MESSAGES = [
  'Stayed strong',
  'Another day',
  'Still going',
  'Held steady',
  'Resisted',
  'On track',
  'Going strong',
];

export interface UseSweepHabitGestureParams {
  id: string;
  isCompleted: boolean;
  onToggle: (id: string, completed: boolean) => void;
  isAheadOfTarget?: boolean;
  isBreakHabit?: boolean;
}

export interface UseSweepHabitGestureReturn {
  progress: SharedValue<number>;
  confirmMessage: string;
  isCompletedState: SharedValue<boolean>;
  triggerHaptic: (type: 'light' | 'medium' | 'success') => void;
  handleComplete: () => void;
  handleUncomplete: () => void;
  resetProgress: () => void;
  confirmTextAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  checkAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useSweepHabitGesture({
  id,
  isCompleted,
  onToggle,
  isAheadOfTarget = false,
  isBreakHabit = false,
}: UseSweepHabitGestureParams): UseSweepHabitGestureReturn {
  // Shared values for animations - store in refs to avoid dependency issues
  const progress = useSharedValue(isCompleted ? 1 : 0);
  const isCompletedState = useSharedValue(isCompleted);

  // Confirmation animation values
  const confirmTextOpacity = useSharedValue(0);
  const confirmTextScale = useSharedValue(0.8);
  const checkScale = useSharedValue(0);

  // Store shared values in refs for stable access in callbacks
  const sharedValuesRef = useRef({
    progress,
    isCompletedState,
    confirmTextOpacity,
    confirmTextScale,
    checkScale,
  });

  // Confirmation message state
  const [confirmMessage, setConfirmMessage] = useState('');

  // Sync with isCompleted prop changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sv = sharedValuesRef.current;
    sv.progress.value = withSpring(isCompleted ? 1 : 0, {
      damping: 20,
      stiffness: 300,
    });
    sv.isCompletedState.value = isCompleted;

    // Show/hide confirmation based on completion state
    if (isCompleted) {
      sv.confirmTextOpacity.value = withTiming(1, { duration: 200 });
      sv.confirmTextScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      sv.checkScale.value = withSpring(1, { damping: 10, stiffness: 300 });
    } else {
      sv.confirmTextOpacity.value = withTiming(0, { duration: 150 });
      sv.checkScale.value = withTiming(0, { duration: 150 });
      setConfirmMessage('');
    }
  }, [isCompleted]);

  // Haptic feedback
  const triggerHaptic = useCallback((type: 'light' | 'medium' | 'success') => {
    if (type === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (type === 'medium') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // Handle completion
  const handleComplete = useCallback(() => {
    triggerHaptic('success');

    // Select appropriate message array
    let messages: string[];
    if (isBreakHabit) {
      messages = BREAK_CONFIRM_MESSAGES;
    } else if (isAheadOfTarget) {
      messages = BONUS_MESSAGES;
    } else {
      messages = BUILD_CONFIRM_MESSAGES;
    }

    // Randomly select message
    const msg = messages[Math.floor(Math.random() * messages.length)];
    setConfirmMessage(msg);

    // Animate confirmation text in
    const sv = sharedValuesRef.current;
    sv.confirmTextOpacity.value = 0;
    sv.confirmTextScale.value = 0.8;
    sv.confirmTextOpacity.value = withTiming(1, { duration: 200 });
    sv.confirmTextScale.value = withSpring(1, { damping: 12, stiffness: 200 });

    // Animate checkmark in
    sv.checkScale.value = 0;
    sv.checkScale.value = withSpring(1, { damping: 10, stiffness: 300 });

    // Update state
    sv.isCompletedState.value = true;

    // Notify parent
    onToggle(id, true);
  }, [id, onToggle, triggerHaptic, isAheadOfTarget, isBreakHabit]);

  // Handle uncomplete
  const handleUncomplete = useCallback(() => {
    triggerHaptic('light');

    const sv = sharedValuesRef.current;
    // Animate confirmation text out
    sv.confirmTextOpacity.value = withTiming(0, { duration: 150 });
    sv.checkScale.value = withTiming(0, { duration: 150 });
    setConfirmMessage('');

    // Update state
    sv.isCompletedState.value = false;

    // Notify parent
    onToggle(id, false);
  }, [id, onToggle, triggerHaptic]);

  // Reset progress animation
  const resetProgress = useCallback(() => {
    sharedValuesRef.current.progress.value = withSpring(0, {
      damping: 15,
      stiffness: 400,
    });
  }, []);

  // Animated style for confirmation text
  const confirmTextAnimatedStyle = useAnimatedStyle(() => ({
    opacity: confirmTextOpacity.value,
    transform: [{ scale: confirmTextScale.value }],
  }));

  // Animated style for checkmark
  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  return {
    progress,
    confirmMessage,
    isCompletedState,
    triggerHaptic,
    handleComplete,
    handleUncomplete,
    resetProgress,
    confirmTextAnimatedStyle,
    checkAnimatedStyle,
  };
}

export default useSweepHabitGesture;
