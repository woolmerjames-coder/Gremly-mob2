/**
 * SwipeHintText - Subtle action hints for sweep cards
 *
 * Two lines of small text showing what's selected and what swipes do.
 * Arrows have subtle pulse animation to draw attention.
 */

import React, { useMemo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Text } from '../../../ui';
import { BRAND } from '../../../design/brand';
import { format } from 'date-fns';

interface SwipeHintTextProps {
  candidateKind: 'todo' | 'note' | 'habit';
  // For todos and logs
  selectedQuickAction?:
    | 'tomorrow'
    | 'nextweek'
    | 'pickdate'
    | 'remindlater'
    | 'nextsweep'
    | 'justsave'
    | 'addtospace'
    | 'maketodo'
    | null;
  // For habits
  selectedHabitAction?: 'asktomorrow' | 'starttomorrow' | 'startmonday' | 'pickdate' | null;
  // Confirmed dates
  confirmedCustomDate?: Date | null;
  confirmedRemindDate?: Date | null;
}

export function SwipeHintText({
  candidateKind,
  selectedQuickAction,
  selectedHabitAction,
  confirmedCustomDate,
  confirmedRemindDate,
}: SwipeHintTextProps) {
  // Right arrow animation - pulses right
  const rightArrowTranslate = useSharedValue(0);

  useEffect(() => {
    rightArrowTranslate.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const rightArrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rightArrowTranslate.value }],
  }));

  // Left arrow animation - pulses left
  const leftArrowTranslate = useSharedValue(0);

  useEffect(() => {
    leftArrowTranslate.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const leftArrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: leftArrowTranslate.value }],
  }));

  // Build right hint text based on selection
  const rightHintContent = useMemo(() => {
    // Todos
    if (candidateKind === 'todo') {
      switch (selectedQuickAction) {
        case 'tomorrow':
          return { text: 'Set due tomorrow', needsAction: false };
        case 'nextweek':
          return { text: 'Set due next week', needsAction: false };
        case 'pickdate':
          if (confirmedCustomDate) {
            return { text: `Set due ${format(confirmedCustomDate, 'MMM d')}`, needsAction: false };
          }
          return { text: 'Pick a due date', needsAction: true };
        case 'remindlater':
          if (confirmedRemindDate) {
            return {
              text: `Set reminder for ${format(confirmedRemindDate, 'MMM d')}`,
              needsAction: false,
            };
          }
          return { text: 'Pick a reminder date', needsAction: true };
        default:
          return { text: 'Set due tomorrow', needsAction: false };
      }
    }

    // Habits
    if (candidateKind === 'habit') {
      switch (selectedHabitAction) {
        case 'asktomorrow':
          return { text: 'Decide tomorrow', needsAction: false };
        case 'starttomorrow':
          return { text: 'Start tomorrow', needsAction: false };
        case 'startmonday':
          return { text: 'Start Monday', needsAction: false };
        case 'pickdate':
          if (confirmedCustomDate) {
            return { text: `Start ${format(confirmedCustomDate, 'MMM d')}`, needsAction: false };
          }
          return { text: 'Pick a start date', needsAction: true };
        default:
          return { text: 'Decide tomorrow', needsAction: false };
      }
    }

    // Logs/Notes
    switch (selectedQuickAction) {
      case 'justsave':
        return { text: 'Keep as note', needsAction: false };
      case 'remindlater':
        if (confirmedRemindDate) {
          return {
            text: `Set reminder for ${format(confirmedRemindDate, 'MMM d')}`,
            needsAction: false,
          };
        }
        return { text: 'Pick a reminder date', needsAction: true };
      case 'addtospace':
        return { text: 'Add to a space', needsAction: false };
      case 'maketodo':
        return { text: 'Convert to todo', needsAction: false };
      default:
        return { text: 'Keep as note', needsAction: false };
    }
  }, [
    candidateKind,
    selectedQuickAction,
    selectedHabitAction,
    confirmedCustomDate,
    confirmedRemindDate,
  ]);

  // Left hint text based on card type
  const leftHintText = useMemo(() => {
    if (candidateKind === 'habit') return 'swipe left to remove';
    return 'swipe left to archive';
  }, [candidateKind]);

  return (
    <View style={styles.container}>
      {/* Right hint line */}
      <View style={styles.hintRow}>
        <Text style={styles.actionText}>{rightHintContent.text}</Text>
        <Text style={styles.midText}>
          {rightHintContent.needsAction ? ' · then swipe right ' : ' · swipe right to confirm '}
        </Text>
        <Animated.Text style={[styles.rightArrow, rightArrowStyle]}>→</Animated.Text>
      </View>

      {/* Left hint line */}
      <View style={styles.hintRow}>
        <Animated.Text style={[styles.leftArrow, leftArrowStyle]}>←</Animated.Text>
        <Text style={styles.leftText}> {leftHintText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    alignItems: 'center',
    gap: 6,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  midText: {
    fontSize: 12,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
  },
  rightArrow: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.mossGreen,
  },
  leftArrow: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  leftText: {
    fontSize: 12,
    fontWeight: '400',
    color: BRAND.colors.inkMuted,
  },
});

export default SwipeHintText;
