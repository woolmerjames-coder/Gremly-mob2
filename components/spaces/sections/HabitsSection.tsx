/**
 * HabitsSection - Compact habit list with streak indicators
 *
 * Features:
 * - Left-aligned progress indicator
 * - Flame icon + streak count on right
 * - Shows all habits (typically 2-4)
 * - Section hides when empty
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Circle, CheckCircle2, Flame } from 'lucide-react-native';
import { BRAND } from '../../../design/brand';
import type { Habit } from '../../../lib/types';

interface HabitProgress {
  done: number;
  target: number;
}

interface HabitsSectionProps {
  habits: Habit[];
  progressMap: Map<string, HabitProgress>;
  streakMap: Map<string, number>;
  onHabitPress: (habit: Habit) => void;
  onHabitLog: (habit: Habit) => void;
}

export function HabitsSection({
  habits,
  progressMap,
  streakMap,
  onHabitPress,
  onHabitLog,
}: HabitsSectionProps) {
  const count = habits.length;

  // Hide section if no habits
  if (count === 0) {
    return null;
  }

  return (
    <View style={styles.container} testID="habits-section">
      {/* Section Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Habits <Text style={styles.headerCount}>({count})</Text>
        </Text>
      </View>

      {/* Habit Rows */}
      <View style={styles.list}>
        {habits.map((habit) => {
          const progress = progressMap.get(habit.id);
          const streak = streakMap.get(habit.id) ?? 0;
          return (
            <HabitRow
              key={habit.id}
              habit={habit}
              progress={progress}
              streak={streak}
              onPress={() => onHabitPress(habit)}
              onLog={() => onHabitLog(habit)}
            />
          );
        })}
      </View>
    </View>
  );
}

interface HabitRowProps {
  habit: Habit;
  progress?: HabitProgress;
  streak: number;
  onPress: () => void;
  onLog: () => void;
}

function HabitRow({ habit, progress, streak, onPress, onLog }: HabitRowProps) {
  const isDoneToday = progress ? progress.done >= progress.target : false;

  return (
    <View style={styles.row}>
      {/* Left: Checkbox/Progress indicator */}
      <Pressable
        onPress={onLog}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        style={styles.checkbox}
        accessibilityRole="button"
        accessibilityLabel={`Log progress for ${habit.name}`}
        testID={`habit-checkbox-${habit.id}`}
      >
        {isDoneToday ? (
          <CheckCircle2 size={22} color={BRAND.colors.mossGreen} />
        ) : (
          <Circle size={22} color={BRAND.colors.inkMuted} />
        )}
      </Pressable>

      {/* Middle: Habit name */}
      <Pressable
        onPress={onPress}
        style={styles.rowContent}
        accessibilityRole="button"
        accessibilityLabel={`Open ${habit.name}`}
        testID={`habit-row-${habit.id}`}
      >
        <Text style={styles.rowText} numberOfLines={1}>
          {habit.name}
        </Text>
      </Pressable>

      {/* Right: Streak indicator */}
      {streak > 0 && (
        <View style={styles.streakContainer}>
          <Flame size={16} color="#E07C3E" />
          <Text style={styles.streakText}>{streak}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.colors.inkMuted,
  },
  headerCount: {
    fontWeight: '400',
  },
  list: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
  },
  checkbox: {
    marginRight: 12,
  },
  rowContent: {
    flex: 1,
  },
  rowText: {
    fontSize: 16,
    color: BRAND.colors.charcoalInk,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E07C3E',
  },
});

export default HabitsSection;
